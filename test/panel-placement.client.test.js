/**
 * Where the picker's panel is rendered and where it lands.
 *
 *   node --test test/panel-placement.client.test.js
 *
 * The bug this pins down was measured in the game studio (2026-09-19): the
 * composer sits inside DSH's conversation column, that column clamps
 * `overflow: hidden` while a session is active (the conversation root's
 * `data-phase=active` rule and the scroll body's `overflow: hidden auto` in
 * dsh-client-ui-conversation), and a panel that is absolutely positioned with
 * `right: 0` on a control near the column's right edge therefore loses
 * everything that grows left of that column — 86px of a 440px panel in a 380px
 * column, which the user reads as "the panel is behind the preview". A panel
 * rendered INSIDE that subtree cannot escape the clamp: the clip is not a
 * stacking question, so no z-index can win it. The panel is therefore portaled
 * to <body> and placed in VIEWPORT coordinates, clamped so it always stays on
 * screen (the same treatment the plugin's tooltip and cost popup already get).
 *
 * There is no browser here either. React is a hooks stub that can re-render (so
 * the trigger's click really opens the panel), ReactDOM records the portal
 * instead of moving nodes, and a null ref comes back holding a mounted-looking
 * anchor node — which is exactly what the real renderer puts there. Stubs stand
 * in for those two libraries, never for harness code.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const CLIENT_URL = new URL('../client.js', import.meta.url)

/** The viewport the studio reported: a 1536px window at 175% display scaling. */
const VIEWPORT = { width: 878, height: 640 }

/**
 * The model pill of that studio chat: the conversation column is 380px wide, so
 * its right edge is 26px inside the frame's right edge.
 */
const ANCHOR_RECT = { left: 700, right: 852, top: 500, bottom: 528, width: 152, height: 28 }

/**
 * Minimal React with real hook state, so a click can open the picker.
 * @param {object} options - the anchor rect the mounted pill reports.
 * @returns the React stub and a render function that re-renders on a setter.
 */
function hooksReact({ anchorRect }) {
  let cursor = 0
  const cells = []
  let rerender = null

  const react = {
    createElement(type, props, ...children) {
      return { type, props: { ...(props ?? {}), children: children.length <= 1 ? children[0] : children } }
    },
    useMemo: factory => factory(),
    useCallback: fn => fn,
    // Effects are no-ops on purpose: the geometry under test is computed during
    // render, so a stub that never runs effects must still see it.
    useEffect: () => {},
    useLayoutEffect: () => {},
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    useRef(initial) {
      const slot = cursor++
      if (!(slot in cells)) {
        cells[slot] = {
          current: initial === null ? { getBoundingClientRect: () => anchorRect } : initial,
        }
      }
      return cells[slot]
    },
    useState(initial) {
      const slot = cursor++
      if (!(slot in cells)) cells[slot] = initial
      return [cells[slot], value => {
        cells[slot] = value
        if (rerender !== null) rerender()
      }]
    },
  }

  return {
    react,
    /**
     * Render the component once and keep the tree current across setter calls.
     * @param component - the seat component.
     * @param props - its slot props.
     * @returns a handle whose `tree` is always the latest render.
     */
    render(component, props) {
      let tree
      const draw = () => { cursor = 0; tree = component(props) }
      rerender = draw
      draw()
      return {
        get tree() { return tree },
        click(element) { element.props.onClick() },
      }
    },
  }
}

/** ReactDOM that records the portal target instead of moving nodes. */
const reactDomStub = {
  createPortal: (el, target) => ({ type: 'portal', props: { target }, el }),
}

/**
 * Load the client half and render the composer's model seat.
 * @param {object} options - viewport, anchor rect and the session's model groups.
 * @returns the render handle and the captured registrations.
 */
