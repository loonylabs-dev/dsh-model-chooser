# CLAUDE.md — dsh-model-chooser

Session rules for working ON this repository. The README describes what the plugin
does; this file binds how sessions CHANGE it. It stays small: rules that bind every
session and were paid for once.

## Start of session

- The gate is `npm test` (41 tests, under a second). Green before AND after a
  change; nothing gets committed on a red or unrun gate.
- `node --test test/delegation-chooser.client.test.js` alone runs the client-half
  tests: they load `client.js` through the same `window.__ModuleLoader__.load()`
  seam the harness uses, with React replaced by a recording stub, so the dialog's
  rendered tree and its answers are asserted without a browser.
- **The profile consumes the PUBLISHED package, so an edit here reaches no session
  by itself.** This plugin is on npm and the web profile depends on `^0.1.0`. The
  loop is: edit → `npm test` → `npm version patch` → `npm publish` (whose
  `prepublishOnly` runs the tests) → `dsh plugin --profile web install` → reload the
  page. A `file:` install instead hard-links each file (measured: the file tools
  replace a file rather than writing through it, which breaks the link, so the
  profile silently keeps the previous content) — that failure mode is why the npm
  path is the default here.
- **After the install: a client-half change needs a page reload, a host-half change
  needs a restart.** The module server serves `client.js` per request, so a reload
  fetches the new one; `index.js` is loaded at boot. Do the reload yourself when you
  can — measured 2026-09-18, a stale client hid a fix for several rounds.
- **A client-half change is not verified until the GUI boots.** The web boot runs
  in the browser and fails as a whole when one entry never activates, so the server
  boot, `--dump-config`, and this package's own tests can all be green while the UI
  is dead. Measured 2026-09-18: a single non-existent inject name took the whole
  interface down and every check available here stayed green. Loading the page once
  after a restart belongs to the change, not to the user.

## Hard rules, each one paid for

- **Never call `directory.select()` from the delegation dialog.** That commits the
  SESSION's model. The dialog answers a delegating tool call, and its answer goes
  back through the question carrier (`respond({ok: true, value: {sessionId,
  answer}})`, the encoding read from the installed `dsh-client-ui-user-questions`).
- **The composer entry claims the router's question and nothing else.** Id
  `subagent-model`, exactly one question in the batch. Returning non-null for any
  other request would replace the stock question card for every plugin.
- **A route the question did not offer must travel as free text.** The host refuses
  a `selected` label that is not among the question's own options, with
  `bad-response` (`matchesQuestions` in `packages/host/apiproxy`, measured
  2026-09-18), and a single-choice question requires `custom` *instead of* a
  selection. The router reads the picked route from there. Offering every catalog
  route as an option would legalize a selection and blow the question up to
  hundreds of entries — that is why it does not.
- **Read the harness's types, not its render code.** The session store's groups are
  `ModelProviderGroup` — `{ id, name, models }` (`packages/client/ui-model-selection`
  `directory.ts`; the type lives in `packages/api/remotes`). The chat seat renders
  from its OWN `{ g, models }` wrapper, and copying that variable name made this
  dialog read `group.g`, skip every group, and show an empty list while the seat
  beside it listed 859 models. Test fixtures use the type's shape, never a render
  variable's — a fixture that mirrors a guess makes a broken plugin look green.
- **The dialog must stay answerable when the list cannot be built.** An empty
  catalog once discarded the whole rendered body, which threw the router's own
  lanes away and left "No matching models" with nothing clickable. The dialog keeps
  those options and says which situation it is in ("model list unavailable"); a
  session without a model directory degrades the same way instead of claiming the
  question and showing nothing.

- **Only one model picker may be installed.** Both this plugin and the upstream
  `dsh-model-garden` register `conversation.input.model` at priority `-1`, and a
  same-priority second registration throws. Installing both breaks the boot.
- **A UI change to the seat is a risk, not a refactor.** The seat is the daily chat
  UI, and the fork brought no UI tests: grow the delegation dialog additively,
  reusing the module-level helpers (`priceFor`, `contextFor`, `hasFav`,
  `isHiddenProvider`, `isCollapsed`, …) and the existing `mg-*` classes, instead of
  restructuring the seat. Unifying both onto one list component is a deliberate
  later step, taken with a hand check in the running app.
- **Every name in `exports.inject` gates the whole web boot.** cordis has no
  optional inject: a service the harness never provides parks the entry in
  `pending` and `dsh-app-boot` fails the ENTIRE boot — no UI, not a missing
  picker. There is no `remote.session` (measured 2026-09-18 against the
  installed packages; the Remote namespaces are `commands`, `goals`,
  `fileReferences`, `pluginInventory`, `messageFeedback`,
  `sessionReferenceResolver`, `dynamicCordisRunner`). A service that may be
  absent is read with `ctx.get()`, or gates only a nested `ctx.inject` scope.
  The list is locked by a case in `test/delegation-chooser.client.test.js`.
- **The client half is ONE file.** The harness module server serves exactly
  `/plugins/<id>/client.js` and its `.map`, so no sibling modules exist in the
  browser; share through helpers in that file, or through host routes.
- **Configuration must not vanish behind the longer list.** The router's lanes stay
  reachable as the **Quick choices** group, descriptions included; hiding them
  would make the router's config silently inert.
- **Never edit the harness's own design tokens or the seat's CSS shape** for the
  dialog: use the `--dsw-*` tokens and the existing classes, so the dialog keeps
  looking like the picker it is.
- **Say what is measured.** Compatibility lines, the test count, and any claim
  about the running app in the README are measurements, not intentions.

## Where learnings get filed

| Learning about | Goes to |
|---|---|
| The delegation dialog's behaviour or answers | `client.js` (the `DelegationChooser` section) plus a case in `test/delegation-chooser.client.test.js` |
| The router's question contract (`::` labels, reserved answers) | `client.js` constants, README "Two places the picker answers" |
| A slot, priority or chain rule of the harness | This file, and a comment at the registration |
| The install/refresh behaviour of `file:` vs published packages | This file, README Installation |
| Anything that only shows up in the running app | A hand check, then a README note |

## Commit style

Thematic commits. The subject is a claim, the body carries the measurement:

`feat: answer the delegation question in the picker — 41/41 tests, and the profile boots with exactly one picker`
