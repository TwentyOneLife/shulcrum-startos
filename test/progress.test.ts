// Regression test for #29: the sync-progress height now comes from Fulcrum's log output.
// Every line below is verbatim from a live Shulcrum build, 2026-09-22.
// Run: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lastProgress } from '../startos/progress.ts'

const p636 =
  '[2026-09-22 12:44:40.371] <Controller> Processed height: 636000, 65.3%, 30.2 blocks/min, 1108.6 txs/sec, 4534.0 addrs/sec'
const p637 =
  '[2026-09-22 13:18:26.450] <Controller> Processed height: 637000, 65.4%, 29.6 blocks/min, 1016.7 txs/sec, 4277.0 addrs/sec'
const downloading =
  '[2026-09-22 09:01:38.128] <Controller> Block height 973575, downloading new blocks ...'
const opening = '[2026-09-22 09:01:37.989] 534714353 total transactions'

test('a progress line yields its height and percentage', () => {
  assert.deepEqual(lastProgress(p636 + '\n'), {
    height: 636000,
    percent: '65.3',
  })
})

test('without a timestamp prefix, as with --ts-format none', () => {
  assert.deepEqual(lastProgress(p636.slice(26)), {
    height: 636000,
    percent: '65.3',
  })
})

test('a chunk holding several lines yields the last reading', () => {
  assert.deepEqual(lastProgress([p636, downloading, p637, ''].join('\n')), {
    height: 637000,
    percent: '65.4',
  })
})

test('the node height in a "Block height" line is not taken for the indexed height', () => {
  assert.equal(lastProgress(downloading + '\n'), null)
})

test('startup lines carry no height', () => {
  assert.equal(lastProgress(opening + '\n'), null)
})

test('a line cut across two chunks yields nothing rather than a truncated height', () => {
  const cut = p636.indexOf('36000')
  assert.equal(lastProgress(p636.slice(0, cut)), null)
  assert.equal(lastProgress(p636.slice(cut)), null)
  const cutInPercent = p636.indexOf('.3%')
  assert.equal(lastProgress(p636.slice(0, cutInPercent)), null)
})
