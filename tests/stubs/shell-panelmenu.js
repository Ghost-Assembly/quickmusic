// resource:///org/gnome/shell/ui/panelMenu.js, as far as modules/panel.js uses it.
//
// Mirrors the parts of the real Button that matter to QuickMusic: with
// dontCreateMenu the menu is a dummy; destroy runs _onDestroy from the destroy
// signal, as ButtonBox connects it; and the base key handler emits
// popup-menu for the Menu key, as StWidget's does.

import Clutter from './gi-clutter.js';
import { FakeActor } from '../support/actors.js';

class Button extends FakeActor {
    _init(menuAlignment, nameText, dontCreateMenu = false) {
        super._init();
        this.menuAlignment = menuAlignment;
        this.accessible_name = nameText ?? '';
        this.dontCreateMenu = dontCreateMenu;
        this.menu = dontCreateMenu ? null : new FakeActor();
        this.connect('destroy', () => this._onDestroy());
    }

    _onDestroy() {
        this.menu?.destroy?.();
    }

    vfunc_key_press_event(event) {
        if (event.get_key_symbol() === Clutter.KEY_Menu) this.emit('popup-menu');
        return Clutter.EVENT_PROPAGATE;
    }
}

export { Button };
