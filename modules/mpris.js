// MPRIS over the session bus: which players exist, what they report, and the
// four commands the extension sends them.
//
// Only plumbing lives here. Turning properties into something to show is
// modules/model.js's job, so this file never decides anything a test would
// want to check — which is why it is excluded from Vitest and exercised
// instead by scripts/mpris-check.js against the real bus.
//
// It imports no resource:// module, so it also runs under plain gjs.
//
// Flatpak players reach the bus through xdg-dbus-proxy and need their manifest
// to grant `own` on org.mpris.MediaPlayer2.<name>; Spotify's does. Nothing on
// this side has to know the player is sandboxed.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { BUS_PREFIX, samePlayer, toPlayer } from './model.js';

const OBJECT_PATH = '/org/mpris/MediaPlayer2';

const DBUS_NAME = 'org.freedesktop.DBus';
const DBUS_PATH = '/org/freedesktop/DBus';

// Only the members the extension uses. A proxy exposes what its interface
// info declares, so anything left out here is simply never read.
const RootProxy = Gio.DBusProxy.makeProxyWrapper(`
<node>
  <interface name="org.mpris.MediaPlayer2">
    <method name="Raise"/>
    <property name="CanRaise" type="b" access="read"/>
    <property name="Identity" type="s" access="read"/>
  </interface>
</node>`);

const PlayerProxy = Gio.DBusProxy.makeProxyWrapper(`
<node>
  <interface name="org.mpris.MediaPlayer2.Player">
    <method name="PlayPause"/>
    <method name="Next"/>
    <method name="Previous"/>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="CanControl" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
    <property name="CanPause" type="b" access="read"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
  </interface>
</node>`);

/**
 * The cached properties of a proxy as a plain object.
 *
 * @param {Gio.DBusProxy} proxy A proxy with its properties loaded.
 * @returns {object} Property name -> fully unpacked value.
 */
function readProperties(proxy) {
    return Object.fromEntries(
        (proxy.get_cached_property_names() ?? []).map(name => [
            name,
            proxy.get_cached_property(name).recursiveUnpack(),
        ]),
    );
}

/** Tracks every MPRIS player on a bus. */
export class MprisWatcher {
    /**
     * @param {{bus?: Gio.DBusConnection}} [options] The bus; the session bus
     *   by default.
     */
    constructor({ bus = Gio.DBus.session } = {}) {
        this._bus = bus;
        this._cancellable = new Gio.Cancellable();
        // Bus name -> {root, player, ids, snapshot}
        this._entries = new Map();
        this._tick = 0;
        this._onChange = null;
        this._subscription = 0;
    }

    /**
     * Start watching. `onChange` is called with no arguments whenever a
     * player appears, disappears or changes; read `players` from it.
     *
     * @param {Function} onChange Change callback.
     */
    start(onChange) {
        this._onChange = onChange;

        // Subscribed before listing, so a player that starts in between is
        // seen by one or the other. _add ignores the duplicate.
        this._subscription = this._bus.signal_subscribe(
            DBUS_NAME,
            DBUS_NAME,
            'NameOwnerChanged',
            DBUS_PATH,
            'org.mpris.MediaPlayer2',
            Gio.DBusSignalFlags.MATCH_ARG0_NAMESPACE,
            (_bus, _sender, _path, _iface, _signal, parameters) => {
                const [name, oldOwner, newOwner] = parameters.deepUnpack();
                if (oldOwner) this._remove(name);
                if (newOwner) this._add(name);
            },
        );

        this._bus.call(
            DBUS_NAME,
            DBUS_PATH,
            DBUS_NAME,
            'ListNames',
            null,
            new GLib.VariantType('(as)'),
            Gio.DBusCallFlags.NONE,
            -1,
            this._cancellable,
            (bus, result) => {
                try {
                    const [names] = bus.call_finish(result).deepUnpack();
                    for (const name of names) this._add(name);
                } catch (error) {
                    this._warn('listing players', error);
                }
            },
        );
    }

