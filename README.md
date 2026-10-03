# QuickMusic

<!-- quick-template:badges:start -->

[![CI](https://github.com/Ghost-Assembly/quickmusic/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Ghost-Assembly/quickmusic/actions/workflows/ci.yml)
[![Security](https://github.com/Ghost-Assembly/quickmusic/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/Ghost-Assembly/quickmusic/actions/workflows/security.yml)
[![Docs](https://img.shields.io/website?url=https%3A%2F%2Fghost-assembly.com%2Fquickmusic%2F&label=docs)](https://ghost-assembly.com/quickmusic/)
[![Release](https://img.shields.io/github/v/release/Ghost-Assembly/quickmusic)](https://github.com/Ghost-Assembly/quickmusic/releases/latest)
[![License](https://img.shields.io/github/license/Ghost-Assembly/quickmusic)](https://github.com/Ghost-Assembly/quickmusic/blob/main/LICENSE)
[![GNOME](https://img.shields.io/badge/GNOME-50-blue)](https://ghost-assembly.com/quickmusic/#install)
[![Security issues](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fsonarcloud.io%2Fapi%2Fmeasures%2Fcomponent%3Fcomponent%3DGhost-Assembly_quickmusic%26metricKeys%3Dsoftware_quality_security_issues&query=%24.component.measures%5B0%5D.value&label=Security+issues)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quickmusic)
[![Reliability issues](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fsonarcloud.io%2Fapi%2Fmeasures%2Fcomponent%3Fcomponent%3DGhost-Assembly_quickmusic%26metricKeys%3Dsoftware_quality_reliability_issues&query=%24.component.measures%5B0%5D.value&label=Reliability+issues)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quickmusic)
[![Maintainability issues](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fsonarcloud.io%2Fapi%2Fmeasures%2Fcomponent%3Fcomponent%3DGhost-Assembly_quickmusic%26metricKeys%3Dsoftware_quality_maintainability_issues&query=%24.component.measures%5B0%5D.value&label=Maintainability+issues)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quickmusic)
[![Duplication](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fsonarcloud.io%2Fapi%2Fmeasures%2Fcomponent%3Fcomponent%3DGhost-Assembly_quickmusic%26metricKeys%3Dduplicated_lines_density&query=%24.component.measures%5B0%5D.value&label=Duplication)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quickmusic)
[![Coverage](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fsonarcloud.io%2Fapi%2Fmeasures%2Fcomponent%3Fcomponent%3DGhost-Assembly_quickmusic%26metricKeys%3Dcoverage&query=%24.component.measures%5B0%5D.value&label=Coverage)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quickmusic)
[![Sonar policy](https://github.com/Ghost-Assembly/quickmusic/actions/workflows/sonar.yml/badge.svg?branch=main)](https://sonarcloud.io/dashboard?id=Ghost-Assembly_quickmusic)
<!-- quick-template:badges:end -->

What is playing, in Quick Settings and the top bar, with play/pause, previous
and next for any MPRIS player.

Shows the current track from any MPRIS player — Spotify (including the
Flatpak), browsers, Rhythmbox, VLC and the rest — with play/pause, previous,
next and a button to bring the player to the front.

**[Documentation →](https://ghost-assembly.com/quickmusic/)** —
architecture, testing, packaging and releasing.

## What it does

- **Quick Settings tile.** Title and artist; click to play or pause. The arrow
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

## Preferences

| Setting             | Default       | Note                                                   |
| ------------------- | ------------- | ------------------------------------------------------ |
| Show in the top bar | on            | Hidden while nothing is playing or paused, either way  |
| Top bar label width | 40 characters | 10 to 120. Longer text is cut with an ellipsis         |
| Pinned player       | none          | Set from the Quick Settings picker; "Forget" clears it |

## Install

<!-- quick-template:install:start -->

Requires GNOME Shell 50. Requires an MPRIS-compatible media player on your session bus.

### From a release

Download the latest release ZIP and install it for your user. xh is a download tool; you can also download the ZIP from GitHub in a browser. Installing compiles the settings schema.

```sh
xh --download GET https://github.com/Ghost-Assembly/quickmusic/releases/latest/download/quickmusic@napalm255.github.io.shell-extension.zip
gnome-extensions install --force quickmusic@napalm255.github.io.shell-extension.zip
```

Log out and back in so GNOME discovers the extension, then enable it:

```sh
gnome-extensions enable quickmusic@napalm255.github.io
```

### From a clone

Install mise and activate it in your shell. Clone the repository, install its pinned tools, and build and install the same ZIP used for releases:

```sh
git clone https://github.com/Ghost-Assembly/quickmusic.git
cd quickmusic
mise install
mise exec -- just setup
mise exec -- just install
```

Log out and back in, then run just enable. Run just prefs to open preferences. After updating a loaded extension, start a new session to load its new code; opening preferences does not reload GNOME Shell.
<!-- quick-template:install:end -->

## Uninstall

<!-- quick-template:uninstall:start -->

Disable and uninstall the extension for your user. These commands preserve saved settings and other user data.

```sh
gnome-extensions disable quickmusic@napalm255.github.io
gnome-extensions uninstall quickmusic@napalm255.github.io
```

From a clone, just uninstall performs the same steps. Disabling with just disable leaves the extension installed.
<!-- quick-template:uninstall:end -->

## Testing

<!-- quick-template:testing:start -->

just test runs the JavaScript suite with Vitest, the shared tooling tests, and any project-specific offline suites. just coverage reports runtime JavaScript and Python tooling coverage, including untested files. Test stubs and generated reports are not runtime source.

just test-docs runs Playwright and axe in Chromium and Firefox: dark and light accessibility checks, keyboard navigation, mobile layout, reduced motion, links, metadata, local assets, and no page JavaScript. Automated accessibility checks still require human review of reading and focus order.

just test-live checks the package and runs isolated GNOME lifecycle checks. It is a separate local check, not proof of compatibility from a hosted runner. Verify each declared GNOME version and complete the project's manual checks before releasing.
<!-- quick-template:testing:end -->

### Project checks

The isolated Shell check uses a fake MPRIS player on a private bus. Run just mpris-check against your real session bus and verify discovery, playback controls, and player exit with the players you use.

## Packaging

<!-- quick-template:packaging:start -->

```sh
just build
just pack-check
```

The output is quickmusic@napalm255.github.io.shell-extension.zip at the repository root, with metadata.json at the archive root. Python's standard library packages the explicit runtimeFiles allowlist in quick-project.json, using stable file order and timestamps.

just pack-check compares both filenames and file contents with GNOME's official packer and validates shipped icons. Docs, tests, dependencies, credentials, downloaded binaries, and development artifacts stay outside the ZIP. Update the runtime allowlist when adding a runtime file.
<!-- quick-template:packaging:end -->

## Releasing

<!-- quick-template:releasing:start -->

Run just ci, just test-live, and the project manual checklist. Set metadata.json version-name and package.json version to the same new version. The GNOME Extensions website assigns the numeric metadata.json version during submission. Update the npm lockfile, regenerate the docs, and commit the reviewed changes to main through a passing pull request.

Create and push a v-prefixed tag for that version. The release workflow verifies the version, main ancestry, and successful required checks for the tagged commit, then attaches its tested ZIP to a GitHub release. It does not upload to extensions.gnome.org; that submission and its review remain manual.
<!-- quick-template:releasing:end -->

## Development

<!-- quick-template:development:start -->

mise.toml pins runtime and CLI versions; justfile owns commands; npm owns development dependencies and the lockfile. GNOME libraries come from the host. On image-based Fedora, use the host's available tools or a toolbox/distrobox for missing system packages; do not layer packages onto the OS.

```sh
just setup        # install pinned tools, dependencies, and browsers
just fmt          # format source and configuration
just lint         # verify template, generated docs, source, and schemas
just test         # JavaScript, Python, and project offline tests
just coverage     # report JavaScript and Python coverage without source exclusions
just test-docs    # Chromium and Firefox documentation checks
just security     # dependencies, secrets, and workflow checks
just build        # build the runtime-only extension ZIP
just pack-check   # compare files and contents with GNOME's packer
just ci           # complete local verification and packaging
just test-live    # isolated GNOME lifecycle and project integration checks
just docs         # serve the static site at localhost:8000
just template-check  # verify the pinned canonical template
just template-status # report a newer approved template revision
```

GitHub requires local verification, security analysis, and completed Sonar analysis. The shared Sonar policy requires zero security, reliability, and maintainability issues and zero duplicated lines. PR checks cover changed code; main checks cover the entire project. Missing configuration fails instead of silently skipping analysis. Pages publishes the tested docs only after the required checks pass on main.

Common tooling and these instructions are generated from a pinned canonical template. Change that source and synchronize its approved revision; do not edit generated sections or locally bless drift. Extension-specific behavior belongs in project configuration and project.just.
<!-- quick-template:development:end -->

## License

GPL-3.0-or-later.
