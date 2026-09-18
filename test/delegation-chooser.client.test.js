/**
 * The delegation chooser: which question it claims, what it renders, and what it
 * answers with.
 *
 *   node --test test/delegation-chooser.client.test.js
 *
 * There is no browser here, and the plugin ships no build step. So the client half
 * is loaded through the same `window.__ModuleLoader__.load()` seam the harness
 * uses, with React replaced by a stub that records the element tree instead of
 * rendering it. That is enough to assert the two things that would otherwise only
 * be visible by hand: the composer entry claims the router's question and nothing
 * else, and a click delivers the route label the router expects.
 *
 * The stub is a stand-in for an external library (React), never for harness code.
 */
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const CLIENT_URL = new URL('../client.js', import.meta.url)

/** Minimal React: enough for a component that only reads state during render. */
function reactStub() {
  return {
    createElement(type, props, ...children) {
      return { type, props: { ...(props ?? {}), children: children.length <= 1 ? children[0] : children } }
    },
    useMemo: factory => factory(),
    useCallback: fn => fn,
    useEffect: () => {},
    useState: initial => [initial, () => {}],
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useRef: value => ({ current: value }),
  }
}

/**
 * Load the client half and capture both slot registrations.
 * @returns the registrations, the plugin exports, and the fake services.
 */
async function loadClient({ groups = [], sessions, directories = true } = {}) {
  let captured
  globalThis.window = { __ModuleLoader__: { load: spec => { captured = spec } } }
  await import(`${CLIENT_URL.href}?t=${Date.now()}`)
  assert.ok(captured, 'the client half must register itself with the module loader')
  assert.equal(captured.id, 'dsh-model-chooser')

  const registrations = []
  const slots = {
    inject: (name, contribute) => contribute(),
    register: (options, component) => {
      registrations.push({ options, component })
      return () => {}
    },
  }
  const modelDirectories = directories
    ? {
      directoryFor: () => ({
        store: { subscribe: () => () => {}, getSnapshot: () => ({ current: null, groups, failures: [], status: 'loaded', error: null }) },
        load: async () => {},
      }),
    }
    : undefined
  const scope = { slots, modelDirectories, sessions }
  const ctx = {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    inject: (_services, callback) => callback(scope),
    effect: () => () => {},
  }
  const exports_ = captured.factory(specifier => {
    if (specifier === 'react') return reactStub()
    throw new Error(`unexpected require: ${specifier}`)
  })
  exports_.apply(ctx)
  return { registrations, exports: exports_, slots, modelDirectories }
}

/** One pending question carrier, as the question service hands it to a UI. */
function carrier({ questions, sessionId = 'session-1' }) {
  const deliveries = []
  return {
    deliveries,
    wait: {
      key: 'q1',
      sessionId,
      payload: { questions },
      respond: async receipt => {
        deliveries.push(receipt)
        return { accepted: true }
      },
    },
  }
}

/** The router's question, as it looks with no lanes configured. */
function routerQuestion(overrides = {}) {
  return {
    id: 'subagent-model',
    header: 'Subagent model',
    question: 'Which model should run this delegation?',
    detail: 'Task: Check the flaky test\nRoute without this choice: requesty/deepseek-v4.1-flash',
    options: [
      { label: 'Keep the parent model (requesty::deepseek/deepseek-v4.1-flash)' },
      { label: 'Auto for this session' },
    ],
    ...overrides,
  }
}

/**
 * What the session's model directory actually holds: the harness's
 * `ModelProviderGroup`, i.e. `{ id, name, models }` — read from
 * `packages/client/ui-model-selection/src/client/directory.ts` (`state.groups`)
 * and the type in `packages/api/remotes`. It is NOT the `{ g, models }` wrapper
 * the chat seat builds while rendering; assuming that made this fixture agree
 * with the bug that left the delegation dialog empty while the seat listed 859
 * models.
 */
const MODEL_GROUPS = [
  { id: 'px13', name: 'PX13', models: [{ id: 'qwen36-low', name: 'Qwen 3.8 (fast)' }, { id: 'flashnext-high', name: 'FlashNext (deep)' }] },
  { id: 'requesty', name: 'Requesty', models: [{ id: 'deepseek/deepseek-v4.1-flash', name: 'DeepSeek V4.1' }] },
]

/** Every element in a recorded tree, depth first. */
function elements(node, found = []) {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, found)
    return found
  }
  if (node === null || typeof node !== 'object') return found
  found.push(node)
  if (node.props !== undefined) elements(node.props.children, found)
  return found
}

/** The elements carrying one className, in render order. */
function byClass(tree, className) {
  return elements(tree).filter(element => typeof element.props?.className === 'string'
    && element.props.className.split(' ').includes(className))
}

