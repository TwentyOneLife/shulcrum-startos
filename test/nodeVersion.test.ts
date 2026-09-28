// Regression test: the node dependency showed "Incorrect version" against a correctly
// configured BLAKE2b node, because an unflavored range never matches a flavored version.
// Run: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ExtendedVersion, VersionRange } from '@start9labs/start-sdk'
import { nodeVersionRange } from '../startos/nodeVersion.ts'

const accepts = (version: string) =>
  ExtendedVersion.parse(version).satisfies(VersionRange.parse(nodeVersionRange))

test('the BLAKE2b node that reported "Incorrect version" is accepted', () => {
  assert.equal(accepts('#knots:29.4.2:3'), true)
})

test('the oldest node the BLAKE2b companion packages accept is accepted', () => {
  assert.equal(accepts('#knots:29.4.1:7'), true)
})

test('a node older than that is refused', () => {
  assert.equal(accepts('#knots:29.4.1:6'), false)
})

test('the official unflavored node, which follows another chain, is refused', () => {
  assert.equal(accepts('31.1:4'), false)
})
