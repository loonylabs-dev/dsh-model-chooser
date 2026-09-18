# Contributing

This repository is the model picker of the DeepSeek Harness Web UI. It fills two seats with one plugin: the composer's model seat (the session's own model) and a delegation's model question (the model a child should run on).

It is a fork of [mrdevlorx/dsh-model-garden](https://github.com/mrdevlorx/dsh-model-garden) at 0.7.1, adopted under the MIT license — the copyright notice stays in [LICENSE](LICENSE) and the README states the origin. Beyond the fork point this is our own line: we maintain it, we extend it, and we fix it when a harness upgrade breaks it.

## What the code here is like

Nine rules govern changes to this repository. Each was paid for once; the inline comments say where.

**1. The seat and the delegation dialog commit through different doors.** The seat calls the harness's model directory (`directory.select`) for the SESSION's model. The delegation dialog must never do that — it answers a delegating tool call, and its answer travels back through the question carrier. Confusing the two changes the wrong model.

**2. The dialog claims the router's question and nothing else.** Id `subagent-model`, exactly one question in the batch. A selector that returns non-null for anything else replaces the stock question card for every plugin in the profile.

**3. Only one model picker may be installed.** Both this plugin and the upstream `dsh-model-garden` register `conversation.input.model` at priority `-1`, and a second registration at the same priority throws. Installing both breaks the boot.

**4. A change to the seat is a risk, not a refactor.** The seat is the daily chat UI and the fork brought no UI tests. Grow the delegation dialog additively — reusing the module-level helpers and the existing `mg-*` classes — and treat unifying the two onto one list component as its own change, verified by hand in the running app.

**5. The browser half is ONE file.** The harness module server serves exactly `/plugins/<id>/client.js` and its `.map`, so no sibling modules exist in the browser. Share through helpers in that file, or through a host route.

**6. The dialog must stay answerable when the list is not.** A session without a model directory must degrade and leave the router's own options reachable, rather than claiming the question and showing nothing.

**7. Configuration must not vanish behind the longer list.** The router's configured lanes stay reachable as the **Quick choices** group, descriptions included. Hiding them would make another plugin's configuration silently inert.

**8. Use the harness's own surfaces.** The `--dsw-*` design tokens, the existing `mg-*` classes, and the harness's own answer encoding (`respond({ok: true, value: {sessionId, answer}})`) — read out of the installed client, never guessed.

**9. The host routes stay loopback-only and same-origin.** `/model-chooser/refresh-models` writes settings, so it keeps its cross-site rejection; a new route that touches credentials or the filesystem needs the same care.

## Layout

| Path | Owns |
|---|---|
| `client.js` | the browser half: the composer seat, the delegation dialog, prices, favorites, hidden list |
| `index.js` | the host half: the cost, catalog, server-models and refresh routes |
| `lib/refresh-core.js` | discovery and merge for provider model lists |
| `lib/pi-catalog.js` | locating and loading the installed pi-ai catalog |
| `bin/refresh-models.mjs` | the same refresh from a shell, without a running dsh |
| `cordis.patch.yml` | the row this package contributes to the profile |
| `docs/*.png` | the picker screenshots the README shows |

## Testing

```sh
npm test   # 45 tests, under a second; no harness packages, no browser
```

Four files, three lanes, all in this package:

* `test/cost-endpoint.test.js`, `test/refresh-endpoint.test.js`, `test/refresh-core.test.js` — the host routes and the refresh arithmetic, with the two external things faked (the settings file and the provider APIs).
* `test/delegation-chooser.client.test.js` — the client half. It loads `client.js` through the same `window.__ModuleLoader__.load()` seam the harness uses, with React replaced by a recording stub, so the dialog's rendered tree and the answers it delivers are asserted without a browser. A change to the dialog's behaviour belongs here.
* `test/panel-placement.client.test.js` — the same seam, with hooks that can re-render and a ReactDOM that records portals, so the seat's panel can be clicked open and measured. It asserts that the panel leaves the composer's subtree and lands clamped inside the viewport; it is the guard for the one defect a stylesheet cannot fix (a host column that clips its overflow).

The seat's list itself has no automated coverage; a change to it is verified by hand in a running `dsh web`.

## Commits

Thematic commits. The subject is a claim, the body carries the measurement that supports it:

`feat: answer the delegation question in the picker — 41/41 tests, and the profile boots with exactly one picker`

## Version and changelog

`CHANGELOG.md` is part of a change, not a release chore: a commit that alters
behavior, output, or the public surface updates it in the same commit, and the
entry leads with the claim the change makes rather than with the file it touched.

The version says which kind of change it was:

| Change | Bump |
|---|---|
| A feature addition | minor — `0.x.0` |
| A fix, a documentation change, a test change, a manifest change | patch — `0.0.x` |

`prepublishOnly` runs `npm test`, so the publish path is the release gate: a red
suite publishes nothing.

## Everything in English

Code, comments, docs, dialog copy, log lines, and commit messages are English. Only harness vocabulary the plugin reports keeps its upstream spelling.
