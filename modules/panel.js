// The Shell side: the quick settings tile, its menu, and the top bar item.
//
// Nothing here decides anything about a player. Which one to show, what its
// flags allow and whether the top bar item is visible all come from
// modules/model.js; this file only turns those answers into actors.
//
// Every string from a player is set as `text`, never as markup. St.Label only
// parses markup when clutter_text.use_markup is set, and nothing here sets it,
// so a track titled "<b>" shows as exactly that.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

import {
    artistLine,
    canToggle,
    ellipsize,
    formatLabel,
    panelVisible,
    selectPlayer,
} from './model.js';
import { KEYS, SettingsWatcher } from './settings.js';

/** The top bar role. One per extension, so the uuid-like name is enough. */
const ROLE = 'quickmusic';

/**
 * Opacity for secondary lines. Dimming the actor rather than setting a color
 * keeps the theme's own text color, so it reads in both the dark and the light
 * Shell style.
 */
const DIM = 178;

/** Keys that activate a focused top bar item, as they would a button. */
const ACTIVATE_KEYS = new Set([
    Clutter.KEY_Return,
    Clutter.KEY_KP_Enter,
    Clutter.KEY_space,
]);

const ICONS = Object.freeze({
    PLAY: 'media-playback-start-symbolic',
    PAUSE: 'media-playback-pause-symbolic',
    PREVIOUS: 'media-skip-backward-symbolic',
    NEXT: 'media-skip-forward-symbolic',
    NO_ART: 'audio-x-generic-symbolic',
});

/**
 * The cover art icon for a url modules/model.js already vetted, or the
 * generic one. The same construction the Shell's own media message uses; GVfs
 * does the fetching for https.
 *
 * @param {string} url A url from safeArtUrl, or ''.
 * @returns {Gio.Icon} The icon.
 */
function artIcon(url) {
    if (!url) return new Gio.ThemedIcon({ name: ICONS.NO_ART });
    return new Gio.FileIcon({ file: Gio.File.new_for_uri(url) });
}

/** The icon for the play/pause control: what pressing it would do next. */
function playPauseIcon(player) {
    return player?.status === 'Playing' ? ICONS.PAUSE : ICONS.PLAY;
}

/** Ask the player to play or pause, if it says it would accept that. */
function togglePlayback(source, player) {
    if (canToggle(player)) source.playPause(player.busName);
}

/**
 * Put a value into a translated "%s" template.
 *
 * Not String.prototype.format: the Shell installs that, Node does not, and a
 * function replacer keeps a "$&" in a player's name from being read as a
 * replacement pattern.
 */
function fill(template, value) {
    return template.replace('%s', () => value);
}

/** A single-line label that ellipsizes rather than widening the menu. */
function lineLabel(styleClass, opacity = 255) {
    const label = new St.Label({ style_class: styleClass, x_expand: true, opacity });
    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return label;
}

/** A round icon button, as the Shell's own media controls draw them. */
function iconButton(iconName, accessibleName) {
    return new St.Button({
        style_class: 'icon-button quickmusic-button',
        can_focus: true,
        accessible_name: accessibleName,
        child: new St.Icon({ icon_name: iconName }),
    });
}

/**
 * The track and its controls: cover art with title, artist and album, then
 * previous / play-pause / next, then "Open <player>". Built into a menu the
 * caller owns, so the tile menu and the top bar popup share one design.
 *
 * A plain class, not a GObject: it owns no actor of its own, only rows it
 * added to someone else's menu, which destroys them with itself.
 */
