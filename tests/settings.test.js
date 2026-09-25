import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ALL_KEYS, KEYS, SETTINGS, SettingsWatcher } from '../modules/settings.js';
import { createSettings } from './support/world.js';

const SCHEMA = fileURLToPath(
    new URL(
        '../schemas/org.gnome.shell.extensions.quickmusic.gschema.xml',
        import.meta.url,
    ),
);

// SCHEMA is a module-relative constant resolved from import.meta.url, not
// input of any kind; the rule cannot see that it is not a variable path.
// eslint-disable-next-line security/detect-non-literal-fs-filename
const xml = readFileSync(SCHEMA, 'utf8');

/** Key name -> declared type, straight out of the gschema. */
const declared = new Map(
    [...xml.matchAll(/<key\s+type="([^"]+)"\s+name="([^"]+)">/g)].map(match => [
        match[2],
        match[1],
    ]),
);

// A preference that is configurable and inert, or one the panel reads and the
// schema has never heard of, is a bug no other test can see.
describe('the settings list and the gschema', () => {
    it('agree on which keys exist', () => {
        expect([...declared.keys()].sort()).toEqual([...ALL_KEYS].sort());
    });

    it('agree on every type', () => {
        for (const setting of SETTINGS)
            expect(declared.get(setting.key)).toBe(setting.type);
    });

    it('describes every key it names', () => {
        for (const setting of SETTINGS) {
            expect(setting.label).toMatch(/\S/);
            expect(setting.detail).toMatch(/\S/);
        }
    });
});

describe('the schema itself', () => {
    it('is the id metadata.json points at', () => {
        const metadata = JSON.parse(
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            readFileSync(
                fileURLToPath(new URL('../metadata.json', import.meta.url)),
                'utf8',
            ),
        );

        expect(xml).toContain(`id="${metadata['settings-schema']}"`);
        expect(SCHEMA).toContain(metadata['settings-schema']);
    });

    it('gives every key a summary and a description', () => {
        const keys = [...xml.matchAll(/<key\b[\s\S]*?<\/key>/g)].map(match => match[0]);

        expect(keys).toHaveLength(declared.size);
        for (const key of keys) {
            expect(key).toMatch(/<summary>[^<]*\S[^<]*<\/summary>/);
            expect(key).toMatch(/<description>[\s\S]*\S[\s\S]*<\/description>/);
        }
    });

    it('ships following the active player', () => {
        expect(KEYS.PINNED_PLAYER).toBe('pinned-player');
        expect(xml).toMatch(/name="pinned-player">\s*<default>''<\/default>/);
    });

    it('bounds the label width', () => {
        expect(KEYS.PANEL_MAX_CHARS).toBe('panel-max-chars');
        expect(xml).toMatch(/name="panel-max-chars">\s*<range min="10" max="120"/);
    });
});

describe('SettingsWatcher', () => {
    it('releases every handler it connected', () => {
        const settings = createSettings();
        const watcher = new SettingsWatcher(settings);
        let fired = 0;

        watcher.watch(KEYS.SHOW_PANEL_INDICATOR, () => (fired += 1));
        watcher.watch(KEYS.PANEL_MAX_CHARS, () => (fired += 1));
        settings.set_boolean(KEYS.SHOW_PANEL_INDICATOR, false);
        expect(fired).toBe(1);

        watcher.release();
        watcher.release();

        expect(settings.connected.size).toBe(0);
    });
});
