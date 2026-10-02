#!/usr/bin/env node
/**
 * verify-evidence - prove that a skin pull request's evidence screenshots are the
 * same bytes as the files the pull request commits.
 *
 * A screenshot pasted into a description proves nothing about the code under
 * review: it can show a background that never existed in the diff. The rule is
 * mechanical. Every image the description references must have a byte-identical
 * twin committed under the evidence directory by the same pull request, and there
 * must be at least evidence.requiredImages of them. Anything else is refused
 * before a human looks at it; a match is handed to the intake gates.
 *
 * This script only decides and reports - closing the pull request is the
 * workflow's job - so it can be run read-only against any pull request.
 *
 * Usage:
 *   node scripts/verify-evidence.mjs --pr <number> [--comment-file <path>]
 *   node scripts/verify-evidence.mjs --body-file <path> --urls
 *
 * Environment: GITHUB_TOKEN or GH_TOKEN, GITHUB_REPOSITORY (owner/name).
 * Exit codes: 0 verified or not applicable, 4 refuse, 2 error.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const POLICY_FILE = join(ROOT, '.github', 'submission-policy.json')
/** Refuse is 4, not 1: the Node runtime exits 1 for any uncaught error. */
export const REFUSE_EXIT_CODE = 4
/** A single evidence image larger than this is not a screenshot we compare. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const API = 'https://api.github.com'
const TIMEOUT_MS = 30_000
const IMAGE_EXT = 'png|jpe?g|gif|webp|avif|bmp|mp4|mov|webm'
/** GitHub's own attachment hosts serve extension-less image URLs. */
const ATTACHMENT_RE = /https?:\/\/(?:github\.com\/user-attachments\/assets|private-user-images\.githubusercontent\.com)\/[^\s<>"')]+/gi
const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\(\s*<?(https?:\/\/[^\s)<>]+)>?\s*\)/g
const HTML_IMAGE_RE = /<img\b[^>]*\bsrc\s*=\s*["'](https?:\/\/[^"']+)["']/gi
const BARE_IMAGE_RE = new RegExp('https?:\\/\\/[^\\s<>"\')\\]]+\\.(?:' + IMAGE_EXT + ')(?:\\?[^\\s<>"\')\\]]*)?', 'gi')

/** Every distinct http(s) image the pull request description references, in order. */
export function extractImageUrls(body) {
  if (typeof body !== 'string') return []
  const found = []
  const add = (url) => {
    if (!url || !/^https?:\/\//i.test(url)) return
    if (!found.includes(url)) found.push(url)
  }
  for (const match of body.matchAll(MARKDOWN_IMAGE_RE)) add(match[1])
  for (const match of body.matchAll(HTML_IMAGE_RE)) add(match[1])
  for (const match of body.matchAll(BARE_IMAGE_RE)) add(match[0])
  for (const match of body.matchAll(ATTACHMENT_RE)) add(match[0])
  return found
}

function shortUrl(url) {
  return url.length > 96 ? url.slice(0, 93) + '...' : url
}

/**
 * The decision for one pull request.
 *
 * images   - [{ url, sha256?, bytes?, error? }] the description's images, downloaded
 * committed- [{ path, sha256 }] files under the evidence directory this PR changes
 * required - how many images the description must reference
 */
export function evaluateEvidence({ images, committed, required }) {
  if (!Array.isArray(images) || !Array.isArray(committed)) {
    throw new Error('evaluateEvidence: images and committed must be arrays')
  }
  if (images.length < required) {
    return refuse(
      'missing-evidence',
      'The description references ' + images.length + ' evidence image' + (images.length === 1 ? '' : 's') +
        ', but ' + required + ' are required (one per theme).',
      images,
      committed,
    )
  }
  const unreadable = images.filter((image) => image.error)
  if (unreadable.length > 0) {
    return refuse(
      'unreadable-evidence',
      'These images could not be downloaded, so they cannot be matched against the committed files: ' +
        unreadable.map((image) => shortUrl(image.url) + ' (' + image.error + ')').join('; ') + '.',
      images,
      committed,
    )
  }
  const unmatched = images.filter((image) => !committed.some((file) => file.sha256 === image.sha256))
  if (unmatched.length > 0) {
    return refuse(
      'evidence-mismatch',
      'These images are not byte-identical to any file this pull request commits under the evidence directory: ' +
        unmatched.map((image) => shortUrl(image.url)).join('; ') + '.',
      images,
      committed,
    )
  }
  return {
    decision: 'pass',
    reason: null,
    detail:
      'All ' + images.length + ' evidence images match committed files byte for byte (' +
      images.map((image) => 'sha256:' + image.sha256.slice(0, 12)).join(', ') + ').',
    comment: null,
  }
}

function refuse(reason, detail, images, committed) {
  const lines = [
    'This pull request was closed without review: its evidence screenshots could not be matched to the files it commits.',
    '',
    detail,
    '',
    'The rule: every screenshot pasted into the description must also be committed to the evidence',
    'directory in this pull request, byte for byte, and the hashes must match (sha256). Only an exact',
    'match reaches human review, because a screenshot that does not correspond to the submitted source',
    'proves nothing about it.',
    '',
    'Screenshots seen in the description:',
    ...(images.length === 0 ? ['- (none)'] : images.map((image) => '- ' + shortUrl(image.url) + (image.sha256 ? '  sha256:' + image.sha256.slice(0, 12) : '  (' + (image.error || 'not downloaded') + ')'))),
    '',
    'Files this pull request commits under the evidence directory:',
    ...(committed.length === 0 ? ['- (none)'] : committed.map((file) => '- ' + file.path + '  sha256:' + file.sha256.slice(0, 12))),
    '',
    'See CONTRIBUTING.md ("Evidence") and the pull request template.',
  ]
  return { decision: 'refuse', reason, detail, comment: lines.join('\n') }
}

// --- GitHub access ---------------------------------------------------------

function token() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
}