/** The text of one recorded element, concatenated from its children. */
function textOf(element) {
  const parts = []
  const visit = node => {
    if (node === null || node === undefined || typeof node === 'boolean') return
    if (typeof node === 'string' || typeof node === 'number') {
      parts.push(String(node))
      return
    }
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    visit(node.props?.children)
  }
  visit(element.props?.children)
  return parts.join('')
}

describe('delegation chooser registration', () => {
  it('registers the seat and, separately, the composer entry', async () => {
    const { registrations } = await loadClient()
    assert.deepEqual(registrations.map(entry => entry.options.name), [
      'conversation.input.model',
      'conversation.composer',
    ])
    const composer = registrations[1].options
    assert.equal(composer.priority, -1, 'it must sit ahead of the stock question card at 0')
    assert.equal(typeof composer.select, 'function')
    assert.equal(typeof composer.inject, 'function')
  })

  it('claims only the router question, leaving every other question to the stock card', async () => {
    const { registrations } = await loadClient()
    const select = registrations[1].options.select
    const mine = { kind: 'question', payload: { questions: [routerQuestion()] } }
    const other = { kind: 'question', payload: { questions: [{ id: 'ask-user', question: 'Which one?' }] } }
    const multi = { kind: 'question', payload: { questions: [routerQuestion(), routerQuestion()] } }

    assert.equal(select({ interactions: [other, mine] }), mine)
    assert.equal(select({ interactions: [other] }), null)
    assert.equal(select({ interactions: [multi] }), null, 'a batch is not this question')
    assert.equal(select({}), null)
  })

  it('degrades to the stock card when the session has no model directory', async () => {
    const { registrations } = await loadClient({ directories: false })
    const face = registrations[1].options.inject('session-1')
    assert.equal(face.directory, null)
    assert.equal(face.available, false)
    assert.equal(typeof face.load, 'function')
  })

  it('withholds the entry inside a subagent session, like the seat does', async () => {
    const { registrations, modelDirectories } = await loadClient({ sessions: { subagentAddress: () => 'parent-1' } })
    const face = registrations[1].options.inject('child-1')
    assert.equal(face.available, false, 'a delegated child must not answer its own delegation question')
    assert.ok(face.directory !== null || modelDirectories !== undefined)
  })
})

