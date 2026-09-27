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
            // One exception: prefs.js is Adw and Gtk widget building, which a
            // unit test could only assert against a stub of the toolkit. The
            // key list and wording it shows live in modules/settings.js and
            // are checked there instead.
            //
            // Kept identical to sonar.coverage.exclusions so the two agree.
            // tests/** keeps a dynamically imported stub out of the report.
            exclude: ['prefs.js', 'tests/**'],
        },
    },

    // gnome-shell resolves these at runtime; Node cannot. The stubs live in
    // tests/, so they never ship and are never counted as covered code.
    resolve: {
        alias: [
            { find: 'gi://Clutter', replacement: stub('gi-clutter') },
            { find: 'gi://Gio', replacement: stub('gi-gio') },
            { find: 'gi://GLib', replacement: stub('gi-glib') },
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
