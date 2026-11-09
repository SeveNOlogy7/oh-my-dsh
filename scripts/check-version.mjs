#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { OMD_VERSION, OMO_VERSION, OMO_COMMIT } from '../src/core/constants.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
const lock = JSON.parse(await fs.readFile(path.join(root, 'upstream', 'omo-sources.lock.json'), 'utf8'))

const errors = []
if (pkg.version !== OMD_VERSION) errors.push(`package version ${pkg.version} != constants ${OMD_VERSION}`)
// Published now: npm refuses to publish a private package.
if (pkg.private === true) errors.push('package.json is private; npm publish would be refused')
if (pkg.type !== 'module') errors.push('package.json must be type=module')
if (pkg.engines?.node !== '>=22.13.0') errors.push('package.json engines.node must be >=22.13.0')
if (lock.reference?.tag !== `v${OMO_VERSION}`) errors.push(`lock tag ${lock.reference?.tag} != v${OMO_VERSION}`)
if (lock.reference?.commit !== OMO_COMMIT) errors.push(`lock commit ${lock.reference?.commit} != ${OMO_COMMIT}`)
if (lock.license?.omo?.status !== 'verified') errors.push('upstream license status must be verified')

if (errors.length) {
  for (const error of errors) console.error(`version: ${error}`)
  process.exit(1)
}
console.log(`version ok: omd ${OMD_VERSION}, omo ${OMO_VERSION} @ ${OMO_COMMIT.slice(0, 8)}`)
