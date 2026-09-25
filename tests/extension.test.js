import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSettings, createSource } from './support/world.js';

/*
 * The one place in this suite that mocks a module rather than injecting a
 * fake. extension.js imports modules/mpris.js, which talks to D-Bus, and
 * vitest.config.js deliberately has no alias for that. Mocking it keeps the
 * tripwire armed while still letting the wiring be tested — and extension.js
 * has no logic of its own beyond that wiring and its teardown order.
 */
const sources = [];

async function load() {
    vi.resetModules();
    sources.length = 0;

    vi.doMock('../modules/mpris.js', () => ({
        MprisWatcher: class {
            constructor() {
                const source = createSource();
                sources.push(source);
                return source;
            }
        },
    }));

    // Imported after resetModules, so the stub instance is the one the panel
    // records into.
    const Main = await import('./stubs/shell-main.js');
    const { resetActors } = await import('./support/actors.js');
    Main.reset();
    resetActors();

    const { default: QuickMusicExtension } = await import('../extension.js');
    const extension = new QuickMusicExtension({ 'version-name': '9.9.9' });
    extension.settings = createSettings();

    return { extension, Main };
}

beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('../modules/mpris.js');
    vi.resetModules();
});

describe('QuickMusicExtension', () => {
    it('puts a tile in quick settings and starts watching', async () => {
        const { extension, Main } = await load();

        extension.enable();

        expect(Main.externalIndicators).toHaveLength(1);
        expect(sources[0].started).toBe(true);
        extension.disable();
    });

    // scripts/headless-check.sh greps for this line.
    it('logs the marker the headless check greps for', async () => {
        const { extension } = await load();

        extension.enable();

        expect(console.debug).toHaveBeenCalledWith('[quickmusic] enabled (v9.9.9)');
        extension.disable();
    });

    it('survives metadata with no version', async () => {
        const { extension } = await load();
        extension.metadata = {};

        extension.enable();

        expect(console.debug).toHaveBeenCalledWith('[quickmusic] enabled (v?)');
        extension.disable();
    });

    it('stops watching and removes the top bar item on disable', async () => {
        const { extension, Main } = await load();
        extension.enable();
        sources[0].set('spotify');
        expect(Main.statusItems.size).toBe(1);

        extension.disable();

        expect(sources[0].destroyed).toBe(true);
        expect(Main.statusItems.size).toBe(0);
    });

    // The shape scripts/headless-check.sh exercises against a real Shell.
    it('can be enabled, disabled and enabled again', async () => {
        const { extension, Main } = await load();

        extension.enable();
        extension.disable();
        extension.enable();

        expect(sources).toHaveLength(2);
        expect(Main.externalIndicators).toHaveLength(2);
        extension.disable();
    });

    it('tolerates disable without enable, and twice', async () => {
        const { extension } = await load();

        expect(() => extension.disable()).not.toThrow();
        extension.enable();
        extension.disable();
        expect(() => extension.disable()).not.toThrow();
    });

    it('drops every reference on disable', async () => {
        const { extension } = await load();

        extension.enable();
        extension.disable();

        expect(extension._source).toBeNull();
        expect(extension._panel).toBeNull();
    });
});
