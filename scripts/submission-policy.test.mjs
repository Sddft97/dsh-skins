/**
 * Submission policy: blocked contributors are refused by the workflow, and
 * prohibited works are refused at the copyright gate.
 *
 * The tests pin two things the workflow depends on: the repository's own policy
 * data, and the exit codes of the checker (1 = blocked, 2 = broken policy), so a
 * malformed policy file can never be mistaken for a contributor to refuse.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  BLOCKED_EXIT_CODE,
  POLICY_VERSION,
  findBlockedContributor,
  loadPolicy,
  prohibitedWorks,
} from './submission-policy.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(ROOT, 'scripts', 'submission-policy.mjs')

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' })
}

test('the repository policy is well-formed and blocks LOrz-3', () => {
  const policy = loadPolicy()
  assert.equal(policy.version, POLICY_VERSION)
  const blocked = findBlockedContributor(policy, 'LOrz-3')
  assert.ok(blocked, 'LOrz-3 must be a blocked contributor')
  assert.equal(blocked.blockedAt, '2026-10-02')
})

test('the blocked-contributor match ignores case and surrounding space', () => {
  const policy = loadPolicy()
  for (const login of ['lorz-3', 'LORZ-3', ' LOrz-3 ']) {
    assert.ok(findBlockedContributor(policy, login), login + ' must match')
  }
  assert.equal(findBlockedContributor(policy, 'LOrz-33'), null)
  assert.equal(findBlockedContributor(policy, 'lorz'), null)
})

test('an unlisted contributor is allowed with exit code 0', () => {
  assert.equal(findBlockedContributor(loadPolicy(), 'zhu1090093659'), null)
  const result = run(['--login', 'zhu1090093659'])
  assert.equal(result.status, 0)
})

test('the CLI reports a blocked contributor with the blocked exit code', () => {
  const result = run(['--login', 'LOrz-3'])
  assert.equal(result.status, BLOCKED_EXIT_CODE)
  assert.match(result.stdout, /blocked contributor LOrz-3/)
})

test('a crashed checker can never read as a blocked contributor', () => {
  const crash = spawnSync(process.execPath, [join(ROOT, 'scripts', 'missing-policy-checker.mjs')], { encoding: 'utf8' })
  assert.equal(crash.status, 1, 'the Node runtime reports a missing module as exit 1')
  assert.notEqual(crash.status, BLOCKED_EXIT_CODE)
})

test('the workflow closes on the same exit code the checker uses', () => {
  const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'submission-policy.yml'), 'utf8')
  assert.match(workflow, new RegExp('\\n\\s*' + BLOCKED_EXIT_CODE + '\\) echo "blocked=true"'))
})

test('a usage error exits 2, never 1', () => {
  assert.equal(run([]).status, 2)
  assert.equal(run(['--login']).status, 2)
})

test('the meridian character is prohibited with a dated copyright reason', () => {
  const entry = prohibitedWorks(loadPolicy()).find((work) => work.id === 'deepseek-meridian-character')
  assert.ok(entry, 'the meridian character must be a prohibited work')
  assert.equal(entry.addedAt, '2026-10-02')
  assert.match(entry.reason, /copyright/i)
  assert.match(entry.description, /blue hair/i)
})

test('the prohibited work points at a record that exists', () => {
  const entry = prohibitedWorks(loadPolicy()).find((work) => work.id === 'deepseek-meridian-character')
  const references = entry.references ?? []
  assert.ok(references.length > 0, 'a prohibited work records where it came from')
  for (const reference of references) {
    const path = reference.split(' ')[0]
    if (path.endsWith('/')) continue
    assert.ok(existsSync(join(ROOT, path)), path + ' must exist')
  }
})

test('a malformed policy is an error, not a blocked contributor', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'submission-policy-'))
  try {
    const file = join(sandbox, 'policy.json')
    writeFileSync(file, JSON.stringify({
      version: POLICY_VERSION,
      blockedContributors: [{ login: 'someone' }],
      prohibitedWorks: [],
    }))
    assert.throws(() => loadPolicy(file), /blockedAt/)
    writeFileSync(file, JSON.stringify({ version: 99, blockedContributors: [], prohibitedWorks: [] }))
    assert.throws(() => loadPolicy(file), /unsupported version/)
    writeFileSync(file, JSON.stringify({
      version: POLICY_VERSION,
      blockedContributors: [{ login: 'A', blockedAt: '2026-10-02', reason: 'x' }, { login: 'a', blockedAt: '2026-10-02', reason: 'x' }],
      prohibitedWorks: [],
    }))
    assert.throws(() => loadPolicy(file), /duplicate blocked login/)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})
