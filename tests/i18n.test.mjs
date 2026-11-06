import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { apply } from '../src/runtime/index.js'
import { Runtime } from '../src/runtime/runtime.js'
import { normalizeLanguage, text } from '../src/i18n/index.js'
import { DEFAULT_LANGUAGE, LANGUAGES, MESSAGES } from '../src/i18n/messages.js'
import { SKILL_NAMES } from '../src/agents/registry.js'
import { createFakeContext } from './helpers/fake-context.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CJK = /[\u3400-\u9fff]/
const AGENT = 'sisyphus'
const TOOL_FILES = ['delegate.js', 'sessions.js', 'tasks.js', 'misc.js', 'lookat.js', 'shared.js', 'index.js']

async function waitFor(predicate, { tries = 80, delayMs = 20 } = {}) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const value = await predicate()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  throw new Error('i18n test: condition was never met')
}

/**
 * Mount the real plugin through `apply` against the fake dsh context, which is
 * the same registration path a preset row uses.
 */
async function mount(config = {}) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'omd-i18n-'))
  const workspace = path.join(home, 'project')
  await fs.mkdir(workspace, { recursive: true })
  const { ctx, state } = createFakeContext({ cwd: workspace, agentPreset: `omd-${AGENT}` })
  const dispose = apply(ctx, { agent: AGENT, ...config })
  // `apply` registers the bundled skills from an async task, so wait for the
  // full set before asserting on them.
  const skills = await waitFor(() => (state.skills.length >= SKILL_NAMES.length ? state.skills : null))
  return { ctx, state, skills, dispose }
}

test('language: zh localizes every tool, command, and skill description', async () => {
  const env = await mount({ language: 'zh' })
  try {
    assert.equal(env.state.tools.length, 19, 'every sisyphus OMD tool registers')
    for (const tool of env.state.tools) {
      assert.match(tool.description, CJK, `${tool.name} description must be Chinese`)
      assert.equal(tool.description, MESSAGES.zh[`tool.${tool.name}.description`])
    }

    assert.equal(env.state.commands.length, 13, 'every sisyphus OMD command registers')
    for (const command of env.state.commands) {
      assert.match(command.description, CJK, `${command.name} description must be Chinese`)
      assert.equal(command.description, MESSAGES.zh[`command.${command.name}.description`])
    }

    assert.equal(env.skills.length, SKILL_NAMES.length)
    for (const skill of env.skills) {
      assert.match(skill.description, CJK, `${skill.name} description must be Chinese`)
      assert.match(skill.whenToUse, CJK, `${skill.name} whenToUse must be Chinese`)
      assert.equal(skill.description, MESSAGES.zh[`skill.${skill.name}.description`])
      assert.equal(skill.whenToUse, MESSAGES.zh[`skill.${skill.name}.whenToUse`])
    }
  } finally {
    env.dispose()
  }
})

test('language: en and an absent language key both stay English', async () => {
  const explicit = await mount({ language: 'en' })
  const absent = await mount()
  try {
    for (const env of [explicit, absent]) {
      assert.ok(env.state.tools.length > 0)
      for (const tool of env.state.tools) {
        assert.equal(tool.description, MESSAGES.en[`tool.${tool.name}.description`])
        assert.ok(!CJK.test(tool.description), `${tool.name} must not be Chinese without language: zh`)
      }
      for (const command of env.state.commands) {
        assert.equal(command.description, MESSAGES.en[`command.${command.name}.description`])
        assert.ok(!CJK.test(command.description), `${command.name} must not be Chinese`)
      }
      for (const skill of env.skills) {
        assert.equal(skill.description, MESSAGES.en[`skill.${skill.name}.description`])
        assert.equal(skill.whenToUse, MESSAGES.en[`skill.${skill.name}.whenToUse`])
        assert.ok(!CJK.test(skill.description), `${skill.name} must not be Chinese`)
      }
    }
    assert.deepEqual(
      explicit.state.tools.map((tool) => [tool.name, tool.description]),
      absent.state.tools.map((tool) => [tool.name, tool.description]),
      'an explicit en and a missing key must be indistinguishable',
    )
  } finally {
    explicit.dispose()
    absent.dispose()
  }
})

test('Runtime reads the row language defensively', () => {
  const { ctx } = createFakeContext({ cwd: process.cwd(), agentPreset: `omd-${AGENT}` })
  const cases = [
    ['zh', 'zh'],
    ['en', 'en'],
    ['ZH', 'zh'],
    [undefined, DEFAULT_LANGUAGE],
    [null, DEFAULT_LANGUAGE],
    [42, DEFAULT_LANGUAGE],
    [{ language: 'zh' }, DEFAULT_LANGUAGE],
    ['fr', DEFAULT_LANGUAGE],
    ['', DEFAULT_LANGUAGE],
  ]
  for (const [value, expected] of cases) {
    const runtime = new Runtime(ctx, { agent: AGENT, language: value })
    assert.equal(runtime.language, expected, `language ${JSON.stringify(value)} -> ${expected}`)
  }
  assert.equal(new Runtime(ctx, { agent: AGENT }).language, DEFAULT_LANGUAGE)
})

