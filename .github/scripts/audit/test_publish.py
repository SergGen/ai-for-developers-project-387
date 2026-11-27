import hashlib
import json
import tempfile
import unittest
from collections import defaultdict
from pathlib import Path

from publish import publish


REPO = 'owner/calendar'
BOT = {'login': 'github-actions[bot]', 'type': 'Bot'}
SHA = 'a' * 40
MERGE = 'b' * 40


class Repository:
    """In-memory GitHub REST resources. Writes persist across simulated reruns."""

    def __init__(self):
        self.issues = []
        self.comments = defaultdict(list)
        self.runs = {}
        self.access = 'write'
        self.compare_status = 'ahead'
        self.pr = {'merged': True, 'merged_at': '2026-06-03T00:00:00Z',
                   'merge_commit_sha': MERGE, 'base': {'ref': 'main', 'repo': {'full_name': REPO}}}

    def pages(self, path):
        if path.startswith('issues?'):
            return list(self.issues)
        issue, resource = path.split('/')[1:]
        if resource == 'comments':
            return list(self.comments[int(issue)])
        raise AssertionError(path)

    def get(self, path):
        if path.startswith('actions/runs/'):
            return self.runs[path.split('/')[-1]]
        if path == 'pulls/25':
            return self.pr
        if path == 'collaborators/maintainer/permission':
            return {'permission': self.access}
        if path == f'compare/{MERGE}...{SHA}':
            return {'status': self.compare_status}
        raise AssertionError(path)

    def post(self, path, data):
        entry = {**data, 'user': BOT}
        if path == 'issues':
            entry.update(number=len(self.issues) + 1, state='open')
            self.issues.append(entry)
        else:
            parts = path.split('/')
            assert parts[0] == 'issues' and parts[2] == 'comments'
            entry['id'] = 101 + sum(map(len, self.comments.values()))
            self.comments[int(parts[1])].append(entry)
        return entry

    def patch(self, path, data):
        if path.startswith('issues/comments/'):
            items = [c for comments in self.comments.values() for c in comments]
            item = next(c for c in items if c.get('id') == int(path.split('/')[-1]))
        else:
            item = self.issues[int(path.split('/')[-1]) - 1]
        item.update(data)
        return item


class PublishTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name)
        self.repo = Repository()
        self.meta = {'sha': SHA, 'source_run': '100', 'profile': 'mobile-performance',
                     'path': '/', 'mode': 'live', 'status': 'ok'}
        self.analysis = {'audit_id': 'largest-contentful-paint', 'title': 'Largest Contentful Paint',
                         'evidence': '4.2 s', 'action': 'Уменьшите главное изображение.'}
        self.report = {
            'fetchTime': '2026-06-01T00:00:01Z',
            'categories': {'performance': {'score': 0.5, 'auditRefs': [
                {'id': 'largest-contentful-paint', 'weight': 25}]}},
            'audits': {'largest-contentful-paint': {'id': 'largest-contentful-paint',
                'title': 'Largest Contentful Paint', 'score': 0.44, 'scoreDisplayMode': 'numeric',
                'numericValue': 4200, 'displayValue': '4.2 s', 'numericUnit': 'millisecond'}}}
        self.new_measurement('100', 1)

    def new_measurement(self, run, day):
        when = f'2026-06-{day:02}T00:00:00Z'
        self.repo.runs[run] = {'head_sha': SHA, 'head_branch': 'main', 'created_at': when}
        self.meta['source_run'] = run
        self.report['fetchTime'] = when

    def execute(self, corrupt=False):
        data = json.dumps(self.report).encode()
        self.meta['report_id'] = ('f' * 64 if corrupt else hashlib.sha256(data).hexdigest())
        if self.meta['status'] == 'ok':
            (self.path / 'report.json').write_bytes(data)
            (self.path / 'analysis.json').write_text(json.dumps(self.analysis))
        (self.path / 'meta.json').write_text(json.dumps(self.meta))
        summary = publish(self.path, self.repo, REPO, '999')
        self.assertIn(f'https://github.com/{REPO}/issues/', summary)
        return summary

    def test_finding_is_actionable_and_idempotent(self):
        self.execute()
        self.execute()
        self.assertEqual(len(self.repo.issues), 1)
        body = self.repo.issues[0]['body']
        for item in ('4.2 s', '0.44', 'largest-contentful-paint', self.analysis['action'], SHA,
                     '/actions/runs/100', '/actions/runs/999', 'live', 'mobile-performance'):
            self.assertIn(item, body)
        self.assertFalse(self.repo.comments[1])

    def test_forged_evidence_clean_and_digest_fail_before_writes(self):
        with self.assertRaises(ValueError):
            self.execute(corrupt=True)
        self.analysis['evidence'] = '0.0 s'
        with self.assertRaises(ValueError):
            self.execute()
        self.analysis = {'audit_id': None, 'summary': 'Всё в порядке.'}
        with self.assertRaises(ValueError):
            self.execute()
        self.assertFalse(self.repo.issues)

    def test_recurrence_needs_new_report_after_an_included_merged_fix(self):
        self.execute()
        self.repo.issues[0]['state'] = 'closed'
        self.new_measurement('104', 4)
        self.execute()  # No linked PR.
        self.repo.comments[1].append({'body': 'Fix PR: #25', 'user': {'login': 'maintainer'}})
        self.repo.access = 'read'
        self.execute()
        self.repo.access = 'write'
        self.new_measurement('102', 2)  # Older than the fix.
        self.execute()
        self.new_measurement('105', 5)
        self.repo.compare_status = 'diverged'
        self.execute()
        self.assertEqual(len(self.repo.issues), 1)
        self.repo.compare_status = 'ahead'
        self.execute()
        self.assertEqual(len(self.repo.issues), 2)
        self.assertIn('#1', self.repo.issues[1]['body'])
        self.assertIn('#25', self.repo.issues[1]['body'])
        self.repo.issues[1]['state'] = 'closed'
        self.new_measurement('100', 1)
        self.execute()
        self.new_measurement('105', 5)
        self.execute()
        self.assertEqual(len(self.repo.issues), 2)

    def test_an_out_of_order_source_cannot_supersede_newer_observation(self):
        self.execute()
        self.new_measurement('106', 6)
        self.execute()
        self.repo.issues[0]['state'] = 'closed'
        self.repo.comments[1].append({'body': 'Fix PR: #25', 'user': {'login': 'maintainer'}})
        self.new_measurement('105', 5)
        self.execute()
        self.assertEqual(len(self.repo.issues), 1)

    def test_malformed_or_missing_source_is_journaled_as_no_data(self):
        self.report = {}
        self.analysis = {'status': 'no_data', 'reason': 'Malformed Lighthouse report'}
        self.execute()
        self.assertEqual(len(self.repo.issues), 1)
        self.assertIn('Нет данных', self.repo.issues[0]['body'])

    def test_source_provenance_mismatch_fails_before_writes(self):
        self.repo.runs['100']['head_sha'] = 'c' * 40
        with self.assertRaises(ValueError):
            self.execute()
        self.assertFalse(self.repo.issues)

    def test_report_seen_while_issue_open_cannot_become_recurrence(self):
        self.execute()
        self.new_measurement('105', 5)
        self.execute()
        self.execute()
        self.assertFalse(self.repo.comments[1])
        self.repo.issues[0]['state'] = 'closed'
        self.repo.comments[1].append({'body': 'Fix PR: #25', 'user': {'login': 'maintainer'}})
        self.execute()
        self.assertEqual(len(self.repo.issues), 1)

    def test_changed_measurement_gets_one_observation_with_updated_evidence(self):
        self.execute()
        self.new_measurement('105', 5)
        audit = self.report['audits']['largest-contentful-paint']
        audit.update(displayValue='3.2 s', numericValue=3200, score=0.62)
        self.analysis['evidence'] = '3.2 s'
        self.execute()
        self.execute()
        self.new_measurement('106', 6)
        self.execute()
        self.assertEqual(len(self.repo.issues), 1)
        observation, = self.repo.comments[1]
        self.assertIn('3.2 s', observation['body'])

    def test_journal_keeps_clean_and_no_data_without_duplicate_comments(self):
        self.report['audits']['largest-contentful-paint']['score'] = 1
        self.analysis = {'audit_id': None, 'summary': 'Порог пройден.'}
        self.execute()
        self.execute()
        self.assertEqual(len(self.repo.issues), 1)
        self.assertFalse(self.repo.comments[1])
        self.meta.update(status='no_data', reason='Chrome timed out')
        self.new_measurement('101', 2)
        self.execute()
        self.execute()
        self.assertEqual(len(self.repo.issues), 1)
        self.assertEqual(len(self.repo.comments[1]), 1)
        self.assertIn('Chrome timed out', self.repo.comments[1][0]['body'])

    def test_user_cannot_suppress_finding_with_forged_receipt(self):
        self.execute()
        self.repo.issues[0]['user'] = {'login': 'somebody', 'type': 'User'}
        self.execute()
        self.assertEqual(len(self.repo.issues), 2)

    def test_training_has_independent_fingerprint_and_visible_provenance(self):
        self.execute()
        self.meta['mode'] = 'training'
        self.execute()
        self.assertEqual(len(self.repo.issues), 2)
        self.assertIn('training', self.repo.issues[-1]['body'])


if __name__ == '__main__':
    unittest.main()
