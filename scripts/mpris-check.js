// List the MPRIS players on this session bus through modules/mpris.js.
//
// modules/mpris.js is excluded from the unit suite because it is nothing but
// D-Bus plumbing; this is what checks it instead, against whatever players are
// actually running. Run by `just mpris-check` and `just test-live`.
//
// Exits 0 having printed each player, or 0 with a note when there are none —
// no players is a fact about the session, not a failure of the code. Exits 1
// only if the watcher itself throws.

import GLib from 'gi://GLib';

import { MprisWatcher } from '../modules/mpris.js';
import { formatLabel, selectPlayer } from '../modules/model.js';

const SETTLE_MS = 1500;

const loop = new GLib.MainLoop(null, false);
const watcher = new MprisWatcher();
let failed = false;

try {
    watcher.start(() => {});
} catch (error) {
    printerr(`FAIL: ${error}`);
    failed = true;
}

GLib.timeout_add(GLib.PRIORITY_DEFAULT, SETTLE_MS, () => {
    const players = watcher.players;
    if (players.length === 0) print('no MPRIS players on this session bus');

    const selected = selectPlayer(players, {});
    for (const player of players) {
        const mark = player === selected ? '*' : ' ';
        const flags = Object.entries({
            canPlay: player.canPlay,
            canPause: player.canPause,
            canGoPrevious: player.canGoPrevious,
            canGoNext: player.canGoNext,
            canRaise: player.canRaise,
        })
            .filter(([, on]) => on)
            .map(([name]) => name)
            .join(' ');
        print(`${mark} ${player.key} (${player.identity}) ${player.status}`);
        print(`    ${formatLabel(player.track, '(no track)')}`);
        if (player.track.album) print(`    album: ${player.track.album}`);
        if (player.track.artUrl) print(`    art:   ${player.track.artUrl}`);
        print(`    can:   ${flags || '(nothing)'}`);
    }

    watcher.destroy();
    loop.quit();
    return GLib.SOURCE_REMOVE;
});

loop.run();
if (failed) imports.system.exit(1);
