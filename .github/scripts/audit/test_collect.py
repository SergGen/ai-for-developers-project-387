import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("collect.py")


class CollectionTest(unittest.TestCase):
    def collect(self, scenario, source_run):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        output = Path(folder.name)
        env = {**os.environ, "GITHUB_SHA": "a" * 40, "GITHUB_RUN_ID": source_run}
        subprocess.run([sys.executable, SCRIPT, output, scenario], env=env, check=True)
        meta = json.loads((output / "meta.json").read_text())
        self.assertEqual(meta["path"], "/")
        self.assertEqual(meta["profile"], "mobile-performance")
        self.assertEqual(meta["sha"], "a" * 40)
        self.assertEqual(meta["source_run"], source_run)
        return output, meta

    def test_training_findings_share_an_audit_but_have_distinct_source_reports(self):
        ids = []
        for source_run in ["100", "101"]:
            output, meta = self.collect("training-finding", source_run)
            self.assertEqual((meta["mode"], meta["status"]), ("training", "ok"))
            payload = (output / "report.json").read_bytes()
            self.assertEqual(hashlib.sha256(payload).hexdigest(), meta["report_id"])
            report = json.loads(payload)
            ref, = report["categories"]["performance"]["auditRefs"]
            audit = report["audits"][ref["id"]]
            self.assertEqual((ref["id"], ref["weight"]), ("largest-contentful-paint", 25))
            self.assertEqual((audit["scoreDisplayMode"], audit["score"]), ("numeric", 0.41))
            self.assertEqual(audit["numericValue"], 4250)
            self.assertIn("training", (output / "report.html").read_text().lower())
            self.assertEqual(report["training"]["source_run"], source_run)
            ids.append(meta["report_id"])
        self.assertNotEqual(*ids)

    def test_clean_fixture_contains_a_successful_measurement(self):
        output, meta = self.collect("training-clean", "102")
        self.assertEqual(meta["status"], "ok")
        report = json.loads((output / "report.json").read_text())
        self.assertGreaterEqual(report["audits"]["largest-contentful-paint"]["score"], 0.9)

    def test_missing_data_is_explicit(self):
        output, meta = self.collect("training-no-data", "103")
        self.assertEqual((meta["mode"], meta["status"]), ("training", "no_data"))
        self.assertTrue(meta["reason"])
        self.assertRegex(meta["report_id"], r"^[a-f0-9]{64}$")
        self.assertFalse((output / "report.json").exists())
