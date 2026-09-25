// Fakes for the two things the panel is handed: settings and a player source.

import { KEYS } from '../../modules/settings.js';
import { BUS_PREFIX, toPlayer } from '../../modules/model.js';

/**
 * An in-memory Gio.Settings covering the calls the extension makes.
 *
 * @param {object} [values] Initial values by key.
 */
export function createSettings(values = {}) {
    const state = new Map([
        [KEYS.SHOW_PANEL_INDICATOR, true],
        [KEYS.PANEL_MAX_CHARS, 40],
        [KEYS.PINNED_PLAYER, ''],
        ...Object.entries(values),
    ]);

    const handlers = new Map();
    let nextId = 1;

    return {
        /** Live handler ids, so a test can prove they were disconnected. */
        connected: handlers,

        get_boolean: key => Boolean(state.get(key)),
        get_int: key => Number(state.get(key) ?? 0),
        get_string: key => String(state.get(key) ?? ''),

        set_boolean(key, value) {
            state.set(key, Boolean(value));
            this.emitChange(key);
        },

        set_int(key, value) {
            state.set(key, Number(value));
            this.emitChange(key);
        },

        set_string(key, value) {
            state.set(key, String(value));
            this.emitChange(key);
        },

        connect(signal, callback) {
            const id = nextId++;
            handlers.set(id, { signal, callback });
            return id;
        },

        disconnect(id) {
            handlers.delete(id);
        },

        /** Fire `changed::<key>` as GSettings would. */
        emitChange(key) {
            for (const { signal, callback } of [...handlers.values()])
                if (signal === `changed::${key}`) callback(this, key);
        },
    };
}

/**
 * A stand-in for modules/mpris.js's MprisWatcher: same surface, no D-Bus.
 *
 * Tests add, update and remove players on it and read back the calls the panel
 * made, rather than asserting against a mock's call log.
 */
export function createSource() {
    const players = new Map();
    let listener = null;
    let tick = 0;

    const source = {
        /** Every control call the panel made, as [method, busName]. */
        calls: [],
        started: false,
        destroyed: false,

        start(onChange) {
            listener = onChange;
            source.started = true;
        },

        get players() {
            return [...players.values()];
        },

        playPause: busName => source.calls.push(['playPause', busName]),
        next: busName => source.calls.push(['next', busName]),
        previous: busName => source.calls.push(['previous', busName]),
        raise: busName => source.calls.push(['raise', busName]),

        destroy() {
            source.destroyed = true;
            listener = null;
        },

        /**
         * Add or update a player, as a PropertiesChanged would.
         *
         * @param {string} name Bus name suffix, e.g. 'spotify'.
         * @param {object} [player] Player-interface properties to override.
         * @param {object} [root] Root-interface properties to override.
         */
        set(name, player = {}, root = {}) {
            const busName = `${BUS_PREFIX}${name}`;
            tick += 1;
            players.set(
                busName,
                toPlayer(
                    busName,
                    { Identity: name, CanRaise: true, ...root },
                    {
                        PlaybackStatus: 'Playing',
                        CanControl: true,
                        CanPlay: true,
                        CanPause: true,
                        CanGoNext: true,
                        CanGoPrevious: true,
                        Metadata: {
                            'xesam:title': `${name} title`,
                            'xesam:artist': [`${name} artist`],
                            'xesam:album': `${name} album`,
                            'mpris:artUrl': 'https://example.com/art.jpg',
                        },
                        ...player,
                    },
                    players.get(busName) ?? null,
                    tick,
                ),
            );
            listener?.();
        },

        remove(name) {
            players.delete(`${BUS_PREFIX}${name}`);
            listener?.();
        },
    };

    return source;
}