    /** @returns {object[]} A snapshot of each player that is ready. */
    get players() {
        return [...this._entries.values()].map(entry => entry.snapshot).filter(Boolean);
    }

    /** @param {string} busName Player to toggle. */
    playPause(busName) {
        this._send(busName, 'PlayPause', ({ player }) => player.PlayPauseAsync());
    }

    /** @param {string} busName Player to skip forward. */
    next(busName) {
        this._send(busName, 'Next', ({ player }) => player.NextAsync());
    }

    /** @param {string} busName Player to skip back. */
    previous(busName) {
        this._send(busName, 'Previous', ({ player }) => player.PreviousAsync());
    }

    /** @param {string} busName Player to bring to the front. */
    raise(busName) {
        this._send(busName, 'Raise', ({ root }) => root.RaiseAsync());
    }

    /** Stop watching and drop every proxy. Idempotent. */
    destroy() {
        this._cancellable.cancel();
        this._onChange = null;

        if (this._subscription) {
            this._bus.signal_unsubscribe(this._subscription);
            this._subscription = 0;
        }

        for (const entry of this._entries.values()) this._release(entry);
        this._entries.clear();
    }

    _add(busName) {
        if (!busName.startsWith(BUS_PREFIX) || this._entries.has(busName)) return;

        const entry = { root: null, player: null, ids: [], snapshot: null };
        this._entries.set(busName, entry);

        this._connect(busName, entry).catch(error => {
            // The player may have quit before its proxies were ready.
            if (this._entries.get(busName) === entry) this._entries.delete(busName);
            this._warn(busName, error);
        });
    }

    async _connect(busName, entry) {
        // DO_NOT_AUTO_START: watching must never launch a player.
        // GET_INVALIDATED_PROPERTIES: some players announce a change by
        // invalidating a property instead of sending its value, and without
        // this the proxy just drops it from the cache — the tile would lose
        // the track until the next full update.
        const flags =
            Gio.DBusProxyFlags.DO_NOT_AUTO_START |
            Gio.DBusProxyFlags.GET_INVALIDATED_PROPERTIES;
        const load = Wrapper =>
            Wrapper.newAsync(this._bus, busName, OBJECT_PATH, this._cancellable, flags);
        const [root, player] = await Promise.all([load(RootProxy), load(PlayerProxy)]);

        // Removed, or the watcher destroyed, while the proxies were loading.
        if (this._entries.get(busName) !== entry) return;

        entry.root = root;
        entry.player = player;
        entry.ids = [
            [root, root.connect('g-properties-changed', () => this._refresh(busName))],
            [
                player,
                player.connect('g-properties-changed', () => this._refresh(busName)),
            ],
        ];
        this._refresh(busName);
    }

    _refresh(busName) {
        const entry = this._entries.get(busName);
        if (!entry?.player) return;

        this._tick += 1;
        const snapshot = toPlayer(
            busName,
            readProperties(entry.root),
            readProperties(entry.player),
            entry.snapshot,
            this._tick,
        );

        // Nothing on screen would change, so neither does anything else.
        if (samePlayer(entry.snapshot, snapshot)) return;
        entry.snapshot = snapshot;
        this._onChange?.();
    }

    _remove(busName) {
        const entry = this._entries.get(busName);
        if (!entry) return;

        this._entries.delete(busName);
        this._release(entry);
        this._onChange?.();
    }

    _release(entry) {
        for (const [proxy, id] of entry.ids) proxy.disconnect(id);
        entry.ids = [];
        entry.root = null;
        entry.player = null;
    }

    _send(busName, method, call) {
        const entry = this._entries.get(busName);
        // A player whose proxies are still loading has nothing to send to.
        if (!entry?.player) return;
        call(entry).catch(error => this._warn(`${busName} ${method}`, error));
    }

    _warn(what, error) {
        if (error?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) return;
        console.warn(`[quickmusic] ${what}: ${error?.message ?? error}`);
    }
}
