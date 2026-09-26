import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Clutter from './stubs/gi-clutter.js';
import * as Main from './stubs/shell-main.js';
import {
    PopupMenuItem,
    PopupSubMenuMenuItem,
    Ornament,
} from './stubs/shell-popupmenu.js';
import { descendants, liveHandlers, resetActors } from './support/actors.js';
import { createSettings, createSource } from './support/world.js';

import { Panel } from '../modules/panel.js';
import { BUS_PREFIX } from '../modules/model.js';
import { KEYS } from '../modules/settings.js';

const SPOTIFY = `${BUS_PREFIX}spotify`;

function setup(values = {}) {
    const settings = createSettings(values);
    const source = createSource();
    const panel = new Panel({
        source,
        settings,
        iconPath: '/nonexistent/quickmusic-symbolic.svg',
        gettext: message => message,
    });
    panel.enable();

    const toggle = () => Main.externalIndicators.at(-1).indicator.quickSettingsItems[0];
    const button = () => Main.statusItems.get('quickmusic')?.indicator ?? null;

    return { settings, source, panel, toggle, button };
}

/** Every St.Button under an actor, keyed by accessible name. */
function buttonsIn(actor) {
    return Object.fromEntries(
        descendants(actor)
            .filter(child => child.accessible_name)
            .map(child => [child.accessible_name, child]),
    );
}

/** A key press, as vfunc_key_press_event receives it. */
const keyEvent = symbol => ({ get_key_symbol: () => symbol });

/** The label under an actor whose style class is given. */
function labelIn(actor, styleClass) {
    return descendants(actor).find(child => child.style_class === styleClass);
}

/** The labels under an actor, in order, as their text. */
function textsIn(actor) {
    return descendants(actor)
        .filter(child => child.clutter_text)
        .map(child => child.text);
}