async function api(pathname, accept = 'application/vnd.github+json') {
  const response = await fetch(API + pathname, {
    headers: {
      authorization: 'Bearer ' + token(),
      accept,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'dsh-skins-evidence-check',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error('github ' + pathname + ' -> ' + response.status)
  return response
}

/**
 * Download a contributor-supplied image. Deliberately no Authorization header:
 * these URLs are arbitrary hosts, and a token must never be offered to one.
 */
async function downloadImage(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { accept: 'image/*,*/*;q=0.8', 'user-agent': 'dsh-skins-evidence-check' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) throw new Error('http ' + response.status)
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > MAX_IMAGE_BYTES) throw new Error('larger than ' + MAX_IMAGE_BYTES + ' bytes')
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('larger than ' + MAX_IMAGE_BYTES + ' bytes')
  return bytes
}

async function downloadWithRetry(url) {
  let last
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await downloadImage(url)
    } catch (error) {
      last = error
    }
  }
  return { error: String((last && last.message) || last) }
}

async function pullRequestFiles(repo, number) {
  const files = []
  for (let page = 1; page <= 10; page += 1) {
    const response = await api('/repos/' + repo + '/pulls/' + number + '/files?per_page=100&page=' + page)
    const batch = await response.json()
    files.push(...batch)
    if (batch.length < 100) break
  }
  return files
}

async function committedEvidenceFile(repo, ref, path) {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  const response = await api('/repos/' + repo + '/contents/' + encoded + '?ref=' + ref, 'application/vnd.github.raw')
  const bytes = Buffer.from(await response.arrayBuffer())
  return { path, sha256: createHash('sha256').update(bytes).digest('hex') }
}

async function checkPullRequest({ repo, number, requiredImages, evidenceDir }) {
  const pull = await (await api('/repos/' + repo + '/pulls/' + number)).json()
  const association = pull.author_association
  if (association === 'OWNER' || association === 'MEMBER' || association === 'COLLABORATOR') {
    return { decision: 'pass', reason: 'maintainer', detail: association + ' pull requests are not evidence-gated.', comment: null }
  }
  const files = await pullRequestFiles(repo, number)
  const touchesSkins = files.some((file) => file.filename.startsWith('skins/') && file.status !== 'removed')
  if (!touchesSkins) {
    return { decision: 'pass', reason: 'not-a-skin', detail: 'The pull request does not add or change a skin.', comment: null }
  }
  const headRepo = (pull.head && pull.head.repo && pull.head.repo.full_name) || repo
  const headSha = pull.head.sha
  const evidenceFiles = files.filter((file) => file.status !== 'removed' && file.filename.startsWith(evidenceDir + '/'))
  const committed = []
  for (const file of evidenceFiles) {
    committed.push(await committedEvidenceFile(headRepo, headSha, file.filename))
  }
  const urls = extractImageUrls(pull.body || '')
  const images = []
  for (const url of urls) {
    const result = await downloadWithRetry(url)
    if (Buffer.isBuffer(result)) {
      images.push({ url, sha256: createHash('sha256').update(result).digest('hex'), bytes: result.length })
    } else {
      images.push({ url, error: result.error })
    }
  }
  return evaluateEvidence({ images, committed, required: requiredImages })
}

// --- CLI -------------------------------------------------------------------

function readPolicy() {
  return JSON.parse(readFileSync(POLICY_FILE, 'utf8'))
}

function usage() {
  console.error('usage: node scripts/verify-evidence.mjs --pr <number> [--comment-file <path>]')
  console.error('       node scripts/verify-evidence.mjs --body-file <path> --urls')
  return 2
}

async function main(argv = process.argv.slice(2)) {
  const arg = (flag) => {
    const index = argv.indexOf(flag)
    return index === -1 ? null : argv[index + 1] ?? null
  }
  try {
    const bodyFile = arg('--body-file')
    if (bodyFile) {
      if (argv.includes('--urls')) {
        console.log(extractImageUrls(readFileSync(bodyFile, 'utf8')).join('\n'))
        return 0
      }
      return usage()
    }
    const number = arg('--pr')
    if (!number || !/^\d+$/.test(number)) return usage()
    const repo = process.env.GITHUB_REPOSITORY || ''
    if (repo === '') {
      console.error('verify-evidence: GITHUB_REPOSITORY is not set')
      return 2
    }
    const policy = readPolicy()
    if (!token()) {
      console.error('verify-evidence: GITHUB_TOKEN is not set')
      return 2
    }
    const requiredImages = policy.evidence && Number.isInteger(policy.evidence.requiredImages)
      ? policy.evidence.requiredImages
      : 2
    const evidenceDir = (policy.evidence && policy.evidence.directory) || 'evidence'
    const result = await checkPullRequest({ repo, number, requiredImages, evidenceDir })
    console.log(JSON.stringify({ decision: result.decision, reason: result.reason, detail: result.detail }, null, 2))
    const commentFile = arg('--comment-file')
    if (commentFile && result.comment) writeFileSync(commentFile, result.comment + '\n')
    return result.decision === 'refuse' ? REFUSE_EXIT_CODE : 0
  } catch (error) {
    console.error('verify-evidence: ' + String((error && error.message) || error))
    return 2
  }
}

const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) main().then((code) => process.exit(code))