class Controls {
    /**
     * @param {PopupMenu.PopupMenuBase} menu Menu to build into.
     * @param {{source: object, gettext: Function}} options The player
     *   source to send commands to, and the extension's gettext.
     */
    constructor(menu, { source, gettext: _ }) {
        this._source = source;
        this._gettext = _;
        this._player = null;
        this._artUrl = null;

        this._trackRow = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'quickmusic-track',
        });
        this._art = new St.Icon({ style_class: 'quickmusic-art' });
        this._title = lineLabel('quickmusic-title');
        this._artist = lineLabel('quickmusic-artist', DIM);
        this._album = lineLabel('quickmusic-album', DIM);

        const text = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        text.add_child(this._title);
        text.add_child(this._artist);
        text.add_child(this._album);
        this._trackRow.add_child(this._art);
        this._trackRow.add_child(text);
        menu.addMenuItem(this._trackRow);

        this._buttonRow = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'quickmusic-controls',
        });
        const buttons = new St.BoxLayout({
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            style_class: 'quickmusic-controls-box',
        });
        this._previous = iconButton(ICONS.PREVIOUS, _('Previous track'));
        this._playPause = iconButton(ICONS.PLAY, _('Play or pause'));
        this._next = iconButton(ICONS.NEXT, _('Next track'));
        for (const button of [this._previous, this._playPause, this._next])
            buttons.add_child(button);
        this._buttonRow.add_child(buttons);
        menu.addMenuItem(this._buttonRow);

        this._previous.connectObject(
            'clicked',
            () => this._send(busName => this._source.previous(busName)),
            this,
        );
        this._playPause.connectObject(
            'clicked',
            () => this._send(busName => this._source.playPause(busName)),
            this,
        );
        this._next.connectObject(
            'clicked',
            () => this._send(busName => this._source.next(busName)),
            this,
        );

        this._raise = new PopupMenu.PopupMenuItem('');
        this._raise.connectObject(
            'activate',
            () => this._send(busName => this._source.raise(busName)),
            this,
        );
        menu.addMenuItem(this._raise);

        this.sync(null);
    }

    /** @param {object|null} player The player to show, or null for none. */
    sync(player) {
        const _ = this._gettext;
        this._player = player;

        const track = player?.track;
        this._title.text = track?.title || player?.identity || _('No media');
        this._artist.text = track ? artistLine(track) : '';
        this._artist.visible = Boolean(this._artist.text);
        this._album.text = track?.album ?? '';
        this._album.visible = Boolean(this._album.text);

        // Only replace the icon when the url changes: a new FileIcon makes St
        // load the image again, and players update Metadata more often than
        // they change tracks.
        const artUrl = track?.artUrl ?? '';
        if (artUrl !== this._artUrl) {
            this._art.gicon = artIcon(artUrl);
            this._artUrl = artUrl;
        }

        this._previous.reactive = Boolean(player?.canGoPrevious);
        this._next.reactive = Boolean(player?.canGoNext);
        this._playPause.reactive = canToggle(player);
        this._playPause.child.icon_name = playPauseIcon(player);
        this._buttonRow.visible = Boolean(player);

        this._raise.visible = Boolean(player?.canRaise);
        this._raise.label.text = player ? fill(_('Open %s'), player.identity) : '';
    }

    _send(command) {
        if (this._player) command(this._player.busName);
    }

    /** Disconnect from the buttons. The owning menu destroys the rows. */
    destroy() {
        for (const actor of [this._previous, this._playPause, this._next, this._raise])
            actor.disconnectObject(this);
        this._source = null;
        this._player = null;
    }
}

const QuickMusicToggle = GObject.registerClass(
    class QuickMusicToggle extends QuickSettings.QuickMenuToggle {
        /**
         * @param {{gicon: Gio.Icon, source: object, settings: Gio.Settings,
         *   gettext: Function}} options Dependencies.
         */
        _init({ gicon, source, settings, gettext: _ }) {
            // toggleMode false: a click asks the player to toggle, and the
            // tile's checked state follows what the player then reports.
            super._init({ title: _('No media'), gicon, toggleMode: false });

            this._gicon = gicon;
            this._source = source;
            this._settings = settings;
            this._gettext = _;
            this._player = null;
            this._pickerSignature = null;

            this.menu.setHeader(gicon, _('Now playing'), '');
            this._controls = new Controls(this.menu, { source, gettext: _ });

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._picker = new PopupMenu.PopupSubMenuMenuItem(_('Player'), false);
            this.menu.addMenuItem(this._picker);

            this.connectObject(
                'clicked',
                () => togglePlayback(this._source, this._player),
                this,
            );
            // A plain connect, as ButtonBox does: connectObject with this as
            // its own owner could be released by the destroy it is meant to
            // handle.
            this.connect('destroy', () => this._onDestroy());
        }

        /**
         * @param {object[]} players Every running player.
         * @param {object|null} player The one shown.
         * @param {string} pinnedKey The pinned player's key, or ''.
         */
        sync(players, player, pinnedKey) {
            const _ = this._gettext;
            this._player = player;

            if (player) {
                const { track } = player;
                this.title = track.title || player.identity;
                this.subtitle =
                    artistLine(track) || (track.title ? player.identity : '');
            } else {
                this.title = _('No media');
                this.subtitle = '';
            }
            this.checked = player?.status === 'Playing';
            this.reactive = Boolean(player);

            const status = {
                Playing: _('Playing'),
                Paused: _('Paused'),
                Stopped: _('Stopped'),
            };
            this.menu.setHeader(
                this._gicon,
                player?.identity ?? _('Now playing'),
                player ? status[player.status] : '',
            );

            this._controls.sync(player);
            this._syncPicker(players, pinnedKey);
        }

        /**
         * One row per player key plus "Automatic", checked where the pin is.
         * A pin whose player is not running keeps a row of its own, so the
         * pin stays visible and can still be undone from here.
         *
         * Rebuilt only when the set of players or the pin changes, so an open
         * submenu is not torn down under the pointer on every track change.
         */
        _syncPicker(players, pinnedKey) {
            const _ = this._gettext;

            const byKey = new Map();
            for (const player of players)
                if (!byKey.has(player.key)) byKey.set(player.key, player.identity);
            if (pinnedKey && !byKey.has(pinnedKey))
                byKey.set(pinnedKey, fill(_('%s (not running)'), pinnedKey));

            this._picker.label.text = pinnedKey
                ? fill(_('Player: %s'), byKey.get(pinnedKey))
                : _('Player: Automatic');

            const signature = JSON.stringify([pinnedKey, [...byKey]]);
            if (signature === this._pickerSignature) return;
            this._pickerSignature = signature;

            this._picker.menu.removeAll();
            const add = (label, key) => {
                const item = new PopupMenu.PopupMenuItem(label);
                item.setOrnament(
                    key === pinnedKey
                        ? PopupMenu.Ornament.CHECK
                        : PopupMenu.Ornament.NONE,
                );
                item.connect('activate', () =>
                    this._settings.set_string(KEYS.PINNED_PLAYER, key),
                );
                this._picker.menu.addMenuItem(item);
            };

            add(_('Automatic'), '');
            for (const [key, identity] of byKey) add(identity, key);
        }

        // From the destroy signal rather than a destroy() override, which
        // an actor destroyed from C — by its parent, say — never calls.
        _onDestroy() {
            this._controls?.destroy();
            this._controls = null;
            this._source = null;
            // The Shell parents this menu into the quick settings overlay and
            // never destroys it (Shell 50.3 quickSettings.js has no destroy
            // call), so without this every disable — every screen lock — would
            // leave a menu, its rows and its focus group behind.
            this.menu.destroy();
        }
    },
);

