// A minimal MPRIS player on the session bus, for testing without a real one.
//
// Owns org.mpris.MediaPlayer2.quickmusictest and answers PlayPause, Next,
// Previous and Raise, emitting PropertiesChanged the way a real player does.
// scripts/headless-check.sh runs it inside the throwaway session to prove the
// whole path — bus name appearing, proxies loading, property changes, name
// vanishing — against a real gnome-shell. `just fake-player` runs it on the
// real session bus for trying the extension by hand.
//
// Prints "ready" once it owns the name. Runs until killed.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const NAME = 'org.mpris.MediaPlayer2.quickmusictest';
const PATH = '/org/mpris/MediaPlayer2';

const ROOT_XML = `
<node>
  <interface name="org.mpris.MediaPlayer2">
    <method name="Raise"/>
    <method name="Quit"/>
    <property name="CanQuit" type="b" access="read"/>
    <property name="CanRaise" type="b" access="read"/>
    <property name="HasTrackList" type="b" access="read"/>
    <property name="Identity" type="s" access="read"/>
    <property name="SupportedUriSchemes" type="as" access="read"/>
    <property name="SupportedMimeTypes" type="as" access="read"/>
  </interface>
</node>`;

const PLAYER_XML = `
<node>
  <interface name="org.mpris.MediaPlayer2.Player">
    <method name="PlayPause"/>
    <method name="Play"/>
    <method name="Pause"/>
    <method name="Stop"/>
    <method name="Next"/>
    <method name="Previous"/>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="CanControl" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
    <property name="CanPause" type="b" access="read"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
    <property name="CanSeek" type="b" access="read"/>
  </interface>
</node>`;

const TRACKS = [
    { title: 'First Test Track', artist: 'QuickMusic', album: 'Fixtures' },
    { title: 'Second Test Track', artist: 'QuickMusic', album: 'Fixtures' },
];

let status = 'Playing';
let index = 0;
let playerExport = null;

function metadata() {
    // eslint-disable-next-line security/detect-object-injection -- index is always in range
    const track = TRACKS[index];
    return {
        'mpris:trackid': new GLib.Variant('o', `/quickmusictest/track/${index}`),
        'xesam:title': new GLib.Variant('s', track.title),
        'xesam:artist': new GLib.Variant('as', [track.artist]),
        'xesam:album': new GLib.Variant('s', track.album),
    };
}

function changed(name, variant) {
    playerExport.emit_property_changed(name, variant);
}

function setStatus(next) {
    status = next;
    changed('PlaybackStatus', new GLib.Variant('s', status));
}

function skip(step) {
    index = (index + step + TRACKS.length) % TRACKS.length;
    changed('Metadata', new GLib.Variant('a{sv}', metadata()));
}

const root = {
    Raise: () => print('raise'),
    Quit: () => imports.system.exit(0),
    CanQuit: true,
    CanRaise: true,
    HasTrackList: false,
    Identity: 'QuickMusic Test Player',
    SupportedUriSchemes: [],
    SupportedMimeTypes: [],
};

const player = {
    PlayPause: () => setStatus(status === 'Playing' ? 'Paused' : 'Playing'),
    Play: () => setStatus('Playing'),
    Pause: () => setStatus('Paused'),
    Stop: () => setStatus('Stopped'),
    Next: () => skip(1),
    Previous: () => skip(-1),
    get PlaybackStatus() {
        return status;
    },
    get Metadata() {
        return metadata();
    },
    CanControl: true,
    CanPlay: true,
    CanPause: true,
    CanGoNext: true,
    CanGoPrevious: true,
    CanSeek: false,
};

const loop = new GLib.MainLoop(null, false);

Gio.bus_own_name(
    Gio.BusType.SESSION,
    NAME,
    Gio.BusNameOwnerFlags.NONE,
    connection => {
        Gio.DBusExportedObject.wrapJSObject(ROOT_XML, root).export(connection, PATH);
        playerExport = Gio.DBusExportedObject.wrapJSObject(PLAYER_XML, player);
        playerExport.export(connection, PATH);
    },
    () => print('ready'),
    () => {
        printerr(`could not own ${NAME}`);
        loop.quit();
    },
);

loop.run();