async function loadSeat({ viewport = VIEWPORT, anchorRect = ANCHOR_RECT, groups = [] } = {}) {
  let captured
  // The module injects its stylesheet through `document` at load, so the fake
  // document has to answer that much: createElement("style"), querySelector and
  // head.appendChild. Nothing is rendered into it.
  globalThis.document = {
    querySelector: () => null,
    createElement: () => ({ dataset: {} }),
    head: { appendChild: () => {} },
    body: { nodeName: 'BODY' },
  }
  globalThis.window = {
    __ModuleLoader__: { load: spec => { captured = spec } },
    innerWidth: viewport.width,
    innerHeight: viewport.height,
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  await import(`${CLIENT_URL.href}?t=${Date.now()}`)
  assert.ok(captured, 'the client half must register itself with the module loader')

  const registrations = []
  const slots = {
    inject: (_name, contribute) => contribute(),
    register: (options, component) => {
      registrations.push({ options, component })
      return () => {}
    },
  }
  const harness = hooksReact({ anchorRect })
  const modelDirectories = {
    directoryFor: () => ({
      store: {
        subscribe: () => () => {},
        getSnapshot: () => ({ current: null, groups, failures: [], status: 'loaded', error: null }),
      },
      load: async () => {},
    }),
  }
  const ctx = {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    inject: (_services, callback) => callback({ slots, modelDirectories, sessions: undefined }),
    effect: () => () => {},
  }
  const plugin = captured.factory(specifier => {
    if (specifier === 'react') return harness.react
    if (specifier === 'react-dom') return reactDomStub
    throw new Error(`unexpected require: ${specifier}`)
  })
  plugin.apply(ctx)

  const seat = registrations[0]
  assert.equal(seat.options.name, 'conversation.input.model')
  const props = seat.options.inject('session-1')
  assert.equal(props.available, true, 'the seat must be usable for this to test anything')
  return { view: harness.render(seat.component, props), registrations }
}

/** Every element in a recorded tree, portals included, depth first. */
function elements(node, found = []) {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, found)
    return found
  }
  if (node === null || typeof node !== 'object') return found
  found.push(node)
  if (node.el !== undefined) elements(node.el, found)
  if (node.props !== undefined) elements(node.props.children, found)
  return found
}

/** The elements carrying one className, in render order. */
function byClass(tree, className) {
  return elements(tree).filter(element => typeof element.props?.className === 'string'
    && element.props.className.split(' ').includes(className))
}

/** Open the picker through its own trigger and hand back what it rendered. */
async function openPanel(options) {
  const { view, registrations } = await loadSeat(options)
  assert.equal(byClass(view.tree, 'mg-panel').length, 0, 'nothing is open before the click')
  const trigger = byClass(view.tree, 'mg-trigger').find(element => element.type === 'button')
  assert.ok(trigger, 'the model pill must be there to click')
  view.click(trigger)
  return { view, registrations, panel: byClass(view.tree, 'mg-panel')[0] }
}

describe('the picker panel escapes the column that holds the composer', () => {
  it('renders the panel through a portal to <body>, not inside the composer', async () => {
    const { view, panel } = await openPanel()
    assert.ok(panel, 'the click must open the panel')

    const portals = elements(view.tree).filter(element => element.type === 'portal')
    assert.equal(portals.length, 1, 'the open panel must leave the composer subtree')
    assert.equal(portals[0].props.target, globalThis.document.body)
    assert.equal(portals[0].el.props.className, 'mg-panel')
  })

  it('places the panel in viewport coordinates, anchored to the pill', async () => {
    const { panel } = await openPanel()
    assert.equal(panel.props.style.position, 'fixed', 'absolute inside a clipped ancestor is lost')
    assert.equal(panel.props.style.right, VIEWPORT.width - ANCHOR_RECT.right,
      'the panel keeps the pill\'s right edge')
    assert.equal(panel.props.style.bottom, VIEWPORT.height - ANCHOR_RECT.top + 8,
      'the panel opens 8px above the pill')
    assert.equal(panel.props.style.width, 440)
    assert.equal(panel.props.style.height, 480)
  })

  it('keeps the whole panel on screen when the anchor sits at the column edge', async () => {
    // The studio case in numbers: the panel's left edge lands at
    // anchor.right - 440 = 412, i.e. 86px LEFT of that column's own left edge
    // (498) — where the column's clamp cut it off. In viewport coordinates the
    // panel may overlap the preview; what it must never do is leave the screen.
    const { panel } = await openPanel()
    const style = panel.props.style
    const left = VIEWPORT.width - style.right - style.width
    assert.ok(left >= 8, `the panel's left edge must stay inside the viewport (got ${left})`)
    assert.ok(VIEWPORT.height - style.bottom - style.height >= 8, 'and its top edge too')
  })

  it('clamps a panel wider than the viewport instead of hanging off it', async () => {
    const viewport = { width: 360, height: 520 }
    const anchorRect = { left: 300, right: 352, top: 400, bottom: 428, width: 52, height: 28 }
    const { panel } = await openPanel({ viewport, anchorRect })

    const style = panel.props.style
    assert.equal(style.width, viewport.width - 16, 'the panel yields width before position')
    assert.ok(style.right >= 8 && style.right + style.width <= viewport.width - 8 + 0.001,
      `right=${style.right} width=${style.width} must fit inside ${viewport.width}`)
    assert.ok(style.bottom >= 8 && style.bottom + style.height <= viewport.height - 8 + 0.001,
      `bottom=${style.bottom} height=${style.height} must fit inside ${viewport.height}`)
  })
})
