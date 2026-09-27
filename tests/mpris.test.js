// modules/mpris.js's race logic: whether a player that appears, quits, is
// dropped mid-load or torn down still ends up in the right state. Not the
// wire format itself — a real bus is what checks that, in
// scripts/mpris-check.js — so every proxy here is fake and every load
// settles only when a test says so.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    cancelledError,
    fakeBus,
    fakeProxy,
    resetPendingLoads,
    takeLoad,
} from './stubs/gi-gio.js';

import { BUS_PREFIX } from '../modules/model.js';
import { MprisWatcher } from '../modules/mpris.js';

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

        const root = fakeProxy();
        const player = fakeProxy();
        pending.root.resolve(root);
        pending.player.resolve(player);
        await flush();

        expect(watcher.players).toEqual([]);
        // "No entry" has to mean nothing was attached, not just that
        // _entries lost the key: an attached proxy keeps a live
        // g-properties-changed handler that destroy() would never reach.
        expect([...root.liveHandlers, ...player.liveHandlers]).toEqual([]);
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

        // _remove() never cancels anything: the old load fails on its own,
        // typically because the player it was loading for is simply gone.
        old.root.reject(new Error('org.freedesktop.DBus.Error.NameHasNoOwner'));
        old.player.reject(new Error('org.freedesktop.DBus.Error.NameHasNoOwner'));
        await flush();

        expect(watcher.players.map(player => player.busName)).toEqual([SPOTIFY]);
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(SPOTIFY));
    });

    it("the old load's late success does not attach", async () => {
        const { bus, watcher, onChange } = setup();

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

        const staleRoot = fakeProxy({ Identity: 'stale' });
        const stalePlayer = fakeProxy({ PlaybackStatus: 'Playing', CanControl: true });
        old.root.resolve(staleRoot);
        old.player.resolve(stalePlayer);
        await flush();

        expect(watcher.players).toHaveLength(1);
        expect(watcher.players[0].identity).toBe('fresh');
        // "Does not attach" means no g-properties-changed handler either, not
        // just that the stale snapshot lost the race.
        expect([...staleRoot.liveHandlers, ...stalePlayer.liveHandlers]).toEqual([]);

        onChange.mockClear();
        staleRoot.change();
        stalePlayer.change();
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe('destroy() during a load', () => {
    it('attaches nothing once the load resolves', async () => {
        const { bus, watcher } = setup();

        bus.appear(SPOTIFY);
        const pending = takePair(SPOTIFY);

        watcher.destroy();
        const root = fakeProxy();
        const player = fakeProxy();
        pending.root.resolve(root);
        pending.player.resolve(player);
        await flush();

        expect(watcher.players).toEqual([]);
        expect([...root.liveHandlers, ...player.liveHandlers]).toEqual([]);
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
