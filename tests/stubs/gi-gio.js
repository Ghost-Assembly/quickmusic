// Gio, as far as modules/panel.js and modules/mpris.js use it.
//
// The D-Bus half exists only for modules/mpris.js's own race logic: how a
// player is connected to and dropped, never what its properties mean — that
// stays modules/model.js's job and is tested there. A real bus is still the
// check for the wire format itself (scripts/mpris-check.js).

const IO_ERROR_ENUM = { CANCELLED: 'cancelled' };

/** Pending DBusProxy.newAsync() calls, oldest first. */
const pendingLoads = [];

/** Clear every pending load. Call between tests. */
export function resetPendingLoads() {
    pendingLoads.length = 0;
}

/**
 * The oldest still-pending load for a bus name and role ('root' or 'player'),
 * removed from the queue so a second call finds the next one behind it — a
 * relaunch under the same name queues a second load behind the first's.
 *
 * @param {string} busName Bus name the load was requested for.
 * @param {'root'|'player'} role Which interface it is loading.
 * @returns {{resolve: Function, reject: Function}|undefined} The deferred, or
 *   undefined if nothing is pending.
 */
export function takeLoad(busName, role) {
    const index = pendingLoads.findIndex(
        load => load.busName === busName && load.role === role,
    );
    return index === -1 ? undefined : pendingLoads.splice(index, 1)[0];
}

/**
 * A resolved DBusProxy: `props` read back through get_cached_property, as
 * modules/mpris.js's readProperties expects, and a g-properties-changed a
 * test can fire by calling change().
 *
 * @param {object} [props] Cached property values, by name.
 */
export function fakeProxy(props = {}) {
    const values = new Map(Object.entries(props));
    let nextId = 1;
    const handlers = new Map();

    return {
        get_cached_property_names: () => [...values.keys()],
        get_cached_property: name => ({ recursiveUnpack: () => values.get(name) }),

        connect(_signal, callback) {
            const id = nextId++;
            handlers.set(id, callback);
            return id;
        },
        disconnect(id) {
            handlers.delete(id);
        },
        /** Fire every connected handler, as g-properties-changed would. */
        change() {
            for (const callback of [...handlers.values()]) callback();
        },
        /** Live handler ids, so a test can prove disconnect() was reached. */
        get liveHandlers() {
            return [...handlers.keys()];
        },

        PlayPauseAsync: () => Promise.resolve(),
        NextAsync: () => Promise.resolve(),
        PreviousAsync: () => Promise.resolve(),
        RaiseAsync: () => Promise.resolve(),
    };
}

/**
 * A session bus fake: enough of Gio.DBusConnection for MprisWatcher to list
 * the players already running and be told about ones that come and go.
 *
 * @param {{names?: string[]}} [options] Bus names to answer ListNames with.
 */
export function fakeBus({ names = [] } = {}) {
    let onNameOwnerChanged = null;
    let nextSubscriptionId = 1;

    return {
        /** Live signal_subscribe ids, so a test can prove they balance. */
        subscriptions: new Set(),

        call(
            _name,
            _path,
            _iface,
            method,
            _params,
            _replyType,
            _flags,
            _timeout,
            _cancellable,
            callback,
        ) {
            if (method !== 'ListNames')
                throw new Error(`fakeBus: unexpected call ${method}`);
            callback(this, { names: [...names] });
        },
        call_finish(result) {
            return { deepUnpack: () => [result.names] };
        },

        signal_subscribe(_sender, _iface, _signal, _path, _arg0, _flags, callback) {
            const id = nextSubscriptionId++;
            onNameOwnerChanged = callback;
            this.subscriptions.add(id);
            return id;
        },
        signal_unsubscribe(id) {
            this.subscriptions.delete(id);
            if (this.subscriptions.size === 0) onNameOwnerChanged = null;
        },

        /** A player claims its name, as NameOwnerChanged reports a launch. */
        appear(busName) {
            onNameOwnerChanged?.(this, null, null, null, null, {
                deepUnpack: () => [busName, '', ':1.100'],
            });
        },
        /** A player releases its name, as NameOwnerChanged reports a quit. */
        vanish(busName) {
            onNameOwnerChanged?.(this, null, null, null, null, {
                deepUnpack: () => [busName, ':1.100', ''],
            });
        },
    };
}

/** An error shaped like a cancelled operation, as destroy() causes. */
export function cancelledError() {
    return {
        message: 'Operation was cancelled',
        matches: (domain, code) =>
            domain === IO_ERROR_ENUM && code === IO_ERROR_ENUM.CANCELLED,
    };
}

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

    DBusProxy: {
        makeProxyWrapper(xml) {
            const role = xml.includes('PlayPause') ? 'player' : 'root';
            return {
                newAsync: (_bus, busName) =>
                    new Promise((resolve, reject) => {
                        pendingLoads.push({ busName, role, resolve, reject });
                    }),
            };
        },
    },

    DBusProxyFlags: {
        DO_NOT_AUTO_START: 1,
        GET_INVALIDATED_PROPERTIES: 2,
    },
    DBusSignalFlags: {
        MATCH_ARG0_NAMESPACE: 1,
    },
    DBusCallFlags: {
        NONE: 0,
    },
    IOErrorEnum: IO_ERROR_ENUM,

    Cancellable: class {
        cancel() {
            this.cancelled = true;
        }
    },

    DBus: {
        // Never read: every test builds its watcher with an explicit fake bus.
        session: null,
    },
};
