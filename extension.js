// QuickMusic — what is playing, in the GNOME quick settings menu and top bar.
//
// This file is deliberately thin. It builds the MPRIS watcher and the panel
// and tears them down; every decision lives in a module under modules/.
//
// Nothing here runs at import time. Creating an object, connecting a signal or
// touching the Shell during module evaluation is forbidden by the review
// guidelines.

import {
    Extension,
    gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import { MprisWatcher } from './modules/mpris.js';
import { Panel } from './modules/panel.js';

export default class QuickMusicExtension extends Extension {
    enable() {
        this._source = new MprisWatcher();
        this._panel = new Panel({
            source: this._source,
            settings: this.getSettings(),
            iconPath: `${this.path}/icons/quickmusic-symbolic.svg`,
            gettext: _,
        });
        this._panel.enable();

        // scripts/headless-check.sh greps for this line; keep the prefix stable.
        console.debug(
            `[quickmusic] enabled (v${this.metadata['version-name'] ?? '?'})`,
        );
    }

    disable() {
        // Ordered. The watcher goes first so no bus signal can reach a panel
        // that is being taken apart.
        this._source?.destroy();
        this._panel?.disable();

        this._source = null;
        this._panel = null;
    }
}