test('text() resolves localized, then English, then the caller fallback', () => {
  const key = 'tool.omd_status.description'
  assert.equal(text('zh', key), MESSAGES.zh[key])
  assert.equal(text('en', key), MESSAGES.en[key])
  // An unsupported language still resolves the English catalog entry, which
  // sits above the caller's own string.
  assert.equal(text('fr', key, 'FALLBACK'), MESSAGES.en[key])
  // An unknown key has no catalog entry and uses the caller's string.
  assert.equal(text('zh', 'tool.omd_missing.description', 'FALLBACK'), 'FALLBACK')
  assert.equal(text(undefined, 'tool.omd_missing.description', 'FALLBACK'), 'FALLBACK')
  assert.equal(text('zh', 'tool.omd_missing.description'), '')
  assert.equal(normalizeLanguage(' zh '), 'zh')
  assert.equal(normalizeLanguage('zh-CN'), DEFAULT_LANGUAGE)
})

test('both catalogs cover exactly the registered description surface', async () => {
  const env = await mount({ language: 'en' })
  try {
    const keys = [
      ...env.state.tools.map((tool) => `tool.${tool.name}.description`),
      ...env.state.commands.map((command) => `command.${command.name}.description`),
      ...env.skills.flatMap((skill) => [
        `skill.${skill.name}.description`,
        `skill.${skill.name}.whenToUse`,
      ]),
    ]
    assert.equal(keys.length, 19 + 13 + SKILL_NAMES.length * 2)
    assert.equal(new Set(keys).size, keys.length, 'no key is registered twice')
    for (const key of keys) {
      for (const language of LANGUAGES) {
        assert.equal(typeof MESSAGES[language][key], 'string', `${language} is missing ${key}`)
        assert.ok(MESSAGES[language][key].length > 0, `${language}.${key} is empty`)
      }
      assert.notEqual(MESSAGES.zh[key], MESSAGES.en[key], `${key} is not actually translated`)
      assert.match(MESSAGES.zh[key], CJK, `${key} has no Chinese text`)
    }
    assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES.zh).sort())
  } finally {
    env.dispose()
  }
})

test('the English catalog mirrors the call sites and the SKILL.md frontmatter', async () => {
  const toolSource = (
    await Promise.all(
      TOOL_FILES.map((file) => fs.readFile(path.join(root, 'src', 'tools', file), 'utf8')),
    )
  ).join('\n')
  const commandSource = await fs.readFile(path.join(root, 'src', 'commands', 'index.js'), 'utf8')

  for (const [key, value] of Object.entries(MESSAGES.en)) {
    if (key.startsWith('tool.')) {
      assert.ok(toolSource.includes(value), `${key} no longer matches src/tools`)
    } else if (key.startsWith('command.')) {
      assert.ok(commandSource.includes(value), `${key} no longer matches src/commands/index.js`)
    }
  }

  for (const name of SKILL_NAMES) {
    const markdown = await fs.readFile(path.join(root, 'skills', name, 'SKILL.md'), 'utf8')
    for (const field of ['description', 'whenToUse']) {
      const value = MESSAGES.en[`skill.${name}.${field}`]
      assert.ok(markdown.includes(value), `skill.${name}.${field} no longer matches SKILL.md`)
    }
  }
})

test('the switch never renames a tool, command, skill, or parameter', async () => {
  const zh = await mount({ language: 'zh' })
  const en = await mount({ language: 'en' })
  try {
    assert.deepEqual(zh.state.tools.map((tool) => tool.name), en.state.tools.map((tool) => tool.name))
    assert.deepEqual(zh.state.commands.map((command) => command.name), en.state.commands.map((command) => command.name))
    assert.deepEqual(zh.skills.map((skill) => skill.name), en.skills.map((skill) => skill.name))

    for (const [index, tool] of zh.state.tools.entries()) {
      assert.deepEqual(tool.parameters, en.state.tools[index].parameters, `${tool.name} parameters changed`)
    }
    for (const [index, command] of zh.state.commands.entries()) {
      assert.deepEqual(
        Object.keys(command).sort(),
        Object.keys(en.state.commands[index]).sort(),
        `${command.name} shape changed`,
      )
    }

    const identifiers = [
      ...zh.state.tools.map((tool) => tool.name),
      ...zh.state.commands.map((command) => command.name),
      ...zh.skills.map((skill) => skill.name),
    ]
    for (const name of identifiers) assert.ok(!CJK.test(name), `${name} must not be translated`)
    // SKILL.md bodies stay English: zh localizes the summary only.
    for (const skill of zh.skills) assert.ok(!CJK.test(skill.content), `${skill.name} body must stay English`)
  } finally {
    zh.dispose()
    en.dispose()
  }
})

test('the plugin row metadata is idiomatic in both locales and stays shipped', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json')
  assert.ok(pkg.files.includes('locale/*.json'), 'locale files must stay in package files')

  const en = JSON.parse(await fs.readFile(path.join(root, 'locale', 'en.json'), 'utf8'))
  const zh = JSON.parse(await fs.readFile(path.join(root, 'locale', 'zh.json'), 'utf8'))
  for (const locale of [en, zh]) {
    assert.equal(locale.meta.title, 'Oh-My-DSH')
    assert.equal(typeof locale.meta.description, 'string')
    assert.ok(locale.meta.description.length > 40, 'the row description must stay informative')
  }
  assert.ok(!CJK.test(en.meta.description), 'the English row description must not contain Chinese')
  assert.match(zh.meta.description, CJK, 'the Chinese row description must be Chinese')
  assert.notEqual(en.meta.description, zh.meta.description)
})
