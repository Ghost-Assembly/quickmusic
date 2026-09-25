// St, as far as modules/panel.js uses it.

import { FakeActor } from '../support/actors.js';

class Widget extends FakeActor {}
class BoxLayout extends Widget {}
class Icon extends Widget {}

/** A label with the clutter_text the real St.Label exposes. */
class Label extends Widget {
    _init(props = {}) {
        super._init({ text: '', ...props });
        this.clutter_text = { ellipsize: null, use_markup: false };
    }
}

class Button extends Widget {
    _init(props = {}) {
        super._init(props);
        if (props.child) this.add_child(props.child);
    }

    /** Fire the button as a click would, unless it is insensitive. */
    click() {
        if (this.reactive) this.emit('clicked', 0);
    }
}

export default {
    Widget,
    BoxLayout,
    Icon,
    Label,
    Button,

    Side: { TOP: 0, RIGHT: 1, BOTTOM: 2, LEFT: 3 },
};
