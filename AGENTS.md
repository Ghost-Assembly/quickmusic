# Working on QuickMusic

QuickMusic is a GNOME Shell extension: what is playing, in Quick Settings and
the top bar, for any MPRIS player. README.md is for humans; this file holds
the rules an agent working in this repository must not break.

## What gets published

- A GitHub Release per tag: the installable
  `quickmusic@napalm255.github.io.shell-extension.zip`, built by
  `.github/workflows/release.yml` and gated on `just ci` passing first.
- The documentation site at `https://ghost-assembly.com/quickmusic/`
  (the old `ghost-assembly.github.io` URL 301s there), served from this
  repository's `main` branch, `/docs` folder, through GitHub Pages.
- Nothing is uploaded to extensions.gnome.org from CI — that needs the
  account password and goes to human review either way.
- One-liner and links: the same one-liner lives in README.md's opening
  paragraph and `metadata.json`'s `description`. Keep the two in sync when
  either changes. The GitHub repository description/homepage and the hub
  card and profile row in the other Ghost Assembly repositories carry the
  same text — see **Cross-repo duties**.

## Commands

Table from the `justfile` (shared across the extensions) and `project.just`
(this repository's own). Run `just ci` before claiming done.

| Recipe                                                   | Does                                                                                                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `just setup`                                             | `mise install`, `npm ci`, installs Playwright's browsers, checks for the system tools (`gjs`, `glib-compile-schemas`, `gnome-shell`, `gnome-extensions`, `rsync`, `zip`, `unzip`, `jq`) |
| `just fmt`                                               | `prettier --write` + `eslint --fix`                                                                                                                                                     |
| `just lint`                                              | `template-check`, eslint, prettier check, `glib-compile-schemas --strict --dry-run`, shellcheck                                                                                         |
| `just template-check`                                    | Checks the shared template files against `template.sha256`; `--write` regenerates it                                                                                                    |
| `just test`                                              | The unit suite (vitest)                                                                                                                                                                 |
| `just test-docs`                                         | This site, in Chromium and Firefox (Playwright)                                                                                                                                         |
| `just coverage`                                          | The unit suite with a coverage report                                                                                                                                                   |
| `just security`                                          | osv-scanner, gitleaks, trivy, actionlint, zizmor                                                                                                                                        |
| `just build`                                             | The installable zip                                                                                                                                                                     |
| `just ci`                                                | What CI runs, in order: `lint`, `test`, `test-docs`, `security`, `build` — the required status check                                                                                    |
| `just test-live`                                         | Builds, then `scripts/headless-check.sh`, `scripts/pack-check.sh`, and `live-extra` if defined                                                                                          |
| `just pack-check`                                        | Compares the built zip against `gnome-extensions pack`'s output                                                                                                                         |
| `just mpris-check`                                       | Lists the players on this session bus, through `modules/mpris.js`                                                                                                                       |
| `just fake-player`                                       | Puts a test MPRIS player on the session bus                                                                                                                                             |
| `just run`                                               | A Shell in a window, via `mutter-devkit`                                                                                                                                                |
| `just install` / `enable` / `disable` / `prefs` / `logs` | Copy into, or talk to, a real installed extension                                                                                                                                       |
| `just docs`                                              | Serve this site on localhost:8000                                                                                                                                                       |

`just test-live`, `pack-check`, `mpris-check`, `fake-player`, `run`, `install`,
`enable`, `disable`, `prefs` and `logs` all need a real GNOME Shell or session
bus; none of them run in CI. Everything else needs only the pinned toolchain
from `just setup`.

## Hard constraints

- **The uuid is fixed.** `quickmusic@napalm255.github.io`, read out of
  `metadata.json` by the `justfile`'s `_uuid` and never written down a second
  time. The site domain (`ghost-assembly.github.io` → `ghost-assembly.com`)
  may change; this never does.
- **Decisions live in gi-free modules.** `modules/model.js` imports nothing
  and decides everything about what to show and when; `modules/mpris.js` is
  D-Bus plumbing only, `modules/panel.js` only turns model.js's answers into
  actors. A change that teaches panel.js or mpris.js a new decision belongs
  in model.js instead.
- **Players are untrusted.** Every string from MPRIS — title, artist, album,
  player name — is set as `text`, never markup, flattened to one line and
  capped at 256 characters. Cover art is fetched only from `https://` or
  `file://`; any other scheme shows the generic icon. See SECURITY.md before
  changing `modules/model.js`'s `parseMetadata` or `safeArtUrl`.
- **Nothing about what you listen to is logged.** The extension logs its
  enable line and, at debug level, which player it shows and whether it is
  playing — never the track. `scripts/headless-check.sh` greps for the
  `[quickmusic] showing <player> <status>` line; keep that prefix and shape
  stable.
- **No JavaScript on the docs pages.** `docs/index.html` ships no `<script>`;
  `just test-docs` fails the build if one appears.
- **The shared template files are byte-locked.** Everything in
  `template.list` is identical, byte for byte, across every Ghost Assembly
  GNOME Shell extension and is checked by `just template-check`. Do not hand
  edit one; a change to the shared behavior goes through all of them
  together, and `template-check --write` only regenerates the checksum
  afterwards. Project-specific style goes in `docs/project.css`; project
  recipes in `project.just`; this site's own URL and section list in
  `tests/docs.config.js`.

## Tests

- Write the failing test first.
- Unit suite (`just test`, vitest): `modules/**`, `extension.js` and
  `prefs.js` are the coverage universe. `prefs.js` (Adw/Gtk widget
  construction only) and `modules/mpris.js` (D-Bus plumbing, checked instead
  against a real bus) are excluded — identically in `vitest.config.js` and
  `sonar-project.properties`, so the two agree. Stubs for `gi://` and
  `resource:///` imports live in `tests/stubs/`; a small fake Shell world is
  in `tests/support/`.
- `just test-live` (`scripts/headless-check.sh`): boots a throwaway headless
  GNOME Shell, puts `scripts/fake-player.js` on a private session bus, and
  checks the tile picks up a new player, follows a pause, drops a player that
  quits, and survives a disable and re-enable with no JavaScript error or
  leaked signal. Then `scripts/pack-check.sh`: the built zip must match what
  `gnome-extensions pack` produces, `metadata.json` must sit at the archive
  root, and every icon in `icons/` must actually decode.
- `just test-docs` (Playwright, Chromium and Firefox): this site's rules —
  axe in both color schemes, no JavaScript, no request to another origin, no
  sideways scrolling at 360px.

## Conventions

- Conventional Commits, imperative subject, no trailing period.
- PRs are squashed on merge (the repository's ruleset allows no other
  method).
- Third-party GitHub Actions are pinned by commit SHA, never a tag.
- American English in prose, comments, identifiers and commit messages.
- "Quick Settings" (capitalized) in prose, `metadata.json`'s description,
  gschema summaries/descriptions and the wording `modules/settings.js`
  hands to `prefs.js` — code identifiers (`show-panel-indicator`, and the
  like) unchanged.
- Nothing personal anywhere in code, tests, fixtures or docs.
- Committed docs: README.md, AGENTS.md (this file), CLAUDE.md (`@AGENTS.md`,
  so an agent reading either finds the same rules), SECURITY.md, and the
  site under `docs/`. Nothing else is the source of truth for a rule stated
  here.

## Cross-repo duties

This repository is one of several under Ghost Assembly. Keep these in sync
with the one-liner above whenever it changes:

- The QuickMusic card on the Ghost Assembly hub site, and its `site.spec.js`
  check.
- The QuickMusic row on the maintainer's profile.
- The GitHub repository's About description and homepage URL.
- The shared template files in `template.list`: a change to one of them is
  made in every extension repository together, never here alone.

The site domain is `https://ghost-assembly.com/`; the old
`ghost-assembly.github.io` URLs 301 there. Replace only the literal
`ghost-assembly.github.io` host if you find it — the extension uuid
(`@napalm255.github.io`) is a different string and must not change.

## Settings keys

`modules/settings.js` is the single source of truth: `KEYS` (the schema key
names), and `SETTINGS` (each key's gschema type plus the label and detail
text `prefs.js` shows). It imports nothing, so it is checked on plain Node
against the gschema by `tests/settings.test.js` — key set, type per key, and
that every key has non-empty wording.

Adding, renaming or removing a setting means updating all three together,
in this order, or the cross-check test fails:

1. `schemas/org.gnome.shell.extensions.quickmusic.gschema.xml` — the type,
   default, summary and description (and `<range>` for `panel-max-chars`,
   currently 10–120).
2. `modules/settings.js` — the key constant, its `SETTINGS` entry, and any
   place in `modules/panel.js` that reads it through `KEYS`.
3. `prefs.js` — only if the widget it needs is not already covered by
   `describe()`'s label/detail lookup (a `SpinRow` needs its own
   `Gtk.Adjustment` bounds, kept equal to the gschema's `<range>`).