beforeEach(() => {
    Main.reset();
    resetActors();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('the quick settings tile', () => {
    it('is added once, showing no media', () => {
        const { toggle } = setup();

        expect(Main.externalIndicators).toHaveLength(1);
        expect(toggle().title).toBe('No media');
        expect(toggle().subtitle).toBe('');
        expect(toggle().checked).toBe(false);
        expect(toggle().reactive).toBe(false);
    });

    it('shows the playing track', () => {
        const { source, toggle } = setup();

        source.set('spotify');

        expect(toggle().title).toBe('spotify title');
        expect(toggle().subtitle).toBe('spotify artist');
        expect(toggle().checked).toBe(true);
        expect(toggle().reactive).toBe(true);
    });

    it('unchecks when paused', () => {
        const { source, toggle } = setup();

        source.set('spotify');
        source.set('spotify', { PlaybackStatus: 'Paused' });

        expect(toggle().checked).toBe(false);
        expect(toggle().title).toBe('spotify title');
    });

    it('falls back to the player name without a track', () => {
        const { source, toggle } = setup();

        source.set('spotify', { Metadata: {} }, { Identity: 'Spotify' });

        expect(toggle().title).toBe('Spotify');
        expect(toggle().subtitle).toBe('');
    });

    it('asks the player to toggle when clicked', () => {
        const { source, toggle } = setup();
        source.set('spotify');

        toggle().click();

        expect(source.calls).toEqual([['playPause', SPOTIFY]]);
    });

    it('does not send a toggle the player refuses', () => {
        const { source, toggle } = setup();
        source.set('spotify', { CanPause: false });

        toggle().click();

        expect(source.calls).toEqual([]);
    });

    it('goes back to no media when the player quits', () => {
        const { source, toggle } = setup();
        source.set('spotify');

        source.remove('spotify');

        expect(toggle().title).toBe('No media');
        expect(toggle().reactive).toBe(false);
    });

    // One name for the empty state, on the tile and in its menu alike.
    it('says no media in the menu too', () => {
        const { toggle } = setup();
        expect(labelIn(toggle().menu, 'quickmusic-title').text).toBe('No media');
    });

    it('puts the player and its state in the menu header', () => {
        const { source, toggle } = setup();

        source.set('spotify', { PlaybackStatus: 'Paused' }, { Identity: 'Spotify' });

        expect(toggle().menu.header.title).toBe('Spotify');
        expect(toggle().menu.header.subtitle).toBe('Paused');
    });
});

describe('the controls', () => {
    it('show title, artist and album', () => {
        const { source, toggle } = setup();

        source.set('spotify');

        expect(textsIn(toggle().menu)).toEqual(
            expect.arrayContaining([
                'spotify title',
                'spotify artist',
                'spotify album',
            ]),
        );
    });

    // Another application wrote this string. It must reach the label as text.
    it('never turn on markup', () => {
        const { source, toggle } = setup();

        source.set('spotify', { Metadata: { 'xesam:title': '<b>bold</b>' } });

        const labels = descendants(toggle().menu).filter(child => child.clutter_text);
        expect(labels.map(label => label.text)).toContain('<b>bold</b>');
        for (const label of labels) expect(label.clutter_text.use_markup).toBe(false);
    });

    // A hard-coded color would vanish in one of the Shell's two styles, so the
    // secondary lines are dimmed and keep the theme's own color.
    it('dim artist and album by opacity rather than color', () => {
        const { source, toggle } = setup();
        source.set('spotify');

        for (const styleClass of ['quickmusic-artist', 'quickmusic-album']) {
            const label = labelIn(toggle().menu, styleClass);
            expect(label.opacity).toBeLessThan(255);
            expect(label.opacity).toBeGreaterThan(127);
        }
    });

    it('load cover art only from the vetted url', () => {
        const { source, toggle } = setup();

        source.set('spotify');
        const art = descendants(toggle().menu).find(child =>
            child.style_class?.includes('quickmusic-art'),
        );
        expect(art.gicon.file.uri).toBe('https://example.com/art.jpg');

        source.set('spotify', {
            Metadata: { 'xesam:title': 't', 'mpris:artUrl': 'smb://host/a.jpg' },
        });
        expect(art.gicon.file).toBeUndefined();
        expect(art.gicon.name).toBe('audio-x-generic-symbolic');
    });

    it('send previous, play/pause and next to the shown player', () => {
        const { source, toggle } = setup();
        source.set('spotify');
        const buttons = buttonsIn(toggle().menu);

        buttons['Previous track'].click();
        buttons['Play or pause'].click();
        buttons['Next track'].click();

        expect(source.calls).toEqual([
            ['previous', SPOTIFY],
            ['playPause', SPOTIFY],
            ['next', SPOTIFY],
        ]);
    });

    it('follow the Can* flags', () => {
        const { source, toggle } = setup();
        source.set('spotify', { CanGoNext: false, CanGoPrevious: false });
        const buttons = buttonsIn(toggle().menu);

        expect(buttons['Previous track'].reactive).toBe(false);
        expect(buttons['Next track'].reactive).toBe(false);
        expect(buttons['Play or pause'].reactive).toBe(true);

        buttons['Next track'].click();
        expect(source.calls).toEqual([]);
    });

    it('show pause while playing and play while paused', () => {
        const { source, toggle } = setup();
        source.set('spotify');
        const playPause = buttonsIn(toggle().menu)['Play or pause'];

        expect(playPause.child.icon_name).toBe('media-playback-pause-symbolic');
        source.set('spotify', { PlaybackStatus: 'Paused' });
        expect(playPause.child.icon_name).toBe('media-playback-start-symbolic');
    });

    it('offer to open a player that can be raised', () => {
        const { source, toggle } = setup();
        source.set('spotify', {}, { Identity: 'Spotify' });

        const open = toggle().menu.items.find(
            item => item instanceof PopupMenuItem && item.text === 'Open Spotify',
        );
        expect(open.visible).toBe(true);

        open.activate();
        expect(source.calls).toEqual([['raise', SPOTIFY]]);
    });

    it('hide the open row when the player cannot be raised', () => {
        const { source, toggle } = setup();

        source.set('chromium.instance2', {}, { Identity: 'Chrome', CanRaise: false });

        const open = toggle().menu.items.find(
            item => item instanceof PopupMenuItem && item.text === 'Open Chrome',
        );
        expect(open.visible).toBe(false);
    });
});

describe('the player picker', () => {
    const picker = toggle =>
        toggle().menu.items.find(item => item instanceof PopupSubMenuMenuItem);

    it('lists Automatic and each player once', () => {
        const { source, toggle } = setup();
        source.set('spotify', {}, { Identity: 'Spotify' });
        source.set('chromium.instance1', {}, { Identity: 'Chrome' });
        source.set('chromium.instance2', {}, { Identity: 'Chrome' });

        expect(picker(toggle).menu.items.map(item => item.text)).toEqual([
            'Automatic',
            'Spotify',
            'Chrome',
        ]);
        expect(picker(toggle).text).toBe('Player: Automatic');
        expect(picker(toggle).menu.items[0].ornament).toBe(Ornament.CHECK);
    });

    it('pins the chosen player', () => {
        const { settings, source, toggle } = setup();
        source.set('spotify', { PlaybackStatus: 'Paused' }, { Identity: 'Spotify' });
        source.set('chromium.instance2', {}, { Identity: 'Chrome' });
        expect(toggle().title).toBe('chromium.instance2 title');

        picker(toggle).menu.items[1].activate();

        expect(settings.get_string(KEYS.PINNED_PLAYER)).toBe('spotify');
        expect(toggle().title).toBe('spotify title');
        expect(picker(toggle).text).toBe('Player: Spotify');
        expect(picker(toggle).menu.items[1].ornament).toBe(Ornament.CHECK);
    });

    it('unpins with Automatic', () => {
        const { settings, source, toggle } = setup({ [KEYS.PINNED_PLAYER]: 'spotify' });
        source.set('spotify', {}, { Identity: 'Spotify' });

        picker(toggle).menu.items[0].activate();

        expect(settings.get_string(KEYS.PINNED_PLAYER)).toBe('');
    });

    // Otherwise the label says Automatic while nothing in the list is checked,
    // and the pin is invisible until its player comes back.
    it('shows a pin whose player is not running', () => {
        const { source, toggle } = setup({ [KEYS.PINNED_PLAYER]: 'spotify' });
        source.set('chromium.instance2', {}, { Identity: 'Chrome' });

        const items = picker(toggle).menu.items;
        expect(picker(toggle).text).toBe('Player: spotify (not running)');
        expect(items.map(item => item.text)).toEqual([
            'Automatic',
            'Chrome',
            'spotify (not running)',
        ]);
        expect(items.map(item => item.ornament)).toEqual([
            Ornament.NONE,
            Ornament.NONE,
            Ornament.CHECK,
        ]);
    });

    // Rebuilding on every Metadata update would tear an open submenu down
    // under the pointer.
    it('is not rebuilt when only the track changes', () => {
        const { source, toggle } = setup();
        source.set('spotify');
        const before = picker(toggle).menu.items[1];

        source.set('spotify', { Metadata: { 'xesam:title': 'next song' } });

        expect(picker(toggle).menu.items[1]).toBe(before);
    });
});

describe('the top bar item', () => {
    it('shows artist and title while playing', () => {
        const { source, button } = setup();

        source.set('spotify');

        expect(button().visible).toBe(true);
        expect(textsIn(button())[0]).toBe('spotify artist – spotify title');
        expect(Main.statusItems.get('quickmusic').box).toBe('right');
    });

    it('is hidden with no player, and once the player stops', () => {
        const { source, button } = setup();
        expect(button().visible).toBe(false);

        source.set('spotify');
        source.set('spotify', { PlaybackStatus: 'Stopped' });

        expect(button().visible).toBe(false);
    });

    // Otherwise the click that paused it would take away the way to resume.
    it('stays visible while paused, to resume from', () => {
        const { source, button } = setup();
        source.set('spotify');
        const [primary] = button().actions;

        source.set('spotify', { PlaybackStatus: 'Paused' });

        expect(button().visible).toBe(true);
        const icon = descendants(button()).find(child => child.icon_name);
        expect(icon.icon_name).toBe('media-playback-start-symbolic');
        primary.recognize();
        expect(source.calls).toEqual([['playPause', SPOTIFY]]);
    });

    // The real manager opens a managed menu when the pointer enters its
    // source actor while another managed menu of that actor has the event.
    // With the dummy still registered, the popup opened on hover and the
    // first click only closed it.
    it('leaves its popup the only managed menu for it', () => {
        const { source, button } = setup();
        source.set('spotify');

        const menus = Main.managedMenus.filter(menu => menu.sourceActor === button());

        expect(menus).toHaveLength(1);
        expect(menus[0].dummy).toBeUndefined();
    });

    it('closes its popup when it hides', () => {
        const { source } = setup();
        source.set('spotify');
        const popup = Main.managedMenus.at(-1);
        popup.open();

        source.set('spotify', { PlaybackStatus: 'Stopped' });

        expect(popup.isOpen).toBe(false);
    });

    it('cuts the label to the configured width', () => {
        const { settings, source, button } = setup();
        source.set('spotify');

        settings.set_int(KEYS.PANEL_MAX_CHARS, 10);

        expect(textsIn(button())[0]).toBe('spotify a…');
    });

    it('plays and pauses on a left click and opens on a right click', () => {
        const { source, button } = setup();
        source.set('spotify');
        const [primary, secondary] = button().actions;
        const popup = Main.managedMenus.at(-1);

        expect(primary.required_button).toBe(1);
        expect(secondary.required_button).toBe(3);

        primary.recognize();
        expect(source.calls).toEqual([['playPause', SPOTIFY]]);
        expect(popup.isOpen).toBe(false);

        secondary.recognize();
        expect(popup.isOpen).toBe(true);
    });

    // The stock PanelMenu.Button opens its menu on any press, which would
    // make a left click do two things.
    it('asks for no stock menu', () => {
        const { button } = setup();
        expect(button().dontCreateMenu).toBe(true);
    });

    describe('from the keyboard', () => {
        it.each([
            ['Return', Clutter.KEY_Return],
            ['Enter', Clutter.KEY_KP_Enter],
            ['Space', Clutter.KEY_space],
        ])('plays and pauses on %s', (_name, symbol) => {
            const { source, button } = setup();
            source.set('spotify');

            const result = button().vfunc_key_press_event(keyEvent(symbol));

            expect(result).toBe(Clutter.EVENT_STOP);
            expect(source.calls).toEqual([['playPause', SPOTIFY]]);
        });

        it('opens the popup on the Menu key', () => {
            const { source, button } = setup();
            source.set('spotify');

            button().vfunc_key_press_event(keyEvent(Clutter.KEY_Menu));

            expect(Main.managedMenus.at(-1).isOpen).toBe(true);
        });

        it('leaves other keys to the base class', () => {
            const { source, button } = setup();
            source.set('spotify');

            const result = button().vfunc_key_press_event(keyEvent(Clutter.KEY_a));

            expect(result).toBe(Clutter.EVENT_PROPAGATE);
            expect(source.calls).toEqual([]);
        });
    });

    it('tells a screen reader what is playing', () => {
        const { source, button } = setup();
        source.set('spotify');
        expect(button().accessible_name).toBe('Pause spotify artist – spotify title');

        source.set('spotify', { PlaybackStatus: 'Paused' }, { Identity: 'x' });
        expect(button().accessible_name).toBe('Play spotify artist – spotify title');
    });

    // As stock PanelMenu.Button does for its own menu.
    it('is highlighted while its popup is open', () => {
        const { source, button } = setup();
        source.set('spotify');
        const popup = Main.managedMenus.at(-1);

        popup.open();
        expect(button().pseudoClasses.has('active')).toBe(true);

        popup.close();
        expect(button().pseudoClasses.has('active')).toBe(false);
    });

    it('carries the same controls as the tile', () => {
        const { source } = setup();
        source.set('spotify');

        const popup = Main.managedMenus.at(-1);
        buttonsIn(popup)['Next track'].click();

        expect(source.calls).toEqual([['next', SPOTIFY]]);
    });

    it('is removed when the setting is turned off, and comes back', () => {
        const { settings, source, button } = setup();
        source.set('spotify');

        settings.set_boolean(KEYS.SHOW_PANEL_INDICATOR, false);
        expect(button()).toBeNull();

        settings.set_boolean(KEYS.SHOW_PANEL_INDICATOR, true);
        expect(button().visible).toBe(true);
    });

    it('is never created when the setting starts off', () => {
        const { source, button } = setup({ [KEYS.SHOW_PANEL_INDICATOR]: false });
        source.set('spotify');

        expect(button()).toBeNull();
    });
});

describe('following players', () => {
    it('switches to the player that starts playing', () => {
        const { source, toggle } = setup();
        source.set('spotify');
        source.set('spotify', { PlaybackStatus: 'Paused' });

        source.set('chromium.instance2');

        expect(toggle().title).toBe('chromium.instance2 title');
    });

    it('stays on the paused player rather than jumping', () => {
        const { source, toggle } = setup();
        source.set('chromium.instance2', { PlaybackStatus: 'Paused' });
        source.set('spotify');

        source.set('spotify', { PlaybackStatus: 'Paused' });

        expect(toggle().title).toBe('spotify title');
    });
});

describe('the debug log', () => {
    // scripts/headless-check.sh greps for these lines.
    it('names the shown player and its state once per change', () => {
        const { source } = setup();
        source.set('spotify');
        source.set('spotify', { Metadata: { 'xesam:title': 'another' } });
        source.set('spotify', { PlaybackStatus: 'Paused' });
        source.remove('spotify');

        expect(console.debug.mock.calls.map(call => call[0])).toEqual([
            '[quickmusic] showing none',
            '[quickmusic] showing spotify Playing',
            '[quickmusic] showing spotify Paused',
            '[quickmusic] showing none',
        ]);
    });

    it('never logs the track', () => {
        const { source } = setup();
        source.set('spotify');

        const logged = console.debug.mock.calls.flat().join('\n');
        expect(logged).not.toContain('spotify title');
        expect(logged).not.toContain('spotify artist');
    });
});

describe('disable', () => {
    it('removes the top bar item and releases every handler', () => {
        const { settings, source, panel, button } = setup();
        source.set('spotify');
        expect(button()).not.toBeNull();

        panel.disable();

        expect(Main.statusItems.size).toBe(0);
        expect(settings.connected.size).toBe(0);
        expect(liveHandlers.size).toBe(0);
    });

    // The Shell parents the toggle's menu into the quick settings overlay and
    // never destroys it, so the extension must, or every lock leaks one.
    it('destroys the tile menu the Shell leaves behind', () => {
        const { panel, toggle } = setup();
        const menu = toggle().menu;

        panel.disable();

        expect(menu._wasDestroyed).toBe(true);
    });

    it('ignores a change that arrives after disable', () => {
        const { source, panel } = setup();
        panel.disable();

        expect(() => source.set('spotify')).not.toThrow();
    });

    it('can be enabled again', () => {
        const { source, panel, button } = setup();
        panel.disable();

        panel.enable();
        source.set('spotify');

        expect(Main.externalIndicators).toHaveLength(2);
        expect(button().visible).toBe(true);
        panel.disable();
    });

    it('tolerates disable twice', () => {
        const { panel } = setup();
        panel.disable();
        expect(() => panel.disable()).not.toThrow();
    });
});
