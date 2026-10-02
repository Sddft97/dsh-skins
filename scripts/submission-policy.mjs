#!/usr/bin/env node
/**
 * submission-policy - read and evaluate .github/submission-policy.json.
 *
 * Two maintainer decisions sit in front of the intake gates: accounts whose
 * pull requests are closed without review, and works that may not be submitted
 * on copyright grounds. The file is the single source for the workflow, the
 * review gates and the documentation, so none of them keeps a second list.
 *
 * Usage:
 *   node scripts/submission-policy.mjs --login <github-login>   # exit 3 = blocked
 *   node scripts/submission-policy.mjs --list                   # print the policy
 *
 * Exit codes: 0 allowed, 3 blocked, 2 usage or malformed policy. Blocked is 3
 * and not 1 on purpose: the Node runtime exits 1 for a missing module or any
 * other uncaught error, and a caller that closes a pull request must never read
 * a crashed checker as a contributor to refuse.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const POLICY_FILE = join(ROOT, '.github', 'submission-policy.json')
export const POLICY_VERSION = 1
/** Exit code for a blocked contributor. See the exit-code note above. */
export const BLOCKED_EXIT_CODE = 3
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const LOGIN_RE = /^[A-Za-z0-9-]+$/

function fail(message) {
  throw new Error('submission-policy: ' + message)
}

function requireString(value, where) {
  if (typeof value !== 'string' || value.trim() === '') fail(where + ' must be a non-empty string')
  return value
}

function requireDate(value, where) {
  requireString(value, where)
  if (!DATE_RE.test(value)) fail(where + ' must be YYYY-MM-DD')
  return value
}

/** Read and validate the policy file. Throws on a malformed policy. */
export function loadPolicy(file = POLICY_FILE) {
  const policy = JSON.parse(readFileSync(file, 'utf8'))
  if (policy === null || typeof policy !== 'object' || Array.isArray(policy)) {
    fail('policy must be an object')
  }
  if (policy.version !== POLICY_VERSION) {
    fail('unsupported version ' + JSON.stringify(policy.version))
  }
  if (!Array.isArray(policy.blockedContributors)) fail('blockedContributors must be an array')
  if (!Array.isArray(policy.prohibitedWorks)) fail('prohibitedWorks must be an array')

  const logins = new Set()
  policy.blockedContributors.forEach((entry, index) => {
    const where = 'blockedContributors[' + index + ']'
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      fail(where + ' must be an object')
    }
    const login = requireString(entry.login, where + '.login')
    if (!LOGIN_RE.test(login)) fail(where + '.login ' + JSON.stringify(login) + ' is not a GitHub login')
    const key = login.toLowerCase()
    if (logins.has(key)) fail('duplicate blocked login ' + login)
    logins.add(key)
    requireDate(entry.blockedAt, where + '.blockedAt')
    requireString(entry.reason, where + '.reason')
  })

  const works = new Set()
  policy.prohibitedWorks.forEach((entry, index) => {
    const where = 'prohibitedWorks[' + index + ']'
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      fail(where + ' must be an object')
    }
    const id = requireString(entry.id, where + '.id')
    if (works.has(id)) fail('duplicate prohibited work ' + id)
    works.add(id)
    requireDate(entry.addedAt, where + '.addedAt')
    requireString(entry.reason, where + '.reason')
    requireString(entry.description, where + '.description')
  })

  return policy
}

/** The blocked-contributor entry for a login, or null. Case-insensitive. */
export function findBlockedContributor(policy, login) {
  if (typeof login !== 'string') return null
  const key = login.trim().toLowerCase()
  if (key === '') return null
  return policy.blockedContributors.find((entry) => entry.login.toLowerCase() === key) ?? null
}

/** The prohibited works the copyright gate must refuse. */
export function prohibitedWorks(policy) {
  return policy.prohibitedWorks
}

/** CLI entry point; returns the process exit code. */
export function main(argv = process.argv.slice(2)) {
  const loginFlag = argv.indexOf('--login')
  try {
    if (loginFlag !== -1) {
      const login = argv[loginFlag + 1] ?? ''
      if (login === '') {
        console.error('usage: node scripts/submission-policy.mjs --login <github-login> | --list')
        return 2
      }
      const policy = loadPolicy()
      const blocked = findBlockedContributor(policy, login)
      if (blocked) {
        console.log('submission-policy: blocked contributor ' + blocked.login + ' (since ' + blocked.blockedAt + ')')
        return BLOCKED_EXIT_CODE
      }
      console.log('submission-policy: ' + login + ' is not a blocked contributor')
      return 0
    }
    if (argv.includes('--list')) {
      console.log(JSON.stringify(loadPolicy(), null, 2))
      return 0
    }
    console.error('usage: node scripts/submission-policy.mjs --login <github-login> | --list')
    return 2
  } catch (error) {
    console.error(String(error && error.message ? error.message : error))
    return 2
  }
}

const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) process.exit(main())
