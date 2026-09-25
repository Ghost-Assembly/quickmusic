import { describe, expect, it } from 'vitest';

import {
    BUS_PREFIX,
    MAX_TEXT,
    artistLine,
    canToggle,
    ellipsize,
    formatLabel,
    panelVisible,
    parseMetadata,
    playerKey,
    safeArtUrl,
    samePlayer,
    selectPlayer,
    toPlayer,
} from '../modules/model.js';

const SPOTIFY = `${BUS_PREFIX}spotify`;
const CHROMIUM = `${BUS_PREFIX}chromium.instance2`;

/** A root and player property set shaped like Spotify's, unpacked. */
function raw(overrides = {}) {
    return {
        root: { Identity: 'Spotify', CanRaise: true, ...overrides.root },
        player: {
            PlaybackStatus: 'Playing',
            CanControl: true,
            CanPlay: true,
            CanPause: true,
            CanGoNext: true,
            CanGoPrevious: true,
            Metadata: {
                'mpris:trackid': '/com/spotify/track/1',
                'mpris:artUrl': 'https://i.scdn.co/image/abc',
                'xesam:title': 'My Hero',
                'xesam:artist': ['Foo Fighters'],
                'xesam:album': 'The Colour And The Shape',
            },
            ...overrides.player,
        },
    };
}

function player(busName, status, startedAt = 0) {
    const { root, player: props } = raw({ player: { PlaybackStatus: status } });
    return { ...toPlayer(busName, root, props, null, 0), startedAt };
}

describe('playerKey', () => {
    it('drops the MPRIS prefix', () => {
        expect(playerKey(SPOTIFY)).toBe('spotify');
    });

    // So a pin survives the browser restarting under a new instance number.
    it('drops an instance suffix', () => {
        expect(playerKey(CHROMIUM)).toBe('chromium');
        expect(playerKey(`${BUS_PREFIX}vlc.instance12345`)).toBe('vlc');
        expect(playerKey(`${BUS_PREFIX}firefox.instance_1_42`)).toBe('firefox');
    });

    it('keeps a dotted name that is not an instance', () => {
        expect(playerKey(`${BUS_PREFIX}org.gnome.Music`)).toBe('org.gnome.Music');
    });
});

describe('parseMetadata', () => {
    it('reads the fields the menu shows', () => {
        expect(parseMetadata(raw().player.Metadata)).toEqual({
            title: 'My Hero',
            artists: ['Foo Fighters'],
            album: 'The Colour And The Shape',
            artUrl: 'https://i.scdn.co/image/abc',
        });
    });

    it('tolerates no metadata at all', () => {
        for (const value of [null, undefined, 'nonsense', 42])
            expect(parseMetadata(value)).toEqual({
                title: '',
                artists: [],
                album: '',
                artUrl: '',
            });
    });

    // The spec says as, but some players send a plain string.
    it('accepts a single artist string', () => {
        expect(parseMetadata({ 'xesam:artist': 'Solo' }).artists).toEqual(['Solo']);
    });

    it('drops blank and non-string artists', () => {
        const artists = parseMetadata({ 'xesam:artist': [' ', 7, 'A', null] }).artists;
        expect(artists).toEqual(['A']);
    });

    // Another application controls every one of these strings.
    it('caps oversized text', () => {
        const title = parseMetadata({ 'xesam:title': 'x'.repeat(10_000) }).title;
        expect(Array.from(title)).toHaveLength(MAX_TEXT);
        expect(title.endsWith('…')).toBe(true);
    });

    // The cap has to come before the regex passes and Array.from, or a
    // player sending megabytes costs megabytes of work on every update.
    it('cuts oversized text before cleaning it', () => {
        const huge = `${'a'.repeat(MAX_TEXT * 10)}\nTAIL`;
        const title = parseMetadata({ 'xesam:title': huge }).title;
        expect(title).not.toContain('TAIL');
        expect(Array.from(title)).toHaveLength(MAX_TEXT);
    });

    it('flattens control characters to spaces', () => {
        expect(parseMetadata({ 'xesam:title': ' a\nb\tc\u0000 ' }).title).toBe('a b c');
    });
});

describe('safeArtUrl', () => {
    it('accepts https and file', () => {
        expect(safeArtUrl('https://example.com/a.jpg')).toBe(
            'https://example.com/a.jpg',
        );
        expect(safeArtUrl('file:///tmp/cover.png')).toBe('file:///tmp/cover.png');
        expect(safeArtUrl('FILE:///tmp/cover.png')).toBe('FILE:///tmp/cover.png');
    });

    it('rejects every other scheme', () => {
        for (const url of [
            'http://example.com/a.jpg',
            'javascript:alert(1)',
            'data:image/png;base64,AAAA',
            'smb://host/share/a.jpg',
            '/tmp/cover.png',
            '',
            null,
            42,
        ])
            expect(safeArtUrl(url)).toBe('');
    });

    it('rejects an absurdly long url', () => {
        expect(safeArtUrl(`https://example.com/${'a'.repeat(5000)}`)).toBe('');
    });
});

