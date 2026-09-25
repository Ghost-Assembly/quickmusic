// Clutter 18, as far as modules/panel.js uses it.
//
// ClickGesture takes required_button because the real one inherits it from
// PressGesture — verified by introspecting the Clutter 18 typelib. The top bar
// item relies on it to tell a left click (play/pause) from a right click (the
// popup).

import { FakeActor } from '../support/actors.js';

class ClickGesture extends FakeActor {
    _init(props = {}) {
        super._init(props);
        this.required_button ??= 0;
        this.recognize_on_press ??= false;
    }

    /** Drive the gesture as Clutter would on a completed click. */
    recognize() {
        this.emit('recognize', this);
    }
}

export default {
    ClickGesture,

    KEY_Return: 0xff0d,
    KEY_KP_Enter: 0xff8d,
    KEY_space: 0x020,
    KEY_Menu: 0xff67,
    KEY_a: 0x061,

    BUTTON_PRIMARY: 1,
    BUTTON_MIDDLE: 2,
    BUTTON_SECONDARY: 3,

    ActorAlign: { FILL: 0, START: 1, CENTER: 2, END: 3 },
    Orientation: { HORIZONTAL: 0, VERTICAL: 1 },
    EVENT_PROPAGATE: false,
    EVENT_STOP: true,
};
