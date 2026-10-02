/**
 * Evidence verification: the screenshots a pull request pastes into its
 * description must be the same bytes as the files it commits under the evidence
 * directory, or the submission is refused before human review.
 *
 * These cover the pure parts (URL extraction and the decision); the network path
 * is exercised read-only against real pull requests when the policy changes.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
import {
  REFUSE_EXIT_CODE,
  evaluateEvidence,
  extractImageUrls,
} from './verify-evidence.mjs'

const sha = (value) => createHash('sha256').update(value).digest('hex')

test('image URLs are collected from markdown, html and bare links, once each', () => {
  const body = [
    '![light](https://example.com/a.png)',
    '<img src="https://example.com/b.jpg" width="400">',
    'https://github.com/user-attachments/assets/abc-def',
    '![again](https://example.com/a.png)',
    'not an image: https://example.com/page.html',
  ].join('\n')
  assert.deepEqual(extractImageUrls(body), [
    'https://example.com/a.png',
    'https://example.com/b.jpg',
    'https://github.com/user-attachments/assets/abc-def',
  ])
})

test('a body with no images yields no URLs', () => {
  assert.deepEqual(extractImageUrls('plain text, no screenshots'), [])
  assert.deepEqual(extractImageUrls(''), [])
})

test('matching bytes pass and hand the submission to the gates', () => {
  const result = evaluateEvidence({
    images: [{ url: 'https://example.com/a.png', sha256: sha('a'), bytes: 1 }],
    committed: [{ path: 'evidence/x-a.png', sha256: sha('a') }],
    required: 1,
  })
  assert.equal(result.decision, 'pass')
  assert.equal(result.reason, null)
  assert.equal(result.comment, null)
})

test('a screenshot with no committed twin is refused', () => {
  const result = evaluateEvidence({
    images: [{ url: 'https://example.com/a.png', sha256: sha('a'), bytes: 1 }],
    committed: [{ path: 'evidence/x-b.png', sha256: sha('b') }],
    required: 1,
  })
  assert.equal(result.decision, 'refuse')
  assert.equal(result.reason, 'evidence-mismatch')
  assert.match(result.comment, /https:\/\/example\.com\/a\.png/)
  assert.match(result.comment, /evidence\/x-b\.png/)
})

test('fewer screenshots than the policy requires is refused', () => {
  const result = evaluateEvidence({ images: [], committed: [], required: 2 })
  assert.equal(result.decision, 'refuse')
  assert.equal(result.reason, 'missing-evidence')
  assert.match(result.detail, /2 are required/)
})

test('an image that cannot be downloaded is refused, not ignored', () => {
  const result = evaluateEvidence({
    images: [{ url: 'https://example.com/a.png', error: 'http 404' }],
    committed: [],
    required: 1,
  })
  assert.equal(result.decision, 'refuse')
  assert.equal(result.reason, 'unreadable-evidence')
  assert.match(result.comment, /http 404/)
})

test('refuse is an exit code a crashed checker cannot produce', () => {
  assert.notEqual(REFUSE_EXIT_CODE, 1)
})

test('the workflow acts on the same refuse code the checker uses', () => {
  const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'submission-policy.yml'), 'utf8')
  assert.match(workflow, new RegExp('^\\s*' + REFUSE_EXIT_CODE + '\\) .*close-reason', 'm'))
})