describe('toPlayer', () => {
    it('builds a snapshot', () => {
        const { root, player: props } = raw();
        const snapshot = toPlayer(SPOTIFY, root, props, null, 7);

        expect(snapshot).toMatchObject({
            busName: SPOTIFY,
            key: 'spotify',
            identity: 'Spotify',
            status: 'Playing',
            canPlay: true,
            canPause: true,
            canGoNext: true,
            canGoPrevious: true,
            canRaise: true,
            startedAt: 7,
        });
        expect(snapshot.track.title).toBe('My Hero');
    });

    it('falls back to the key when there is no identity', () => {
        const { player: props } = raw();
        expect(toPlayer(CHROMIUM, {}, props, null, 0).identity).toBe('chromium');
    });

    it('treats an unknown status as stopped', () => {
        const { root, player: props } = raw({ player: { PlaybackStatus: 'Weird' } });
        expect(toPlayer(SPOTIFY, root, props, null, 0).status).toBe('Stopped');
    });

    // MPRIS: when CanControl is false, every other Can* must be read as false.
    it('honors CanControl', () => {
        const { root, player: props } = raw({ player: { CanControl: false } });
        const snapshot = toPlayer(SPOTIFY, root, props, null, 0);

        expect(snapshot.canPlay).toBe(false);
        expect(snapshot.canPause).toBe(false);
        expect(snapshot.canGoNext).toBe(false);
        expect(snapshot.canGoPrevious).toBe(false);
    });

    it('treats missing flags as false', () => {
        const snapshot = toPlayer(SPOTIFY, {}, {}, null, 0);
        expect(snapshot.canPause).toBe(false);
        expect(snapshot.canRaise).toBe(false);
        expect(snapshot.status).toBe('Stopped');
    });

    describe('startedAt', () => {
        const paused = raw({ player: { PlaybackStatus: 'Paused' } });
        const playing = raw();

        it('is stamped when playback starts', () => {
            const before = toPlayer(SPOTIFY, paused.root, paused.player, null, 1);
            const after = toPlayer(SPOTIFY, playing.root, playing.player, before, 5);
            expect(before.startedAt).toBe(0);
            expect(after.startedAt).toBe(5);
        });

        it('is kept while playback continues', () => {
            const first = toPlayer(SPOTIFY, playing.root, playing.player, null, 3);
            const again = toPlayer(SPOTIFY, playing.root, playing.player, first, 9);
            expect(again.startedAt).toBe(3);
        });

        it('is kept after pausing', () => {
            const first = toPlayer(SPOTIFY, playing.root, playing.player, null, 3);
            const later = toPlayer(SPOTIFY, paused.root, paused.player, first, 9);
            expect(later.startedAt).toBe(3);
        });
    });
});

describe('selectPlayer', () => {
    it('returns null with no players', () => {
        expect(selectPlayer([], {})).toBeNull();
    });

    it('prefers the pinned player even when another is playing', () => {
        const spotify = player(SPOTIFY, 'Paused');
        const chromium = player(CHROMIUM, 'Playing', 4);

        expect(selectPlayer([spotify, chromium], { pinnedKey: 'spotify' })).toBe(
            spotify,
        );
    });

    // Two Chromium windows share the key 'chromium'. Pinning it means
    // "whichever Chromium is playing", not whichever registered first.
    it('ranks pinned instances like any others', () => {
        const idle = player(`${BUS_PREFIX}chromium.instance1`, 'Paused', 1);
        const active = player(`${BUS_PREFIX}chromium.instance2`, 'Playing', 5);
        const spotify = player(SPOTIFY, 'Playing', 9);

        expect(selectPlayer([idle, active, spotify], { pinnedKey: 'chromium' })).toBe(
            active,
        );
    });

    it('keeps the last active pinned instance once none is playing', () => {
        const first = player(`${BUS_PREFIX}chromium.instance1`, 'Paused', 1);
        const second = player(`${BUS_PREFIX}chromium.instance2`, 'Paused', 5);

        expect(
            selectPlayer([first, second], {
                pinnedKey: 'chromium',
                lastActive: first.busName,
            }),
        ).toBe(first);
    });

    it('ignores a pin whose player is not running', () => {
        const chromium = player(CHROMIUM, 'Playing', 4);
        expect(selectPlayer([chromium], { pinnedKey: 'spotify' })).toBe(chromium);
    });

    it('follows the player that most recently started playing', () => {
        const spotify = player(SPOTIFY, 'Playing', 2);
        const chromium = player(CHROMIUM, 'Playing', 8);

        expect(selectPlayer([spotify, chromium], {})).toBe(chromium);
    });

    it('sticks to the last active player once nothing is playing', () => {
        const spotify = player(SPOTIFY, 'Paused', 2);
        const chromium = player(CHROMIUM, 'Paused', 8);

        expect(selectPlayer([spotify, chromium], { lastActive: SPOTIFY })).toBe(
            spotify,
        );
    });

    it('prefers a playing player over the last active one', () => {
        const spotify = player(SPOTIFY, 'Paused', 2);
        const chromium = player(CHROMIUM, 'Playing', 8);

        expect(selectPlayer([spotify, chromium], { lastActive: SPOTIFY })).toBe(
            chromium,
        );
    });

    it('falls back to the first player by name', () => {
        const spotify = player(SPOTIFY, 'Stopped');
        const chromium = player(CHROMIUM, 'Stopped');

        expect(selectPlayer([spotify, chromium], { lastActive: 'gone' })).toBe(
            chromium,
        );
    });
});

