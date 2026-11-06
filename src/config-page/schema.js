/**
 * Minimal JSON Schema validator for `schema/omd-config.schema.json`.
 *
 * The repository documents `.omd/config.jsonc` with a JSON Schema, but nothing
 * validated against it: `normalizeConfig` silently coerces bad input back to a
 * default (`positiveInt(0, 5)` turns an invalid `0` into `5`), which is the
 * right runtime behavior and the wrong editor behavior. This module implements
 * exactly the keywords the shipped schema uses, so the settings page can reject
 * a value with a message that names the field and the expectation instead of
 * failing generically.
 *
 * Supported keywords: `type` (string or string array, `integer` included),
 * `properties`, `additionalProperties` (boolean or schema), `required`,
 * `items`, `enum`, `const`, `minimum`, `maximum`, `oneOf`, `default`, `title`,
 * `description`, `$schema`, `$id`. Every other keyword is ignored;
 * `unsupportedKeywordsIn()` exists so a test fails loudly if the shipped schema
 * grows a keyword this validator would silently skip.
 *
 * `oneOf` is validated with first-match semantics. The shipped schema only uses
 * it for two structurally disjoint branches (`diagnostics.commands` items), so
 * first-match and exactly-one agree on every accepted document.
 */

const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

/** Keywords this validator actually reads. */
const READ_KEYWORDS = new Set([
  '$schema',
  '$id',
  'title',
  'description',
  'default',
  'type',
  'properties',
  'additionalProperties',
  'required',
  'items',
  'enum',
  'const',
  'minimum',
  'maximum',
  'oneOf',
])

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** JSON type name of a JavaScript value, distinguishing integers. */
function jsonTypeOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  if (typeof value === 'object') return 'object'
  return typeof value
}

function declaredTypes(schema) {
  if (schema.type === undefined) return null
  return Array.isArray(schema.type) ? schema.type : [schema.type]
}

function typeMatches(declared, value) {
  const actual = jsonTypeOf(value)
  return declared.some((type) => type === actual || (type === 'number' && actual === 'integer'))
}

function describeTypes(declared) {
  return declared.join(' | ')
}

function describeValue(value) {
  if (value === undefined) return 'nothing'
  if (typeof value === 'string') return `string ${JSON.stringify(value)}`
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return 'array'
  return 'object'
}

/** Human-readable field label for a path, `value` at the document root. */
export function labelForPath(path) {
  return path.length === 0 ? 'value' : path.map((segment) => String(segment)).join('.')
}

/** Describe one problem the way the settings page shows it. */
function problem(path, expectation, value) {
  return { path, message: `${labelForPath(path)} must be ${expectation} (got ${describeValue(value)})` }
}

function rangeText(schema) {
  let text = ''
  if (typeof schema.minimum === 'number') text += ` >= ${schema.minimum}`
  if (typeof schema.maximum === 'number') text += ` <= ${schema.maximum}`
  return text
}

function sameJson(left, right) {
  if (left === right) return true
  if (typeof left !== typeof right) return false
  if (left === null || right === null || typeof left !== 'object') return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  if (Array.isArray(left)) {
    return left.length === right.length && left.every((item, index) => sameJson(item, right[index]))
  }
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => sameJson(left[key], right[key]))
}

/**
 * Collect every schema violation for one value.
 * @param schema - JSON Schema node (or boolean schema).
 * @param value - candidate value.
 * @param path - field path used in messages.
 * @returns problems in document order; empty when the value is valid.
 */
export function collectProblems(schema, value, path = []) {
  if (schema === true || schema === undefined || schema === null) return []
  if (schema === false) return [{ path: [...path], message: `${labelForPath(path)} is not allowed here` }]
  if (!isPlainObject(schema)) return []

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    const branches = schema.oneOf.map((branch) => collectProblems(branch, value, path))
    if (branches.some((problems) => problems.length === 0)) return []
    // Report the branch that accepted the most of the value — fewest problems,
    // then the deepest failure — so the message is about the closest legal
    // shape rather than an arbitrary first branch.
    const depth = (problems) => Math.max(...problems.map((problem) => problem.path.length))
    const best = [...branches].sort((left, right) => left.length - right.length || depth(right) - depth(left))[0]
    return best.length > 0 ? best : [problem(path, 'one of the allowed shapes', value)]
  }

  const problems = []
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => sameJson(candidate, value))) {
    problems.push(problem(path, `one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`, value))
  }
  if (schema.const !== undefined && !sameJson(schema.const, value)) {
    problems.push(problem(path, JSON.stringify(schema.const), value))
  }

  const declared = declaredTypes(schema)
  if (declared !== null && !typeMatches(declared, value)) {
    problems.push(problem(path, `${describeTypes(declared)}${rangeText(schema)}`, value))
    // A wrong type makes every nested keyword meaningless.
    return problems
  }

  if (typeof value === 'number') {
    const expectation = declared === null ? `a number${rangeText(schema)}` : `${describeTypes(declared)}${rangeText(schema)}`
    if (typeof schema.minimum === 'number' && value < schema.minimum) problems.push(problem(path, expectation, value))
    if (typeof schema.maximum === 'number' && value > schema.maximum) problems.push(problem(path, expectation, value))
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, index) => {
      problems.push(...collectProblems(schema.items, item, [...path, index]))
    })
  }

  if (isPlainObject(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) {
        problems.push({ path: [...path, key], message: `${labelForPath([...path, key])} is required` })
      }
    }
    const properties = isPlainObject(schema.properties) ? schema.properties : {}
    for (const [key, item] of Object.entries(value)) {
      if (BLOCKED_KEYS.has(key)) continue
      const child = properties[key]
      if (child !== undefined) {
        problems.push(...collectProblems(child, item, [...path, key]))
        continue
      }
      const extra = schema.additionalProperties
      if (extra === false) {
        problems.push({ path: [...path, key], message: `${labelForPath([...path, key])} is not an allowed key here` })
      } else if (isPlainObject(extra)) {
        problems.push(...collectProblems(extra, item, [...path, key]))
      }
    }
  }

  return problems
}

/**
 * Validate a value and reduce the outcome to the one message an editor shows.
 * @returns `{ok:true}` or `{ok:false,message,path,problems}`.
 */
export function validate(schema, value) {
  const problems = collectProblems(schema, value, [])
  if (problems.length === 0) return { ok: true }
  return {
    ok: false,
    message: problems[0].message,
    path: problems[0].path,
    problems,
  }
}

/**
 * Schema keywords this validator does not read, so a test can prove the shipped
 * schema stays inside the supported subset.
 * @param schema - schema node to walk.
 * @returns sorted unique keyword names.
 */
export function unsupportedKeywordsIn(schema, found = new Set()) {
  if (Array.isArray(schema)) {
    for (const entry of schema) unsupportedKeywordsIn(entry, found)
    return [...found].sort()
  }
  if (!isPlainObject(schema)) return [...found].sort()
  for (const [key, value] of Object.entries(schema)) {
    if (!READ_KEYWORDS.has(key)) found.add(key)
    if (key === 'properties' && isPlainObject(value)) {
      for (const child of Object.values(value)) unsupportedKeywordsIn(child, found)
    } else if (key === 'additionalProperties' || key === 'items') {
      unsupportedKeywordsIn(value, found)
    } else if (key === 'oneOf' && Array.isArray(value)) {
      for (const branch of value) unsupportedKeywordsIn(branch, found)
    }
  }
  return [...found].sort()
}