describe('delegation chooser rendering and answers', () => {
  /** Render the chooser over the router's question. */
  async function render({ questions = [routerQuestion()], groups = MODEL_GROUPS } = {}) {
    const { registrations } = await loadClient({ groups })
    const { wait, deliveries } = carrier({ questions })
    const props = {
      matched: wait,
      ...registrations[1].options.inject('session-1'),
      directory: { subscribe: () => () => {}, getSnapshot: () => ({ current: null, groups, failures: [], status: 'loaded', error: null }) },
    }
    const tree = registrations[1].component(props)
    return { tree, deliveries }
  }

  it('lists the session directory grouped by provider, with prices and context', async () => {
    const { tree } = await render()
    const rows = byClass(tree, 'mg-model')
    assert.equal(rows.length, 3, 'every visible model of the directory')
    const labels = rows.map(row => textOf(row))
    assert.ok(labels.some(text => text.includes('Qwen 3.8 (fast)')))
    const groupHeads = byClass(tree, 'mg-grouphead').map(textOf)
    assert.ok(groupHeads.some(text => text.includes('PX13')))
    assert.ok(groupHeads.some(text => text.includes('Requesty')))
  })

  it('marks the route the child would inherit and sends the router its own answer for it', async () => {
    const { tree, deliveries } = await render()
    const inheritedRow = byClass(tree, 'mg-model').find(row => textOf(row).includes('DeepSeek V4.1'))
    assert.equal(inheritedRow.props['aria-selected'], true, 'the inherited route is the marked row')
    inheritedRow.props.onClick()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(deliveries.length, 1)
    assert.deepEqual(deliveries[0], {
      ok: true,
      value: {
        sessionId: 'session-1',
        answer: { answers: [{ id: 'subagent-model', selected: ['Keep the parent model (requesty::deepseek/deepseek-v4.1-flash)'] }] },
      },
    }, 'confirming the inherited route must be the router\'s no-change answer, not an override')
  })

  it('answers with a route the question never offered, as free text', async () => {
    // The host checks `selected` against the question's own option labels and
    // rejects anything else as `bad-response` (measured in
    // packages/host/apiproxy `matchesQuestions`), so a catalog route travels in the
    // protocol's free-text field — which a single-choice question requires INSTEAD
    // of a selection.
    const { tree, deliveries } = await render()
    const row = byClass(tree, 'mg-model').find(element => textOf(element).includes('FlashNext (deep)'))
    row.props.onClick()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(deliveries[0].value.answer, {
      answers: [{ id: 'subagent-model', selected: [], custom: 'px13::flashnext-high' }],
    })
  })

  it('sends the auto answer from the footer', async () => {
    const { tree, deliveries } = await render()
    const buttons = byClass(tree, 'mg-qbtn')
    const auto = buttons.find(button => textOf(button).includes('Don\'t ask again'))
    assert.ok(auto, 'the auto answer must be reachable')
    auto.props.onClick()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(deliveries[0].value.answer, {
      answers: [{ id: 'subagent-model', selected: ['Auto for this session'] }],
    })
  })

  it('dismisses with the cancelled encoding the harness defines', async () => {
    const { tree, deliveries } = await render()
    byClass(tree, 'mg-qclose')[0].props.onClick()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(deliveries[0].ok, false)
    assert.equal(deliveries[0].error.code, 'cancelled')
  })

  it('shows the router\'s dossier so the choice can be made on information', async () => {
    const { tree } = await render()
    assert.match(textOf(byClass(tree, 'mg-qdetail')[0]), /Task: Check the flaky test/)
    assert.match(textOf(byClass(tree, 'mg-qtitle')[0]), /Which model should run this delegation\?/)
  })

  it('keeps the router\'s configured lanes one click away even when the session lists no models', async () => {
    // The live bug: an empty model directory discarded the whole rendered body,
    // which also threw away the router's own choices, so the dialog showed
    // "No matching models" and nothing to click but the footer.
    const lane = { label: 'PX13 local (fast)', description: 'Local, no provider cost.' }
    const { tree, deliveries } = await render({
      groups: [],
      questions: [routerQuestion({
        options: [
          lane,
          { label: 'Keep the parent model (requesty::deepseek/deepseek-v4.1-flash)' },
          { label: 'Auto for this session' },
        ],
      })],
    })
    const row = byClass(tree, 'mg-model').find(element => textOf(element).includes('PX13 local (fast)'))
    assert.ok(row, 'a configured lane must survive an empty model directory')
    assert.equal(byClass(tree, 'mg-empty').length, 0, 'no empty-state card when the router still offers a choice')
    row.props.onClick()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(deliveries[0].value.answer, {
      answers: [{ id: 'subagent-model', selected: ['PX13 local (fast)'] }],
    })
  })

  it('says the session has no model list when there is nothing to offer at all', async () => {
    const { tree } = await render({ groups: [], questions: [routerQuestion({ options: [] })] })
    assert.equal(byClass(tree, 'mg-model').length, 0)
    assert.match(textOf(byClass(tree, 'mg-empty')[0]), /No model list in this session/)
    assert.match(textOf(byClass(tree, 'mg-status')[0]), /model list unavailable/)
  })

  it('says so when the directory lists nothing, instead of showing an empty card', async () => {
    const { tree } = await render({ groups: [] })
    assert.equal(byClass(tree, 'mg-model').length, 0)
    assert.match(textOf(byClass(tree, 'mg-empty')[0]), /loading models|No matching models|No model list in this session/)
  })

  it('keeps the router\'s configured lanes one click away, with their descriptions', async () => {
    const lane = { label: 'PX13 local (fast)', description: 'Local, no provider cost.' }
    const { tree, deliveries } = await render({
      questions: [routerQuestion({
        options: [
          lane,
          { label: 'Keep the parent model (requesty::deepseek/deepseek-v4.1-flash)' },
          { label: 'Auto for this session' },
        ],
      })],
    })
    const heads = byClass(tree, 'mg-grouphead').map(textOf)
    assert.ok(heads.some(text => text.includes('Quick choices')), 'configured lanes must not vanish in the picker')
    const row = byClass(tree, 'mg-model').find(element => textOf(element).includes('PX13 local (fast)'))
    assert.match(textOf(row), /Local, no provider cost\./, 'the configured description stays visible')
    row.props.onClick()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(deliveries[0].value.answer, {
      answers: [{ id: 'subagent-model', selected: ['PX13 local (fast)'] }],
    })
  })
})

/**
 * The entry's own service contract. cordis has NO optional inject: every name
 * here GATES activation, and dsh-app-boot fails the whole web boot when one
 * entry never leaves `pending` ("web boot: 1 entry did not activate"). A name
 * the harness does not provide is therefore not a harmless extra guard — it
 * takes the UI down. Hence the list is locked; changing it is a decision, not
 * a reflex.
 */
describe('the entry contract', () => {
  it('injects only services the harness actually provides', async () => {
    const { exports: plugin } = await loadClient({})
    assert.deepEqual(plugin.inject, ['slots', 'sessions', 'remote'])
  })
})