describe('canToggle', () => {
    it('needs CanPause to pause and CanPlay to play', () => {
        const playing = player(SPOTIFY, 'Playing');
        const paused = player(SPOTIFY, 'Paused');

        expect(canToggle(playing)).toBe(true);
        expect(canToggle({ ...playing, canPause: false })).toBe(false);
        expect(canToggle(paused)).toBe(true);
        expect(canToggle({ ...paused, canPlay: false })).toBe(false);
        expect(canToggle(null)).toBe(false);
    });
});

describe('artistLine', () => {
    it('joins the artists', () => {
        expect(artistLine({ artists: ['Foo Fighters'] })).toBe('Foo Fighters');
        expect(artistLine({ artists: ['A', 'B'] })).toBe('A, B');
        expect(artistLine({ artists: [] })).toBe('');
    });
});

describe('samePlayer', () => {
    const base = player(SPOTIFY, 'Playing', 3);

    it('is true for an identical update', () => {
        expect(samePlayer(base, { ...base, track: { ...base.track } })).toBe(true);
    });

    // startedAt is ordering bookkeeping; nothing on screen shows it.
    it('ignores startedAt', () => {
        expect(samePlayer(base, { ...base, startedAt: 99 })).toBe(true);
    });

    it('notices a change anything on screen depends on', () => {
        expect(samePlayer(base, { ...base, status: 'Paused' })).toBe(false);
        expect(samePlayer(base, { ...base, canGoNext: false })).toBe(false);
        expect(samePlayer(base, { ...base, identity: 'Other' })).toBe(false);
        expect(
            samePlayer(base, { ...base, track: { ...base.track, title: 'Other' } }),
        ).toBe(false);
        expect(
            samePlayer(base, { ...base, track: { ...base.track, artists: ['X'] } }),
        ).toBe(false);
    });

    it('is false against nothing', () => {
        expect(samePlayer(null, base)).toBe(false);
    });
});

describe('formatLabel', () => {
    const track = parseMetadata(raw().player.Metadata);

    it('joins artist and title', () => {
        expect(formatLabel(track, 'Spotify')).toBe('Foo Fighters – My Hero');
    });

    it('joins several artists', () => {
        expect(formatLabel({ ...track, artists: ['A', 'B'] }, 'x')).toBe(
            'A, B – My Hero',
        );
    });

    it('uses the title alone without an artist', () => {
        expect(formatLabel({ ...track, artists: [] }, 'x')).toBe('My Hero');
    });

    it('uses the fallback without a title', () => {
        expect(formatLabel({ ...track, title: '' }, 'Spotify')).toBe('Spotify');
    });
});

describe('ellipsize', () => {
    it('leaves short text alone', () => {
        expect(ellipsize('abc', 10)).toBe('abc');
        expect(ellipsize('abcdefghij', 10)).toBe('abcdefghij');
    });

    it('cuts long text to the limit, ellipsis included', () => {
        expect(ellipsize('abcdefghijk', 10)).toBe('abcdefghi…');
    });

    // Slicing UTF-16 would split a surrogate pair and print a replacement box.
    it('counts characters, not code units', () => {
        expect(ellipsize('🎵🎵🎵🎵', 3)).toBe('🎵🎵…');
    });
});

describe('panelVisible', () => {
    it.each([
        [true, 'Playing', true],
        [true, 'Paused', false],
        [true, 'Stopped', false],
        [false, 'Playing', false],
    ])('enabled=%s status=%s -> %s', (enabled, status, expected) => {
        expect(panelVisible({ enabled, player: player(SPOTIFY, status) })).toBe(
            expected,
        );
    });

    it('is hidden with no player', () => {
        expect(panelVisible({ enabled: true, player: null })).toBe(false);
    });
});
