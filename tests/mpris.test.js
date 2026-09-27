// modules/mpris.js's race logic: whether a player that appears, quits, is
// dropped mid-load or torn down still ends up in the right state. Not the
// wire format itself — a real bus is what checks that, in
// scripts/mpris-check.js — so every proxy here is fake and every load
// settles only when a test says so.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import GLib from './stubs/gi-glib.js';
import {
    cancelledError,
    fakeBus,
    fakeProxy,
    resetPendingLoads,
    takeLoad,
} from './stubs/gi-gio.js';

import { BUS_PREFIX } from '../modules/model.js';
import { MprisWatcher } from '../modules/mpris.js';

// tests/stubs/gi-glib.js is a shared, byte-locked stub (template.list) with
// no VariantType: nothing needed one before mpris.js's start() built one for
// its ListNames call. The alias in vitest.config.js makes this the same
// module object mpris.js imports, so augmenting it here reaches mpris.js too,
// without touching the file every extension shares.
GLib.VariantType ??= class FakeVariantType {
    constructor(signature) {
        this.signature = signature;
    }
};

const SPOTIFY = `${BUS_PREFIX}spotify`;

/** Let a settled load's promise reactions run. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/** Take the pair of loads a single _add queues. */
function takePair(busName) {
    return { root: takeLoad(busName, 'root'), player: takeLoad(busName, 'player') };
}

function setup(busOptions) {
    const bus = fakeBus(busOptions);
    const watcher = new MprisWatcher({ bus });
    const onChange = vi.fn();
    watcher.start(onChange);
    return { bus, watcher, onChange };
}

beforeEach(() => {
    resetPendingLoads();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('starting', () => {
    it('subscribes to NameOwnerChanged and unsubscribes on destroy', () => {
        const { bus, watcher } = setup();

        expect(bus.subscriptions.size).toBe(1);

        watcher.destroy();

        expect(bus.subscriptions.size).toBe(0);
    });

    it('connects a player already on the bus at ListNames time', async () => {
        const { watcher } = setup({ names: [SPOTIFY] });

        takeLoad(SPOTIFY, 'root').resolve(fakeProxy({ Identity: 'Spotify' }));
        takeLoad(SPOTIFY, 'player').resolve(
            fakeProxy({ PlaybackStatus: 'Playing', CanControl: true }),
        );
        await flush();

        expect(watcher.players.map(player => player.busName)).toEqual([SPOTIFY]);
    });

    // start() subscribes before listing, so the same player can be reported
    // by both. _add's guard on an existing entry is what keeps this to one.
    it('a duplicate _add — seen by both ListNames and a signal — is ignored', () => {
        const { bus } = setup({ names: [SPOTIFY] });

        bus.appear(SPOTIFY);

        expect(takeLoad(SPOTIFY, 'root')).toBeDefined();
        expect(takeLoad(SPOTIFY, 'root')).toBeUndefined();
    });
});

describe('a player removed while its proxies load', () => {
    it('leaves no entry once the load settles', async () => {
        const { bus, watcher } = setup();

        bus.appear(SPOTIFY);
        const pending = takePair(SPOTIFY);
        bus.vanish(SPOTIFY);

        pending.root.resolve(fakeProxy());
        pending.player.resolve(fakeProxy());
        await flush();

        expect(watcher.players).toEqual([]);
    });
});

describe('quit then relaunch under the same name', () => {
    it("the old load's rejection does not delete the new entry", async () => {
        const { bus, watcher } = setup();

        bus.appear(SPOTIFY);
        const old = takePair(SPOTIFY);
        bus.vanish(SPOTIFY);
        bus.appear(SPOTIFY);
        const fresh = takePair(SPOTIFY);

        fresh.root.resolve(fakeProxy({ Identity: 'Spotify' }));
        fresh.player.resolve(
            fakeProxy({ PlaybackStatus: 'Playing', CanControl: true }),
        );
        await flush();
        expect(watcher.players.map(player => player.busName)).toEqual([SPOTIFY]);

        old.root.reject(cancelledError());
        old.player.reject(cancelledError());
        await flush();

        expect(watcher.players.map(player => player.busName)).toEqual([SPOTIFY]);
    });

    it("the old load's late success does not attach", async () => {
        const { bus, watcher } = setup();

        bus.appear(SPOTIFY);
        const old = takePair(SPOTIFY);
        bus.vanish(SPOTIFY);
        bus.appear(SPOTIFY);
        const fresh = takePair(SPOTIFY);

        fresh.root.resolve(fakeProxy({ Identity: 'fresh' }));
        fresh.player.resolve(
            fakeProxy({ PlaybackStatus: 'Playing', CanControl: true }),
        );
        await flush();

        old.root.resolve(fakeProxy({ Identity: 'stale' }));
        old.player.resolve(fakeProxy({ PlaybackStatus: 'Playing', CanControl: true }));
        await flush();

        expect(watcher.players).toHaveLength(1);
        expect(watcher.players[0].identity).toBe('fresh');
    });
});

describe('destroy() during a load', () => {
    it('attaches nothing once the load resolves', async () => {
        const { bus, watcher } = setup();

        bus.appear(SPOTIFY);
        const pending = takePair(SPOTIFY);

        watcher.destroy();
        pending.root.resolve(fakeProxy());
        pending.player.resolve(fakeProxy());
        await flush();

        expect(watcher.players).toEqual([]);
    });

    it('does not warn when the load rejects as cancelled', async () => {
        const { bus, watcher } = setup();

        bus.appear(SPOTIFY);
        const pending = takePair(SPOTIFY);

        watcher.destroy();
        pending.root.reject(cancelledError());
        pending.player.reject(cancelledError());
        await flush();

        expect(watcher.players).toEqual([]);
        expect(console.warn).not.toHaveBeenCalled();
    });

    // The cancelled check has to actually distinguish, or the test above
    // would pass no matter what a load failed with.
    it('still warns when a load fails for another reason', async () => {
        const { bus } = setup();

        bus.appear(SPOTIFY);
        const pending = takePair(SPOTIFY);

        pending.root.reject(new Error('boom'));
        pending.player.resolve(fakeProxy());
        await flush();

        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(SPOTIFY));
    });
});
