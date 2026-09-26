// What an MPRIS player's properties mean, and which player to show.
//
// This file imports nothing. modules/mpris.js hands it plain, already
// unpacked property values and gets plain objects back, so every decision the
// extension makes about a player is reachable from Vitest on Node — the D-Bus
// file that remains is only plumbing.
//
// Everything a player publishes is written by another application. Nothing
// here trusts it: text is flattened and capped, flags default to false, and
// cover art is only ever loaded from https or a local file.

/** Every MPRIS player owns a bus name under this prefix. */
export const BUS_PREFIX = 'org.mpris.MediaPlayer2.';

/** Longest string, in characters, kept from any metadata field. */
export const MAX_TEXT = 256;

/** Longest cover art url accepted. Anything longer is not a cover. */
const MAX_URL = 2048;

const STATUSES = new Set(['Playing', 'Paused', 'Stopped']);

/**
 * The stable name of a player, for pinning.
 *
 * Browsers and VLC append an instance suffix that changes on every launch —
 * chromium.instance2, vlc.instance12345, firefox.instance_1_42 — so a pin by
 * full bus name would not survive a restart.
 *
 * @param {string} busName Full bus name.
 * @returns {string} The name without the MPRIS prefix or instance suffix.
 */
export function playerKey(busName) {
    const name = busName.startsWith(BUS_PREFIX)
        ? busName.slice(BUS_PREFIX.length)
        : busName;
    return name.replace(/\.instance[\w-]*$/, '');
}

/**
 * Cut text to a number of characters, ellipsis included.
 *
 * Counts code points rather than UTF-16 units, so an emoji is never split into
 * half a surrogate pair.
 *
 * @param {string} text Text to shorten.
 * @param {number} max Most characters to keep.
 * @returns {string} The text, shortened if it was longer than max.
 */
export function ellipsize(text, max) {
    const chars = Array.from(text);
    if (chars.length <= max) return text;
    return `${chars.slice(0, Math.max(0, max - 1)).join('')}…`;
}

/**
 * Untrusted metadata text made safe to put in a label.
 *
 * @param {unknown} value Anything.
 * @returns {string} A single trimmed line, capped at MAX_TEXT.
 */
function cleanText(value) {
    if (typeof value !== 'string') return '';
    // Cut first, generously: a code point is at most two UTF-16 units, and the
    // slack covers the whitespace collapsing below. Without this a player
    // sending megabytes costs megabytes of regex on every update.
    const head = value.slice(0, MAX_TEXT * 4);
    // Control characters would break the single-line labels this ends up in.
    // eslint-disable-next-line no-control-regex
    const line = head.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ');
    return ellipsize(line.trim(), MAX_TEXT);
}

/**
 * A cover art url the Shell may load, or '' for one it may not.
 *
 * Only https and file. Plain http would fetch in the clear on the user's
 * behalf, and every other scheme GVfs understands — smb, sftp, dav — would let
 * a player make the Shell open a connection somewhere of its choosing.
 *
 * @param {unknown} url The player's mpris:artUrl.
 * @returns {string} The url, or '' if it is not acceptable.
 */
export function safeArtUrl(url) {
    if (typeof url !== 'string' || url.length > MAX_URL) return '';
    return /^(https|file):\/\//i.test(url) ? url : '';
}

/**
 * The track fields the extension shows.
 *
 * @param {unknown} metadata The unpacked Metadata property (a{sv}).
 * @returns {{title: string, artists: string[], album: string, artUrl: string}}
 *   The track.
 */
export function parseMetadata(metadata) {
    const fields = metadata && typeof metadata === 'object' ? metadata : {};

    // The spec says `as`, but some players send a lone string.
    const rawArtists = fields['xesam:artist'];
    const artistList = Array.isArray(rawArtists) ? rawArtists : [rawArtists];

    return {
        title: cleanText(fields['xesam:title']),
        artists: artistList.map(cleanText).filter(Boolean),
        album: cleanText(fields['xesam:album']),
        artUrl: safeArtUrl(fields['mpris:artUrl']),
    };
}

/**
 * One player as the panel sees it.
 *
 * @param {string} busName Full bus name.
 * @param {object} root Unpacked org.mpris.MediaPlayer2 properties.
 * @param {object} player Unpacked org.mpris.MediaPlayer2.Player properties.
 * @param {object|null} previous This player's last snapshot, if any.
 * @param {number} tick A counter that increases with every update, used to
 *   order players by when they last started playing.
 * @returns {object} The snapshot.
 */
