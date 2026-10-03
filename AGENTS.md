# Working on QuickMusic

QuickMusic is a GNOME Shell extension: what is playing, in Quick Settings and
the top bar, for any MPRIS player. README.md is for humans; this file holds
the rules an agent working in this repository must not break.

## What gets published

- `just build` produces `quickmusic@napalm255.github.io.shell-extension.zip`.
  A `vX.Y.Z` tag triggers `.github/workflows/release.yml`, which verifies
  version agreement, main ancestry, and successful CI for the exact commit,
  then publishes that tested artifact without rebuilding it.
- Docs at https://ghost-assembly.com/quickmusic/ are deployed by the Pages
  workflow from the tested `docs/` artifact after all required checks pass on main.
- GNOME Extension Store submission and review remain manual.
- One-liner and links: the same one-liner lives in README.md's opening
  paragraph and `metadata.json`'s `description`. Keep the two in sync when
  either changes. The GitHub repository description/homepage and the hub
  card and profile row in the other Ghost Assembly repositories carry the
  same text — see **Cross-repo duties**.

## Commands

Tool versions live in `mise.toml`; common commands live in the canonical
`justfile`; project-specific commands and hooks live in `project.just`.
Run `just ci` before claiming a change works.

| Command                                                                | Does                                                                                            |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `just setup`                                                           | Install pinned tools, npm development dependencies, and Chromium/Firefox; check host tools      |
| `just fmt`                                                             | Format JavaScript, Python, configuration, and generated documentation                           |
| `just lint`                                                            | Verify canonical files, generated docs, ESLint, Prettier, Ruff, schemas, and shell scripts      |
| `just template-check`                                                  | Compare managed files with the immutable GitHub revision in `quick-template.lock.json`          |
| `just template-sync SHA`                                               | Synchronize a reviewed canonical revision; then install dependencies and regenerate docs        |
| `just test`                                                            | Run Vitest, Python tooling tests, and project offline integration tests                         |
| `just coverage`                                                        | Measure all runtime JavaScript, including untested files                                        |
| `just test-docs`                                                       | Check docs in Chromium and Firefox, including axe accessibility audits                          |
| `just security`                                                        | Run OSV, source and history secret scans, Trivy, actionlint, and Zizmor                         |
| `just build`                                                           | Build a deterministic runtime-only ZIP with Python's standard library                           |
| `just pack-check`                                                      | Compare every ZIP filename and byte with GNOME's official packer; validate icons                |
| `just test-live`                                                       | Check packaging, then isolated GNOME lifecycle and project integration hooks                    |
| `just run`                                                             | Run GNOME Shell in a development window                                                         |
| `just install` / `enable` / `disable` / `uninstall` / `prefs` / `logs` | Work with the extension in your logged-in session                                               |
| `just docs`                                                            | Serve the static site at localhost:8000                                                         |
| `just ci`                                                              | Run lint, tests, coverage, docs, security, and packaging; GitHub also requires CodeQL and Sonar |
| `just clean`                                                           | Confirm before removing generated build and test output                                         |

Live checks require an installed GNOME Shell and run outside hosted CI.
Complete the manual checklist and test each declared GNOME version before releasing.

Project commands: `just mpris-check` lists players on the session bus;
`just fake-player` starts a test player. `test-live` also runs `mpris-check`.

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
- Shared tooling comes from the pinned canonical `quick-template` revision.
  Keep local hooks in `project.just` and generated documentation current.

## Tests

- Write the failing test first.
- `just test` uses Vitest with recording GNOME stubs; `just coverage`
  measures all runtime JavaScript, including untested files. Native and live
  integration checks remain separate from that coverage report.
- `just test-live` (`scripts/headless-check.sh`): boots a throwaway headless
  GNOME Shell, puts `scripts/fake-player.js` on a private session bus, and
  checks the tile picks up a new player, follows a pause, drops a player that
  quits, and survives a disable and re-enable with no JavaScript error. Two
  leak checks run after the re-enable: the shell log must show no signal or
  object lifetime warnings (`No signal handler`, `instance with invalid`,
  `Object … has been already deallocated`) and no outlived `GSource`
  (`Source ID … was not found`, `GSource … still active`). Then
  `scripts/build.py --check`: the built zip must match what
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
- Shared tooling comes from the pinned canonical `quick-template` revision.
  Keep local hooks in `project.just` and generated documentation current.

## Template files

`quick-template.lock.json` pins a full commit SHA from
`Ghost-Assembly/quick-template`. `just template-check` compares managed files
with that immutable GitHub archive; a local manifest cannot approve drift.
Change shared tooling in the canonical repository, then run
`just template-sync SHA`, `npm ci --ignore-scripts`, `just docs-generate`, and
`just ci` in this checkout. The weekly freshness check reports newer approved
releases without adopting them automatically.

Project hooks belong in `project.just`, runtime packaging inputs in
`quick-project.json`, documentation identity in `docs/project.json`, and local
styling in `docs/project.css`. Common README and site sections are generated;
keep extension-specific content outside their markers. Lifecycle test scripts
remain specific to the extension.

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
