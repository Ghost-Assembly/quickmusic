// resource:///org/gnome/shell/ui/main.js, as far as modules/panel.js uses it.
//
// A module singleton, mirroring the real Main. reset() must be called from
// beforeEach or state leaks between tests.

import { FakeActor } from '../support/actors.js';

/** Indicators handed to addExternalIndicator. */
export const externalIndicators = [];

/** Top bar items handed to addToStatusArea, by role. */
export const statusItems = new Map();

/** Menus handed to the panel's menu manager. */
export const managedMenus = [];

/** Actors added to the UI group. */
export const uiGroupChildren = [];

const quickSettings = new FakeActor();
quickSettings.addExternalIndicator = (indicator, colSpan = 1) => {
    externalIndicators.push({ indicator, colSpan });
};

export const uiGroup = {
    add_child(actor) {
        uiGroupChildren.push(actor);
    },
};

export const panel = {
    statusArea: { quickSettings },

    // As the real Panel: one item per role, and the role is freed when the
    // item is destroyed.
    addToStatusArea(role, indicator, position, box) {
        if (statusItems.has(role))
            throw new Error(
                `Extension point conflict: there is already a status indicator for role ${role}`,
            );
        statusItems.set(role, { indicator, position, box });
        indicator.connect('destroy', () => statusItems.delete(role));
        return indicator;
    },

    menuManager: {
        addMenu(menu) {
            managedMenus.push(menu);
        },
    },
};

/** Clear all recorded state. Call from beforeEach. */
export function reset() {
    externalIndicators.length = 0;
    statusItems.clear();
    managedMenus.length = 0;
    uiGroupChildren.length = 0;
}