const QuickMusicButton = GObject.registerClass(
    class QuickMusicButton extends PanelMenu.Button {
        /**
         * @param {{source: object, gettext: Function}} options Dependencies.
         */
        _init({ source, gettext: _ }) {
            // dontCreateMenu: the stock button opens its menu on any press.
            // Here the primary button plays and pauses, so the popup is ours
            // and opened by the secondary button alone.
            super._init(0.5, 'QuickMusic', true);

            this._source = source;
            this._gettext = _;
            this._player = null;

            const box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });
            this._icon = new St.Icon({
                icon_name: ICONS.PLAY,
                style_class: 'system-status-icon',
            });
            this._label = new St.Label({
                style_class: 'quickmusic-panel-label',
                y_align: Clutter.ActorAlign.CENTER,
            });
            box.add_child(this._icon);
            box.add_child(this._label);
            this.add_child(box);

            this._popup = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP);
            this._popup.actor.add_style_class_name('panel-menu');
            Main.uiGroup.add_child(this._popup.actor);
            this._popup.actor.hide();
            // The panel's own manager, so moving the pointer between this and
            // another open top bar menu switches between them as usual.
            Main.panel.menuManager.addMenu(this._popup);
            this._controls = new Controls(this._popup, { source, gettext: _ });

            // Stock PanelMenu.Button highlights itself only for its own menu.
            this._popup.connect('open-state-changed', (_menu, open) => {
                if (open) this.add_style_pseudo_class('active');
                else this.remove_style_pseudo_class('active');
            });
            // StWidget emits popup-menu for the Menu key and Shift+F10.
            this.connectObject('popup-menu', () => this._popup.open(), this);

            const primary = new Clutter.ClickGesture({
                required_button: Clutter.BUTTON_PRIMARY,
            });
            primary.connectObject(
                'recognize',
                () => togglePlayback(this._source, this._player),
                this,
            );
            this.add_action(primary);

            const secondary = new Clutter.ClickGesture({
                required_button: Clutter.BUTTON_SECONDARY,
                recognize_on_press: true,
            });
            secondary.connectObject('recognize', () => this._popup.toggle(), this);
            this.add_action(secondary);
        }

        /**
         * @param {object|null} player The player shown.
         * @param {number} maxChars Label width limit.
         */
        sync(player, maxChars) {
            const _ = this._gettext;
            this._player = player;
            this._icon.icon_name = playPauseIcon(player);

            const label = player ? formatLabel(player.track, player.identity) : '';
            this._label.text = ellipsize(label, maxChars);
            // The visible label may be cut short; a screen reader gets it
            // whole, with what activating the item would do.
            this.accessible_name = !player
                ? 'QuickMusic'
                : fill(
                      player.status === 'Playing' ? _('Pause %s') : _('Play %s'),
                      label,
                  );

            this._controls.sync(player);
        }

        /** Hide, closing the popup rather than leaving it on a hidden anchor. */
        conceal() {
            this._popup?.close();
            this.visible = false;
        }

        vfunc_key_press_event(event) {
            if (ACTIVATE_KEYS.has(event.get_key_symbol())) {
                togglePlayback(this._source, this._player);
                return Clutter.EVENT_STOP;
            }
            return super.vfunc_key_press_event(event);
        }

        _onDestroy() {
            this._controls?.destroy();
            this._controls = null;
            this._popup?.destroy();
            this._popup = null;
            this._source = null;
            super._onDestroy();
        }
    },
);

