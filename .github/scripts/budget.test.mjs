import { test } from 'node:test'
import assert from 'node:assert/strict'
import { admissions, limit } from './budget.mjs'

const repo = 'example/calendar'
const options = { repository: repo, pr: 17, currentRun: 100, currentAttempt: 1 }
function run(id, { kind = 'command', pr = 17, attempt = 1 } = {}) {
  return {
    id, run_attempt: attempt, head_repository: { full_name: repo },
    path: `.github/workflows/${kind === 'review' ? 'review' : 'opencode'}.yml`,
    display_title: `PR #${pr} OpenCode ${kind}`, status: 'completed',
  }
}

function job(id, conclusion = 'success', markerConclusion = 'success') {
  return { id, status: 'completed', conclusion, steps: [{
    name: 'Reserve OpenCode PR attempt', status: 'completed', conclusion: markerConclusion,
    started_at: markerConclusion === 'skipped' ? null : '2026-11-26T10:00:00Z',
  }] }
}

function github(runs, attempts = {}) {
  return async path => {
    const url = new URL(path, 'https://api.github.com')
    if (url.pathname === `/repos/${repo}/pulls/17`) return { created_at: '2026-11-25T02:00:00Z' }
    const isRunList = url.pathname.endsWith('/actions/runs')
    const match = url.pathname.match(/runs\/(\d+)\/attempts\/(\d+)\/jobs$/)
    assert.ok(isRunList || match, url.pathname)
    const all = isRunList ? runs : attempts[`${match[1]}/${match[2]}`]
    assert.ok(all, `Unknown job list for ${url.pathname}`)
    const start = (Number(url.searchParams.get('page')) - 1) * 100
    return { total_count: all.length, [isRunList ? 'workflow_runs' : 'jobs']: all.slice(start, start + 100) }
  }
}

test('counts both channels, retries of failed jobs, cancellation and timeout once per actual reservation', async () => {
  const runs = [run(16), run(17, { kind: 'review', attempt: 3 }), run(18), run(100, { attempt: 2 })]
  const attempts = {
    '16/1': [job(160, 'cancelled')],
    '17/1': [job(170, 'timed_out')],
    '17/2': [job(171, 'failure')],
    '17/3': [job(171, 'failure')], // Re-running only the publisher did not call the model again.
    '18/1': [job(180, 'failure', 'skipped')],
    '100/1': [job(1000)],
  }
  assert.equal(await admissions(github(runs, attempts), { ...options, currentAttempt: 2 }), 4)
})

test('shared concurrency admits only one of two contenders for the final slot', async () => {
  const previous = [1, 2, 3, 4].map(id => run(id))
  const runs = [...previous, run(100), run(101, { kind: 'review' })]
  const attempts = Object.fromEntries(previous.map(r => [`${r.id}/1`, [job(r.id)]]))
  // A waiting job has not yet executed its reservation.
  runs.at(-1).status = 'queued'
  attempts['101/1'] = []
  assert.equal(await admissions(github(runs, attempts), options), limit - 1)
  attempts['100/1'] = [job(1000)]
  assert.equal(await admissions(github(runs, attempts), { ...options, currentRun: 101 }), limit)
})

test('paginates runs and jobs, excludes other PRs, issues, forks and unrelated workflows', async () => {
  const runs = [
    ...Array.from({ length: 100 }, (_, n) => run(n + 200, { pr: 9 })),
    { ...run(1), display_title: 'Issue #17 OpenCode' },
    { ...run(2), head_repository: { full_name: 'elsewhere/calendar' } },
    { ...run(3), path: '.github/workflows/other.yml' }, run(5), run(100),
  ]
  const attempts = { '5/1': [...Array.from({ length: 100 }, (_, n) => job(300 + n, 'skipped', 'skipped')), job(500)] }
  assert.equal(await admissions(github(runs, attempts), options), 1)
  assert.equal(await admissions(github([run(12, { pr: 2 }), run(100)]), options), 0)
})

test('fails closed on missing attempts, missing job details or an incomplete API snapshot', async () => {
  await assert.rejects(admissions(github([]), options), /Current run attempt missing/)
  await assert.rejects(admissions(github([run(1), run(100)], { '1/1': [] }), options), /Job history unavailable/)
  await assert.rejects(admissions(github([run(1), run(100)], { '1/1': [{ id: 1, status: 'completed', conclusion: 'success' }] }), options), /Step history unavailable/)
  const api = github([run(100)])
  await assert.rejects(admissions(async path => {
    const data = await api(path)
    if (data.workflow_runs) data.total_count++
    return data
  }, options), /Truncated Actions history/)
  await assert.rejects(admissions(async () => { throw new Error('HTTP 403') }, options), /HTTP 403/)
})
