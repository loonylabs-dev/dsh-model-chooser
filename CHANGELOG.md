# Changelog

Notable changes to `dsh-model-chooser`, newest first. A feature addition bumps the
minor (`0.x.0`); a fix, a documentation change, or a manifest change bumps the
patch (`0.0.x`).

## 0.1.1

### Changed

- **Documentation and manifest only: no code changed between 0.1.0 and 0.1.1.**
  Measured against the two published file sets, the release differs in exactly
  `README.md` (24,553 → 24,866 bytes) and `package.json` (the version string; same
  length, different content). Every other file is byte-identical, which is why
  this is a patch and not a minor.
- The README caught up with the installation the profile actually uses: this
  package is consumed from npm, so an edit in the working copy reaches no running
  session by itself. The loop is edit → `npm test` → `npm version patch` →
  `npm publish` (whose `prepublishOnly` runs the tests) → `dsh plugin --profile web
  install` → reload the page.

## 0.1.0

### Added

- First release, forked from `mrdevlorx/dsh-model-garden` (MIT, upstream version
  0.7.1), renamed, and re-versioned — the upstream licence and the attribution
  line in the README stay, everything that carried the old name (package, loader
  row, client module id, host routes, browser storage keys, comments) moved to the
  new one.
- **A searchable, sortable model picker for the chat seat**: provider groups,
  favourites, a hidden-models blacklist, models.dev prices and context windows, the
  live per-task cost, and a local-model filter.
- **The same picker for a delegation**: the child's provider and model are chosen
  before it starts, from the lanes the plugin offers, instead of inheriting the
  parent's route. The dialog names the task it is asking about, so the choice is
  made with the work in view.
- **One refresh button re-syncs every provider model list from its live API**,
  behind a single-flight gate: a second click while a pass is running joins the
  pass instead of starting one, and a pass that throws releases the gate rather
  than leaving a dead button. `bin/refresh-models.mjs` runs the same pass from a
  shell.
- `docs/` carries the screenshots the README shows; 41 tests cover the cost
  endpoint, the refresh core, the refresh endpoint, and the delegation chooser.