export function toPlayer(busName, root, player, previous, tick) {
    const status = STATUSES.has(player.PlaybackStatus)
        ? player.PlaybackStatus
        : 'Stopped';

    // MPRIS: when CanControl is false, every other Can* property is to be
    // treated as false, whatever it says.
    const control = player.CanControl === true;
    const can = flag => control && flag === true;

    const started = status === 'Playing' && previous?.status !== 'Playing';

    return {
        busName,
        key: playerKey(busName),
        identity: cleanText(root.Identity) || playerKey(busName),
        status,
        canPlay: can(player.CanPlay),
        canPause: can(player.CanPause),
        canGoNext: can(player.CanGoNext),
        canGoPrevious: can(player.CanGoPrevious),
        canRaise: root.CanRaise === true,
        track: parseMetadata(player.Metadata),
        startedAt: started ? tick : (previous?.startedAt ?? 0),
    };
}

/**
 * The player to show.
 *
 * Among the pinned player's instances if any are running, otherwise among
 * all players, in order: the playing player that
 * started most recently; the last one shown, so pausing does not make the
 * tile jump to another player; then the first by name, so the choice is at
 * least stable.
 *
 * @param {object[]} players Snapshots from toPlayer.
 * @param {{pinnedKey?: string, lastActive?: string}} choice The pin, and the
 *   bus name shown last.
 * @returns {object|null} The player, or null with none running.
 */
export function selectPlayer(players, { pinnedKey = '', lastActive = '' } = {}) {
    // A pin narrows the field rather than naming one player: two Chromium
    // windows share a key, and the one to show is still the one playing.
    const pinned = pinnedKey ? players.filter(player => player.key === pinnedKey) : [];
    return rankPlayers(pinned.length > 0 ? pinned : players, lastActive);
}

/**
 * The best of some players, ignoring any pin.
 *
 * @param {object[]} players Candidates.
 * @param {string} lastActive The bus name shown last.
 * @returns {object|null} The player, or null with no candidates.
 */
function rankPlayers(players, lastActive) {
    if (players.length === 0) return null;

    const playing = players
        .filter(player => player.status === 'Playing')
        .sort((a, b) => b.startedAt - a.startedAt);
    if (playing.length > 0) return playing[0];

    const last = players.find(player => player.busName === lastActive);
    if (last) return last;

    return [...players].sort((a, b) => a.busName.localeCompare(b.busName))[0];
}

/**
 * Whether PlayPause would do anything right now.
 *
 * @param {object|null} player A snapshot.
 * @returns {boolean} True when the player accepts the toggle.
 */
export function canToggle(player) {
    if (!player) return false;
    return player.status === 'Playing' ? player.canPause : player.canPlay;
}

/**
 * The artists as one line.
 *
 * @param {{artists: string[]}} track A parsed track.
 * @returns {string} "A, B", or '' with none.
 */
export function artistLine(track) {
    return track.artists.join(', ');
}

/**
 * Whether two snapshots of a player would look the same on screen.
 *
 * modules/mpris.js uses this to drop PropertiesChanged signals that change
 * nothing visible — Chromium, for one, re-announces unchanged flags. startedAt
 * is left out: it only orders players, and it cannot change without status
 * changing too.
 *
 * @param {object|null} a A snapshot, or null.
 * @param {object} b A snapshot.
 * @returns {boolean} True when nothing shown differs.
 */
export function samePlayer(a, b) {
    if (!a) return false;
    return visibleState(a) === visibleState(b);
}

/** A snapshot as a string, without its startedAt. Key order is toPlayer's. */
function visibleState(player) {
    return JSON.stringify(player, (key, value) =>
        key === 'startedAt' ? undefined : value,
    );
}

/**
 * The one-line "Artist – Title" label.
 *
 * @param {{title: string, artists: string[]}} track A parsed track.
 * @param {string} fallback Shown when there is no title, usually the player.
 * @returns {string} The label.
 */
export function formatLabel(track, fallback) {
    if (!track.title) return fallback;
    const artists = artistLine(track);
    return artists ? `${artists} – ${track.title}` : track.title;
}

/**
 * Whether the top bar item shows.
 *
 * While something is playing or paused, so the click that paused it can
 * resume it. A stopped player, or none, leaves nothing to resume there.
 *
 * @param {{enabled: boolean, player: object|null}} state The setting and the
 *   selected player.
 * @returns {boolean} True to show it.
 */
export function panelVisible({ enabled, player }) {
    const status = player?.status;
    return Boolean(enabled && (status === 'Playing' || status === 'Paused'));
}
