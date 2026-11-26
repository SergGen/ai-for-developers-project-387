import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const limit = 5
const marker = 'Reserve OpenCode PR attempt'
const workflows = {
  '.github/workflows/opencode.yml': 'command',
  '.github/workflows/review.yml': 'review',
}

// A changing or truncated snapshot must never grant a free attempt.
async function pages(get, endpoint, key) {
  const rows = []
  let total
  for (let page = 1; ; page++) {
    const url = new URL(endpoint, 'https://api.github.com')
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', String(page))
    const data = await get(url.pathname + url.search)
    total ??= data.total_count
    if (!Number.isSafeInteger(total) || total !== data.total_count || !Array.isArray(data[key])) {
      throw new Error('Incomplete Actions history')
    }
    rows.push(...data[key])
    if (rows.length === total && new Set(rows.map(row => row.id)).size === total) return rows
    if (data[key].length < 100 || rows.length >= total) throw new Error('Truncated Actions history')
  }
}

export async function admissions(get, { repository, pr, currentRun, currentAttempt }) {
  const base = `/repos/${repository}`
  const pull = await get(`${base}/pulls/${pr}`)
  if (!pull.created_at) throw new Error('PR creation date unavailable')
  const query = new URLSearchParams({ created: `>=${pull.created_at}` })
  const history = await pages(get, `${base}/actions/runs?${query}`, 'workflow_runs')
  const candidates = history.filter(run =>
    run.head_repository?.full_name === repository &&
    Object.hasOwn(workflows, run.path) &&
    run.display_title === `PR #${pr} OpenCode ${workflows[run.path]}`,
  )
  if (!candidates.some(run => run.id === currentRun && run.run_attempt === currentAttempt)) {
    throw new Error('Current run attempt missing from Actions history')
  }
  const reservations = new Set()
  for (const run of candidates) {
    if (!Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) throw new Error('Missing run attempt')
    for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
      if (run.id === currentRun && attempt === currentAttempt) continue
      const jobs = await pages(get, `${base}/actions/runs/${run.id}/attempts/${attempt}/jobs`, 'jobs')
      if (!jobs.length && (run.status === 'completed' || attempt < run.run_attempt)) {
        throw new Error('Job history unavailable for completed attempt')
      }
      for (const job of jobs) {
        if (job.status === 'completed' && job.conclusion !== 'skipped' && !Array.isArray(job.steps)) {
          throw new Error('Step history unavailable for completed job')
        }
        const step = job.steps?.find(step => step.name === marker)
        if (!step) continue
        // GitHub may return successful jobs inherited by a partial rerun.
        // The immutable job ID identifies the actual reservation.
        if (step.status === 'in_progress' || step.conclusion === 'success' ||
          (step.started_at && ['cancelled', 'failure', 'timed_out'].includes(step.conclusion))) {
          reservations.add(job.id)
        } else if (job.status === 'in_progress' && step.status !== 'completed') {
          throw new Error('Previous model job still settling in Actions history')
        }
      }
    }
  }
  return reservations.size
}

async function main() {
  const { GH_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, GITHUB_OUTPUT, PR_NUMBER } = process.env
  let reason = 'infra'
  try {
    if (!/^[1-9]\d*$/.test(PR_NUMBER)) throw new Error('Missing PR number')
    const get = async endpoint => {
      const response = await fetch(new URL(endpoint, process.env.GITHUB_API_URL || 'https://api.github.com'), {
        headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error(`Actions history returned HTTP ${response.status}`)
      return response.json()
    }
    const used = await admissions(get, {
      repository: GITHUB_REPOSITORY, pr: Number(PR_NUMBER),
      currentRun: Number(GITHUB_RUN_ID), currentAttempt: Number(GITHUB_RUN_ATTEMPT),
    })
    console.log(`PR #${PR_NUMBER}: ${used} of ${limit} attempts previously reserved`)
    reason = used >= limit ? 'limit_exhausted' : ''
  } catch (error) {
    console.error(`Cannot confirm PR budget: ${error.message}`)
  }
  appendFileSync(GITHUB_OUTPUT, `allowed=${!reason}\nreason=${reason}\n`)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main()
