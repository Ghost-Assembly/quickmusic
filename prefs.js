// Preferences. Runs in its own process, with no access to gnome-shell's
// resource:// modules — so nothing here may import modules/panel.js.
//
// It holds only widget construction; the key list and wording live in
// modules/settings.js, which imports nothing and is tested on plain Node. This
// file is excluded from coverage for that reason.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { KEYS, SETTINGS } from './modules/settings.js';

/**
 * How modules/settings.js describes one key.
 *
 * @param {string} key A key from KEYS.
 * @returns {{label: string, detail: string}} Its untranslated wording.
 */
function describe(key) {
    return SETTINGS.find(setting => setting.key === key);
}

export default class QuickMusicPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();

        const topBar = new Adw.PreferencesGroup({
            title: _('Top bar'),
            description: _(
                'Left-click plays and pauses; right-click opens the controls.',
            ),
        });

        const show = describe(KEYS.SHOW_PANEL_INDICATOR);
        const showRow = new Adw.SwitchRow({
            title: _(show.label),
            subtitle: _(show.detail),
        });
        settings.bind(
            KEYS.SHOW_PANEL_INDICATOR,
            showRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT,
        );
        topBar.add(showRow);

        const width = describe(KEYS.PANEL_MAX_CHARS);
        const widthRow = new Adw.SpinRow({
            title: _(width.label),
            subtitle: _(width.detail),
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 120,
                step_increment: 1,
                page_increment: 10,
            }),
        });
        settings.bind(
            KEYS.PANEL_MAX_CHARS,
            widthRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT,
        );
        settings.bind(
            KEYS.SHOW_PANEL_INDICATOR,
            widthRow,
            'sensitive',
            Gio.SettingsBindFlags.GET,
        );
        topBar.add(widthRow);
        page.add(topBar);

        const players = new Adw.PreferencesGroup({ title: _('Players') });
        const pinned = describe(KEYS.PINNED_PLAYER);
        const pinnedRow = new Adw.ActionRow({ title: _(pinned.label) });
        const forget = new Gtk.Button({
            label: _('Forget'),
            valign: Gtk.Align.CENTER,
        });
        forget.connect('clicked', () => settings.set_string(KEYS.PINNED_PLAYER, ''));
        pinnedRow.add_suffix(forget);

        const syncPinned = () => {
            const key = settings.get_string(KEYS.PINNED_PLAYER);
            pinnedRow.subtitle = key || _(pinned.detail);
            forget.sensitive = Boolean(key);
        };
        const pinnedId = settings.connect(`changed::${KEYS.PINNED_PLAYER}`, syncPinned);
        syncPinned();
        players.add(pinnedRow);
        page.add(players);

        window.connect('close-request', () => {
            settings.disconnect(pinnedId);
            return false;
        });
        window.add(page);
    }
}
