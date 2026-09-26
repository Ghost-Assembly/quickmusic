# Security policy

## Supported versions

The most recent release. QuickMusic targets a single GNOME Shell major version
at a time; older releases are not patched.

## Reporting a vulnerability

Report privately through
[GitHub's advisory form](https://github.com/Ghost-Assembly/quickmusic/security/advisories/new)
rather than opening an issue.

Please include the GNOME Shell version, the QuickMusic version, the player and
its version, and the steps to reproduce. You can expect an acknowledgment
within a week.

## Scope

QuickMusic reads MPRIS properties from players on your session bus and sends
them four commands: PlayPause, Next, Previous and Raise. It never starts a
player (proxies are created with `DO_NOT_AUTO_START`) and grants nothing a
process on your session bus could not already do.

Every player is another application, so everything it publishes is untrusted:

- **Text is shown as text only.** Titles, artists, albums and player names are
  flattened to one line, capped at 256 characters, and set on labels without
  markup. They are never used to build a path, a command, or markup.
- **Cover art is fetched only from `https://` or `file://`.** Any other scheme
  — `http`, `smb`, `sftp`, `data` — is refused and the generic icon shown, so a
  player cannot make the Shell open an arbitrary connection. Fetching is done
  by GVfs, as for the Shell's own media controls.
- **Nothing identifying what you listen to is logged.** The extension logs its
  enable line and, at debug level, which player it shows and whether it is
  playing — never the track.

The parts worth scrutinizing are `modules/model.js` (`parseMetadata`,
`safeArtUrl`) and `modules/mpris.js`.
