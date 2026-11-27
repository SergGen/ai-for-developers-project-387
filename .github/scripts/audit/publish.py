"""Publish verified Lighthouse results. All publishing jobs share a workflow concurrency group."""

import hashlib
import html
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from analyze import select_candidate


class GitHub:
    def __init__(self, repo):
        self.prefix = f'repos/{repo}/'

    def request(self, path, *flags, data=None):
        result = subprocess.run(['gh', 'api', self.prefix + path, *flags],
                                input=json.dumps(data) if data is not None else None,
                                text=True, capture_output=True, timeout=120)
        if result.returncode:
            if 'HTTP 404' in result.stderr and path.startswith(('pulls/', 'collaborators/')):
                return {}
            # CLI diagnostics may echo request data. Log only the endpoint family.
            raise RuntimeError(f'GitHub API request failed ({path.split("/")[0]})')
        return json.loads(result.stdout)

    def get(self, path):
        return self.request(path)

    def pages(self, path):
        return [row for page in self.request(path, '--paginate', '--slurp') for row in page]

    def post(self, path, data):
        return self.request(path, '--method', 'POST', '--input', '-', data=data)

    def patch(self, path, data):
        return self.request(path, '--method', 'PATCH', '--input', '-', data=data)


def require(test, message):
    if not test:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def text_field(data, key, limit):
    value = data.get(key)
    require(isinstance(value, str) and 0 < len(value.strip()) <= limit, f'Invalid {key}')
    return value.strip()


def check_inputs(directory):
    meta = json.loads((directory / 'meta.json').read_bytes())
    require(meta.get('profile') == 'mobile-performance' and meta.get('path') == '/'
            and meta.get('mode') in ('training', 'live'), 'Unknown audit target')
    require(re.fullmatch('[0-9a-f]{40}', meta['sha']) and
            re.fullmatch('[1-9][0-9]*', meta['source_run']) and
            re.fullmatch('[0-9a-f]{64}', meta['report_id']), 'Invalid source identifiers')
    if meta['status'] == 'no_data':
        return meta, None, 'no_data', text_field(meta, 'reason', 2000)
    require(meta['status'] == 'ok', 'Unknown collection status')

    analysis = json.loads((directory / 'analysis.json').read_bytes())
    report = directory / 'report.json'
    raw = report.read_bytes() if report.exists() else b''
    if report.exists():
        require(digest(raw) == meta['report_id'], 'Report digest does not match source')
    try:
        candidate = select_candidate(json.loads(raw))
    except (ValueError, RecursionError, OverflowError):
        require(analysis.get('status') == 'no_data', 'Unusable report requires a no_data result')
        return meta, None, 'no_data', text_field(analysis, 'reason', 2000)

    require(analysis.get('status') != 'no_data', 'Measured report marked no_data')
    if candidate is None:
        require('audit_id' in analysis and analysis['audit_id'] is None, 'Clean report has a finding')
        return meta, None, 'clean', text_field(analysis, 'summary', 2000)
    require(all(analysis.get(key) == candidate[key] for key in ('audit_id', 'title', 'evidence')),
            'Selected audit and evidence must match the source report')
    return meta, candidate, 'finding', text_field(analysis, 'action', 2000)


MARKER = '<!-- calendar-audit-v1 '


def marker(record):
    return MARKER + json.dumps(record, separators=(',', ':')) + ' -->'


def bot_record(item):
    if (item.get('user') or {}).get('login') != 'github-actions[bot]' or 'pull_request' in item:
        return None
    first = (item.get('body') or '').partition('\n')[0]
    if first.startswith(MARKER) and first.endswith(' -->'):
        try:
            data = json.loads(first[len(MARKER):-4])
            if isinstance(data, dict):
                return data
        except ValueError:
            pass
    return None


def timestamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def fixing_pr(api, comments, repo, meta, original_time, source_time):
    if source_time <= original_time:
        return None
    for comment in reversed(comments):
        match = re.fullmatch(r'Fix PR: #([1-9][0-9]*)', (comment.get('body') or '').strip(), re.I)
        if not match:
            continue
        author = comment['user']['login']
        access = api.get(f'collaborators/{author}/permission').get('permission')
        if access not in ('admin', 'maintain', 'write'):
            continue
        number = match.group(1)
        pr = api.get(f'pulls/{number}')
        if (not pr.get('merged') or pr['base']['ref'] != 'main'
                or pr['base']['repo']['full_name'].lower() != repo.lower()):
            continue
        merged = timestamp(pr['merged_at'])
        if not original_time < merged < source_time:
            continue
        comparison = api.get(f'compare/{pr["merge_commit_sha"]}...{meta["sha"]}')
        if comparison['status'] in ('ahead', 'identical'):
            return number
    return None