/** Builds the tile and top bar item and keeps them in step with the source. */
export class Panel {
    /**
     * @param {{source: object, settings: Gio.Settings, iconPath: string,
     *   gettext: Function}} options Dependencies: the player source
     *   (modules/mpris.js's MprisWatcher, or a fake), the extension's settings,
     *   the tile icon and gettext.
     */
    constructor({ source, settings, iconPath, gettext }) {
        this._source = source;
        this._settings = settings;
        this._iconPath = iconPath;
        this._gettext = gettext;

        this._indicator = null;
        this._toggle = null;
        this._button = null;
        this._watcher = null;
        this._player = null;
        this._lastActive = '';
        this._shown = null;
    }

    enable() {
        const gicon = Gio.icon_new_for_string(this._iconPath);

        this._toggle = new QuickMusicToggle({
            gicon,
            source: this._source,
            settings: this._settings,
            gettext: this._gettext,
        });
        this._toggle.connectObject('destroy', () => this._onShellDestroyed(), this);
        this._indicator = new QuickSettings.SystemIndicator();
        this._indicator.quickSettingsItems.push(this._toggle);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

        this._watcher = new SettingsWatcher(this._settings);
        this._watcher.watch(KEYS.SHOW_PANEL_INDICATOR, () => this.sync());
        this._watcher.watch(KEYS.PANEL_MAX_CHARS, () => this.sync());
        this._watcher.watch(KEYS.PINNED_PLAYER, () => this.sync());

        this._source.start(() => this.sync());
        this.sync();
    }

    /** Recompute the shown player and push it to both surfaces. */
    sync() {
        if (!this._toggle) return;

        const players = this._source.players;
        const pinnedKey = this._settings.get_string(KEYS.PINNED_PLAYER);
        const player = selectPlayer(players, {
            pinnedKey,
            lastActive: this._lastActive,
        });
        if (player) this._lastActive = player.busName;
        this._player = player;

        // scripts/headless-check.sh waits on this line to prove a player on
        // the bus reached the tile. The player's name and state only — never
        // the track, which is the user's listening history.
        const shown = player ? `${player.key} ${player.status}` : 'none';
        if (shown !== this._shown) {
            this._shown = shown;
            console.debug(`[quickmusic] showing ${shown}`);
        }

        this._toggle.sync(players, player, pinnedKey);
        this._syncButton();
    }

    /** Create, update or remove the top bar item as the setting says. */
    _syncButton() {
        const enabled = this._settings.get_boolean(KEYS.SHOW_PANEL_INDICATOR);
        if (!enabled) {
            this._destroyButton();
            return;
        }

        if (!this._button) {
            this._button = new QuickMusicButton({
                source: this._source,
                gettext: this._gettext,
            });
            Main.panel.addToStatusArea(ROLE, this._button, 0, 'right');
            // addToStatusArea registers the button's dummy menu, whose actor
            // is the button itself. With the popup registered for the same
            // button, the manager opens the popup whenever the pointer enters
            // it, and the first click only closes it again.
            Main.panel.menuManager.removeMenu(this._button.menu);
            this._button.connectObject('destroy', () => this._onShellDestroyed(), this);
        }

        this._button.sync(this._player, this._settings.get_int(KEYS.PANEL_MAX_CHARS));
        if (panelVisible({ enabled, player: this._player }))
            this._button.visible = true;
        else this._button.conceal();
    }

    _destroyButton() {
        this._button?.disconnectObject(this);
        this._button?.destroy();
        this._button = null;
    }

    /**
     * The Shell destroyed the tile or the top bar item itself, as it does to
     * every actor when it exits, without a disable. A player can still change
     * before it is gone, so let go of both: sync() then stops at the missing
     * tile rather than updating, or recreating, actors that are being torn
     * down. Our own destroys disconnect first and never come here.
     */
    _onShellDestroyed() {
        this._toggle = null;
        this._button = null;
    }

    disable() {
        this._watcher?.release();
        this._watcher = null;

        this._destroyButton();

        // The Shell reparents the toggle into the quick settings grid, so it
        // goes first, then its indicator.
        this._toggle?.disconnectObject(this);
        this._toggle?.destroy();
        this._toggle = null;
        this._indicator?.destroy();
        this._indicator = null;

        this._player = null;
        this._shown = null;
    }
}
