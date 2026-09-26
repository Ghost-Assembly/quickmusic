// The extension's settings, written down once.
//
// This file imports nothing. prefs.js runs in a process with no access to
// gnome-shell's resource:// modules and must be able to load it, and Vitest has
// to reach it on plain Node so tests/settings.test.js can check it against the
// gschema.

/**
 * Schema keys.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const KEYS = Object.freeze({
    SHOW_PANEL_INDICATOR: 'show-panel-indicator',
    PANEL_MAX_CHARS: 'panel-max-chars',
    PINNED_PLAYER: 'pinned-player',
});

/**
 * Each setting with the type the gschema declares and the wording prefs.js
 * shows for it.
 *
 * @type {ReadonlyArray<{key: string, type: string, label: string, detail: string}>}
 */
export const SETTINGS = Object.freeze([
    Object.freeze({
        key: KEYS.SHOW_PANEL_INDICATOR,
        type: 'b',
        label: 'Show in the top bar',
        detail: 'Artist and title in the top bar while playing or paused',
    }),
    Object.freeze({
        key: KEYS.PANEL_MAX_CHARS,
        type: 'i',
        label: 'Top bar label width',
        detail: 'Characters shown before the label is cut short',
    }),
    Object.freeze({
        key: KEYS.PINNED_PLAYER,
        type: 's',
        label: 'Pinned player',
        detail: 'Chosen from the Quick Settings menu; empty follows the active player',
    }),
]);

/**
 * Just the keys, for callers that only need to enumerate them.
 *
 * @type {ReadonlyArray<string>}
 */
export const ALL_KEYS = Object.freeze(SETTINGS.map(setting => setting.key));

/**
 * A group of settings handlers that are released together.
 *
 * Gio.Settings has no connectObject, so a `changed::` handler has to be
 * disconnected by the id its connect returned. Same shape as quicktiler's.
 */
export class SettingsWatcher {
    /**
     * @param {Gio.Settings} settings Settings to watch.
     */
    constructor(settings) {
        this._settings = settings;
        this._ids = [];
    }

    /**
     * Watch one key.
     *
     * @param {string} key Settings key to watch.
     * @param {Function} callback Called when it changes.
     */
    watch(key, callback) {
        this._ids.push(this._settings.connect(`changed::${key}`, callback));
    }

    /** Disconnect everything watched so far. Idempotent. */
    release() {
        for (const id of this._ids) this._settings.disconnect(id);
        this._ids = [];
    }
}
