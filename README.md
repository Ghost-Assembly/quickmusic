# QuickMusic

What is playing, in the GNOME quick settings menu and the top bar.

Shows the current track from any MPRIS player — Spotify (including the
Flatpak), browsers, Rhythmbox, VLC and the rest — with play/pause, previous,
next and a button to bring the player to the front.

**[Documentation →](https://ghost-assembly.github.io/quickmusic/)** —
architecture, testing, packaging and releasing.

## What it does

- **Quick settings tile.** Title and artist; click to play or pause. The arrow
  opens cover art, album, previous / play-pause / next, "Open ‹player›", and a
  player picker. A pinned player that is not running stays listed, marked
  "(not running)", so the pin can be seen and undone.
- **Top bar item.** "Artist – Title" while something is playing or paused,
  hidden otherwise. Left-click plays and pauses; right-click opens the same controls.
  From the keyboard, Enter or Space plays and pauses and the Menu key (or
  Shift+F10) opens the controls.
- **Follows the active player.** Whichever started playing most recently, and
  the last one used once nothing is. Pin one from the picker to stay on it.

## Requires

- GNOME Shell 50
- A player that speaks MPRIS. Most do. A Flatpak player also needs its
  manifest to allow `org.mpris.MediaPlayer2.<name>` on the session bus;
  Spotify's does.
- GVfs for cover art served over https. It is part of a standard GNOME install,
  and the Shell's own media controls rely on it too.

## Install

```bash
curl -LO https://github.com/Ghost-Assembly/quickmusic/releases/latest/download/quickmusic@napalm255.github.io.shell-extension.zip
gnome-extensions install --force quickmusic@napalm255.github.io.shell-extension.zip
gnome-extensions enable quickmusic@napalm255.github.io
```

From a clone:

```bash
just setup
just install
just enable
```

A newly installed extension is picked up when the Shell next starts; on
Wayland, log out and back in.

## Preferences

| Setting             | Default       |                                                        |
| ------------------- | ------------- | ------------------------------------------------------ |
| Show in the top bar | on            | Hidden while nothing is playing or paused, either way  |
| Top bar label width | 40 characters | Longer text is cut with an ellipsis                    |
| Pinned player       | none          | Set from the quick settings picker; "Forget" clears it |

## Develop

```bash
just              # list every recipe
just test         # unit suite
just test-docs    # the docs site in Chromium and Firefox
just lint         # eslint, prettier, gschema, shellcheck
just ci           # what CI runs: lint, tests, security, build
just test-live    # headless gnome-shell, bundle and live-bus checks
just mpris-check  # list the players on this session bus
just fake-player  # put a test player on the bus
just docs         # serve the documentation site
```

The suite runs on plain Node. Every decision lives in `modules/model.js`, which
imports nothing; `modules/mpris.js` is D-Bus plumbing only and is checked
against a real bus by `just test-live` — see the
[architecture notes](https://ghost-assembly.github.io/quickmusic/#architecture).

## Releasing

Set the version in `metadata.json` (`version-name`) and `package.json`, commit,
then tag and push. The release workflow refuses a tag that disagrees with
either file.

## License

GPL-3.0-or-later.