def publish(directory, api, repo, run_id):
    meta, candidate, status, detail = check_inputs(directory)
    source_id = meta['source_run']
    source = api.get(f'actions/runs/{source_id}')
    require(source['head_sha'] == meta['sha'] and source['head_branch'] == 'main',
            'Source run must match the measured main commit')
    observed = timestamp(source['created_at'])
    scope = [repo.lower(), meta['mode'], meta['profile'], meta['path']]
    fingerprint = digest(json.dumps([*scope, candidate['audit_id'] if candidate else 'journal']).encode())
    scope_id = digest(json.dumps(scope).encode())
    record = dict(kind='finding' if candidate else 'journal', fingerprint=fingerprint,
                  scope=scope_id, report=meta['report_id'], source=source_id, time=source['created_at'])
    url = f'https://github.com/{repo}'

    def link(issue):
        return f"[#{issue['number']}]({url}/issues/{issue['number']})"

    current = None
    previous = None
    if candidate:
        record['metric'] = [candidate['score'], candidate['numericValue'], candidate['evidence']]
    # Search all states without GitHub Search's indexing delay or 1,000-result cap.
    for issue in api.pages('issues?state=all&creator=github-actions%5Bbot%5D&per_page=100'):
        first = bot_record(issue)
        if not first or first.get('scope') != scope_id:
            continue
        comments = api.pages(f'issues/{issue["number"]}/comments')
        history = [(issue, first)]
        for comment in comments:
            item = bot_record(comment)
            if item and item.get('scope') == scope_id:
                history.append((comment, item))
        if any(r['report'] == record['report'] or record['report'] in r.get('receipts', [])
               for _, r in history):
            return f'Отчёт уже учтён в {link(issue)}.'
        if first.get('fingerprint') != fingerprint:
            continue
        latest = max(history, key=lambda pair: timestamp(pair[1].get('last_time', pair[1]['time'])))
        if not candidate or issue['state'] == 'open':
            current = issue, latest
        elif previous is None or issue['number'] > previous[0]['number']:
            previous = (issue, first, comments, latest[1])

    provenance = (f"Режим `{meta['mode']}` · профиль `{meta['profile']}` · путь `{meta['path']}`\n\n"
                  f"[Измеренный коммит `{meta['sha']}`]({url}/commit/{meta['sha']}) · "
                  f"[Исходный отчёт и артефакты]({url}/actions/runs/{source_id}) · "
                  f"[Запуск анализа]({url}/actions/runs/{run_id})\n\n"
                  f"SHA-256 отчёта `{meta['report_id']}`")
    if candidate:
        title = f"[{'Учебный аудит' if meta['mode'] == 'training' else 'Lighthouse'}] {candidate['title']}"
        body = (f"Проверка `{candidate['audit_id']}`\n\n"
                f"Измерение <code>{html.escape(candidate['evidence'])}</code> · "
                f"оценка {candidate['score']} при пороге 0.90.\n\n"
                f"Предлагаемое действие\n\n<pre>{html.escape(detail)}</pre>")
    else:
        title = f"Журнал аудита Lighthouse ({meta['mode']})"
        outcome = 'Замечаний нет' if status == 'clean' else 'Нет данных'
        body = f'**{outcome}**\n\n<pre>{html.escape(detail)}</pre>'
    if current:
        issue, (item, last) = current
        last_time = timestamp(last.get('last_time', last['time']))
        receipts = last.get('receipts', [])
        if candidate and (record['metric'] == last['metric'] or observed <= last_time) and len(receipts) < 128:
            # Preserve every digest, including those observed before closure. Keep
            # equivalent measurements in the private marker without a new comment.
            updated = {**last, 'receipts': [*receipts, record['report']],
                       'last_time': max(last_time, observed).isoformat()}
            _, newline, visible = item['body'].partition('\n')
            endpoint = (f'issues/{issue["number"]}' if item is issue
                        else f'issues/comments/{item["id"]}')
            api.patch(endpoint, {'body': marker(updated) + newline + visible})
            return f'Исходный отчёт учтён в {link(issue)}. Нового замечания нет.'
        record['kind'] = 'observation'
        api.post(f'issues/{issue["number"]}/comments',
                 {'body': f'{marker(record)}\n{body}\n\n{provenance}'})
        return f'Результат аудита добавлен в {link(issue)}.'
    if previous:
        issue, first, comments, latest = previous
        latest_time = timestamp(latest.get('last_time', latest['time']))
        if observed <= latest_time:
            return f'Более свежий результат уже учтён в {link(issue)}.'
        fix = fixing_pr(api, comments, repo, meta, timestamp(first['time']), observed)
        if not fix:
            return f'Для {link(issue)} не подтверждено исправление до этого измерения.'
        body += f"\n\nПовторная находка после исправления в #{fix}. Предыдущая задача #{issue['number']}."
    created = api.post('issues', {'title': title, 'body': f'{marker(record)}\n{body}\n\n{provenance}'})
    return f'Результат аудита опубликован в {link(created)}.'


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Usage: publish.py DIRECTORY')
    repository = os.environ['GITHUB_REPOSITORY']
    print(publish(Path(sys.argv[1]), GitHub(repository), repository, os.environ['GITHUB_RUN_ID']))
