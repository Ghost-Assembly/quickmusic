import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const stub = name =>
    fileURLToPath(new URL(`./tests/stubs/${name}.js`, import.meta.url));

export default defineConfig({
    test: {
        include: ['tests/**/*.test.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            // Everything the extension ships, so the denominator is the real
            // one.
            include: ['modules/**/*.js', 'extension.js', 'prefs.js'],
            // Two exceptions, both for the same reason: what is left in them
            // is toolkit plumbing, which a unit test could only assert against
            // a stub of the toolkit.
            //
            //   prefs.js          Adw and Gtk widget building. The key list
            //                     and wording live in modules/settings.js.
            //   modules/mpris.js  Gio D-Bus plumbing. Every decision about
            //                     what a player's properties mean lives in
            //                     modules/model.js and is tested there.
            //                     mpris.js is covered instead by
            //                     scripts/mpris-check.js against the real
            //                     session bus, and by scripts/headless-check.sh
            //                     against scripts/fake-player.js.
            //
            // Kept identical to sonar.coverage.exclusions so the two agree.
            // tests/** keeps a dynamically imported stub out of the report.
            exclude: ['prefs.js', 'modules/mpris.js', 'tests/**'],
        },
    },

    // gnome-shell resolves these at runtime; Node cannot. The stubs live in
    // tests/, so they never ship and are never counted as covered code.
    //
    // There is deliberately no alias for anything D-Bus shaped: only
    // modules/mpris.js touches the bus, and it is excluded above. Needing one
    // would mean a decision had leaked into the transport.
    resolve: {
        alias: [
            { find: 'gi://Clutter', replacement: stub('gi-clutter') },
            { find: 'gi://Gio', replacement: stub('gi-gio') },
            { find: 'gi://GObject', replacement: stub('gi-gobject') },
            { find: 'gi://Pango', replacement: stub('gi-pango') },
            { find: 'gi://St', replacement: stub('gi-st') },
            {
                find: 'resource:///org/gnome/shell/ui/main.js',
                replacement: stub('shell-main'),
            },
            {
                find: 'resource:///org/gnome/shell/ui/panelMenu.js',
                replacement: stub('shell-panelmenu'),
            },
            {
                find: 'resource:///org/gnome/shell/ui/popupMenu.js',
                replacement: stub('shell-popupmenu'),
            },
            {
                find: 'resource:///org/gnome/shell/ui/quickSettings.js',
                replacement: stub('shell-quicksettings'),
            },
            {
                find: 'resource:///org/gnome/shell/extensions/extension.js',
                replacement: stub('shell-extension'),
            },
        ],
    },
});
