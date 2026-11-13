/**
 * Test harness for `ui/client.js`, the plain-JS browser half.
 *
 * There is no browser in this test process, so this module reproduces the two
 * things the Client runtime gives the module: a lazy factory registration and a
 * React runtime. The React stub only implements the hooks the settings section
 * is allowed to use (`useState`, `useRef`, `useEffect`) — a component that grows
 * another hook fails here instead of only in the browser.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Minimal React runtime: enough to render a hook-using function component. */
export function createReactStub() {
  const states = []
  const refs = []
  let effects = []
  let cursor = 0
  const lib = {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children: children.flat() }
    },
    useState(initial) {
      const index = cursor
      cursor += 1
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
      return [
        states[index],
        (next) => {
          states[index] = typeof next === 'function' ? next(states[index]) : next
        },
      ]
    },
    useRef(initial) {
      const index = cursor
      cursor += 1
      if (!(index in refs)) refs[index] = { current: initial }
      return refs[index]
    },
    useEffect(fn) {
      cursor += 1
      effects.push(fn)
    },
  }
  return {
    lib,
    render(component, props) {
      cursor = 0
      effects = []
      const tree = component(props)
      const pending = effects
      effects = []
      for (const effect of pending) effect()
      return tree
    },
  }
}

/** Load ui/client.js the way the browser module table does. */
export function loadClientModule() {
  const registrations = []
  const previousWindow = globalThis.window
  globalThis.window = { __ModuleLoader__: { load: (registration) => registrations.push(registration) } }
  try {
    // client.js is a classic script (no imports or exports): running its body is
    // exactly what the browser does, and it only registers one factory.
    const source = readFileSync(path.join(root, 'ui', 'client.js'), 'utf8')
    new Function(source)()
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
  if (registrations.length !== 1) throw new Error(`client.js must register exactly one module (got ${registrations.length})`)
  return registrations[0]
}

export function flatten(node, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out)
    return out
  }
  if (node.children) flatten(node.children, out)
  return out
}

export function find(node, predicate) {
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, predicate)
      if (hit !== null) return hit
    }
    return null
  }
  if (node.props && predicate(node)) return node
  return node.children ? find(node.children, predicate) : null
}

export function findAll(node, predicate, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, out)
    return out
  }
  if (node.props && predicate(node)) out.push(node)
  if (node.children) findAll(node.children, predicate, out)
  return out
}

export function byId(tree, id) {
  return find(tree, (node) => node.props && node.props.id === id)
}

export function buttonByText(tree, text) {
  return find(tree, (node) => node.type === 'button' && flatten(node).includes(text))
}

/** Every rendered field wrapper, in document order. */
export function fieldsOf(tree) {
  return findAll(tree, (node) => node.props && node.props.className === 'omd-cfg-field')
}

/** The field wrapper whose rendered text contains `label`. */
export function fieldByLabel(tree, label) {
  return fieldsOf(tree).find((node) => flatten(node).includes(label)) || null
}

/**
 * Build a mounted settings page.
 * @param options.responses - one controller answer per `run` call, in order.
 */
export function createHarness(options = {}) {
  const registration = loadClientModule()
  const react = createReactStub()
  const clientModule = registration.factory((specifier) => {
    if (specifier === 'react') return react.lib
    throw new Error(`unexpected require("${specifier}")`)
  })
  const registered = []
  const dictionaries = {}
  const ctx = {
    slots: {
      inject(key, callback) {
        callback()
        return () => {}
      },
      register(registrationOptions, Component) {
        const handle = { options: registrationOptions, Component }
        registered.push(handle)
        return () => {}
      },
    },
    get(name) {
      if (name !== 'locale') return undefined
      return {
        register(ns, dictionary) {
          dictionaries[ns] = dictionary
          return () => {}
        },
        bind(ns) {
          return (key) => {
            const dictionary = dictionaries[ns]
            return dictionary && dictionary.en[key] !== undefined ? dictionary.en[key] : key
          }
        },
      }
    },
    effect(fn) {
      return fn()
    },
  }
  clientModule.apply(ctx)

  const section = registered.find((handle) => handle.options && handle.options.name === 'settings.section')
  if (!section) throw new Error('the settings section was not registered')

  const calls = []
  let cursor = 0
  const controller = {
    async run(line) {
      calls.push(line)
      const response = options.responses ? options.responses[cursor] : undefined
      cursor += 1
      if (typeof response === 'function') return response(line)
      if (response !== undefined) return response
      return { error: { kind: 'bridge', message: null } }
    },
  }

  const render = (props) => react.render(section.Component, Object.assign({ controller }, props))
  const settle = async () => {
    for (let index = 0; index < 3; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
  }
  /**
   * Poll until the rendered page satisfies `predicate`. A controller that does
   * real file I/O (the round-trip test) resolves after more ticks than `settle`
   * covers, so waiting on the observed UI is the only non-flaky gate.
   */
  const waitUntil = async (predicate, { timeout = 3000, interval = 5 } = {}) => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeout) {
      if (predicate()) return true
      await new Promise((resolve) => setTimeout(resolve, interval))
    }
    throw new Error('timed out waiting for the page to settle')
  }
  async function mount(props) {
    render(props)
    await settle()
    return render(props)
  }

  return {
    registration,
    clientModule,
    react,
    section,
    registered,
    dictionaries,
    calls,
    controller,
    render,
    mount,
    settle,
    waitUntil,
  }
}
