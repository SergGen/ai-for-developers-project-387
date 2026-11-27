import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("analyze.py")


def audit(key, score, value, display):
    return {"id": key, "title": key.upper(), "scoreDisplayMode": "numeric",
            "score": score, "numericValue": value, "displayValue": display}


class AnalyzeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.binary = self.root / "opencode"
        self.meta("ok")
        self.report = {
            "categories": {"performance": {"auditRefs": [
                {"id": "tbt", "weight": 30}, {"id": "lcp", "weight": 25},
                {"id": "info", "weight": 0}]}},
            "audits": {"tbt": audit("tbt", 0.8, 230, "230 ms"),
                       "lcp": audit("lcp", 0.41, 4250, "4.3 s"),
                       "info": audit("info", 0, 5000, "5 s")},
        }
        self.answer = {"audit_id": "lcp", "title": "LCP", "evidence": "4.3 s",
                       "action": "Inspect the LCP element in the performance trace."}

    def meta(self, status):
        (self.root / "meta.json").write_text(json.dumps({"status": status}))

    def model(self, answer, extra=""):
        event = {"type": "text", "part": {"text": json.dumps(answer)}}
        self.binary.write_text("#!/usr/bin/python3\nimport json, os, sys\n"
                               "prompt = sys.stdin.read()\n" + extra + "\nprint(" +
                               repr(json.dumps(event)) + ")\n")
        self.binary.chmod(0o700)

    def analyze(self):
        (self.root / "report.json").write_text(json.dumps(self.report))
        return subprocess.run([sys.executable, SCRIPT, self.root], text=True, capture_output=True,
                              env={**os.environ, "OPENCODE_BIN": str(self.binary),
                                   "GH_TOKEN": "unrelated", "OPENROUTER_API_KEY": "example"})

    def output(self):
        return json.loads((self.root / "analysis.json").read_text())

    def test_measured_finding_and_isolated_model_context(self):
        self.model(self.answer, """
assert "4250" in prompt and "0.41" in prompt
assert "GH_TOKEN" not in os.environ and os.environ["OPENROUTER_API_KEY"] == "example"
cfg = json.loads(os.environ["OPENCODE_CONFIG_CONTENT"])
assert cfg["permissions"] == [{"action":"*", "resource":"*", "effect":"deny"}]
assert all(policy["effect"] == "deny" for policy in cfg["policies"])
assert {p["action"] for p in cfg["policies"]} >= {"tool.use", "mcp.use", "plugin.use"}
assert "--standalone" in sys.argv and "openrouter/openrouter/free" in sys.argv
assert not os.path.exists("report.json") and not os.path.exists(".git")
""")
        result = self.analyze()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.output(), self.answer)

    def test_candidate_must_match_weighted_priority_and_original_evidence(self):
        self.report["audits"]["lcp"]["score"] = 0.79
        # TBT now loses 6 weighted points vs 5.25 for LCP.
        for answer in [self.answer, {**self.answer, "audit_id": "tbt", "title": "TBT"},
                       {**self.answer, "audit_id": "tbt", "title": "TBT", "evidence": "230 ms", "action": ""}]:
            with self.subTest(answer=answer):
                self.model(answer)
                self.assertNotEqual(self.analyze().returncode, 0)
                self.assertFalse((self.root / "analysis.json").exists())

    def test_clean_with_boundary_score_and_unweighted_failures(self):
        self.report["audits"]["lcp"]["score"] = 1
        self.report["audits"]["tbt"]["score"] = 0.9
        self.model({"audit_id": None, "lowest_audit_id": "tbt"})
        result = self.analyze()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIsNone(self.output()["audit_id"])
        self.assertIn("0.9", self.output()["summary"])

    def test_provider_error_drops_stale_analysis_and_keeps_raw_data(self):
        (self.root / "analysis.json").write_text(json.dumps(self.answer))
        self.model(self.answer, 'print(json.dumps({"type":"error","error":{"status":429}}))')
        result = self.analyze()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("429", result.stderr)
        self.assertEqual(json.loads((self.root / "report.json").read_text()), self.report)
        self.assertFalse((self.root / "analysis.json").exists())

    def test_no_data_skips_model(self):
        (self.root / "meta.json").write_text(json.dumps({"status": "no_data", "reason": "Calendar unavailable"}))
        result = self.analyze()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.output(), {"status": "no_data", "reason": "Calendar unavailable"})

    def test_missing_numeric_measurements_cannot_be_reported_clean(self):
        self.report["audits"]["tbt"]["scoreDisplayMode"] = "informative"
        self.report["audits"]["lcp"]["numericValue"] = None
        self.model({"audit_id": None, "lowest_audit_id": "lcp"})
        result = self.analyze()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.output()["status"], "no_data")
        self.assertTrue(self.output()["reason"])

    def test_lighthouse_runtime_error_supersedes_partial_measurements(self):
        self.report["runtimeError"] = {"code": "ERRORED_DOCUMENT_REQUEST", "message": "Navigation failed"}
        result = self.analyze()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.output()["status"], "no_data")


if __name__ == "__main__":
    unittest.main()
