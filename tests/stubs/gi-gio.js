// Gio, as far as modules/panel.js uses it.
//
// modules/mpris.js also imports Gio, but it is excluded from the suite by
// design — see vitest.config.js — so nothing here resembles D-Bus.

export default {
    icon_new_for_string: name => ({ name, isGicon: true }),

    ThemedIcon: class {
        constructor({ name }) {
            this.name = name;
        }
    },

    FileIcon: class {
        constructor({ file }) {
            this.file = file;
        }
    },

    File: {
        new_for_uri: uri => ({ uri }),
    },
};
