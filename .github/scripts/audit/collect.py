"""Collect one calendar audit into a fresh artifact directory."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
from urllib.error import URLError
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[3]
LIGHTHOUSE_VERSION = "13.6.0"
SCENARIOS = ("live", "training-finding", "training-clean", "training-no-data")


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def training(directory, scenario, source_run):
    if scenario == "training-no-data":
        raise RuntimeError("Training scenario: the calendar target is unavailable.")

    audit_id = "largest-contentful-paint"
    finding = scenario == "training-finding"
    score, duration, display = (0.41, 4250, "4.3 s") if finding else (0.98, 1200, "1.2 s")
    url = "https://training.invalid/"
    report = {
        "training": {"scenario": scenario, "source_run": source_run},
        "fetchTime": datetime.now(timezone.utc).isoformat(timespec="microseconds"),
        "lighthouseVersion": LIGHTHOUSE_VERSION,
        "requestedUrl": url,
        "finalDisplayedUrl": url,
        "finalUrl": url,
        "configSettings": {"formFactor": "mobile", "onlyCategories": ["performance"]},
        "categories": {"performance": {
            "id": "performance", "title": "Performance", "score": score,
            "auditRefs": [{"id": audit_id, "weight": 25, "group": "metrics"}],
        }},
        "audits": {audit_id: {
            "id": audit_id, "title": "Largest Contentful Paint",
            "description": "Training fixture for the largest contentful paint of the calendar homepage.",
            "scoreDisplayMode": "numeric", "score": score, "numericValue": duration,
            "numericUnit": "millisecond", "displayValue": display,
        }},
    }
    write_json(directory / "report.json", report)
    (directory / "report.html").write_text(
        '<!doctype html><html lang="en"><meta charset="utf-8"><title>Training audit</title>'
        f"<h1>Training audit of the calendar homepage</h1><p>Scenario: {scenario}</p>"
        f"<p>Largest Contentful Paint: {display}. Score: {score}.</p></html>\n",
        encoding="utf-8",
    )


def command(stage, args, timeout, **options):
    try:
        return subprocess.run(args, cwd=ROOT, check=True, timeout=timeout, **options)
    except (OSError, subprocess.SubprocessError) as error:
        raise RuntimeError(f"{stage} failed: {error}") from error


def wait_for_calendar(server, url):
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if server.poll() is not None:
            raise RuntimeError(f"Calendar server exited before readiness (code {server.returncode}).")
        try:
            with urlopen(url + "health", timeout=2) as response:
                health = json.load(response)
                if not isinstance(health, dict) or health.get("status") != "ok":
                    raise RuntimeError("Calendar /health returned an unexpected response.")
            break
        except ValueError as error:
            raise RuntimeError("Calendar /health did not return JSON.") from error
        except URLError:
            time.sleep(0.25)
    else:
        raise RuntimeError("Calendar /health did not become available within 20 seconds.")

    with urlopen(url, timeout=5) as response:
        if (response.geturl() != url or response.headers.get_content_type() != "text/html"
                or response.read() != (ROOT / "dist/index.html").read_bytes()):
            raise RuntimeError("Calendar / did not serve the freshly built homepage.")


def live(directory, scratch):
    command("Project setup", ["mise", "run", "setup"], 300)
    command("Production build", ["mise", "run", "build"], 180)
    node = command("Node lookup", ["mise", "which", "node"], 10,
                   stdout=subprocess.PIPE, text=True).stdout.strip()
    chrome = os.environ.get("CHROME_PATH") or shutil.which("google-chrome") or shutil.which("chromium")
    if not chrome:
        raise RuntimeError("Headless Chrome is unavailable.")
    with socket.socket() as port_probe:
        port_probe.bind(("127.0.0.1", 0))
        port = port_probe.getsockname()[1]
    url = f"http://127.0.0.1:{port}/"
    server = subprocess.Popen([node, "server/index.ts"], cwd=ROOT,
                              env={**os.environ, "NODE_ENV": "production", "PORT": str(port)})
    try:
        wait_for_calendar(server, url)
        dom = command("Rendered homepage check", [
            chrome, "--headless", "--disable-gpu", "--disable-dev-shm-usage",
            f"--user-data-dir={scratch / 'chrome-profile'}", "--dump-dom", url,
        ], 30, stdout=subprocess.PIPE, text=True).stdout
        if "<h1>Запись на звонок</h1>" not in dom or 'href="/book"' not in dom:
            raise RuntimeError("Calendar / did not render its booking heading and link.")
        command("Lighthouse measurement", [
            "mise", "exec", "--", "npm", "exec", "--yes", f"--package=lighthouse@{LIGHTHOUSE_VERSION}",
            "--", "lighthouse", url, "--only-categories=performance", "--form-factor=mobile",
            "--chrome-flags=--headless --disable-dev-shm-usage", "--no-enable-error-reporting",
            "--output=json", "--output=html", f"--output-path={scratch / 'calendar'}",
        ], 180, env={**os.environ, "CHROME_PATH": chrome})
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
    report_file = scratch / "calendar.report.json"
    report = json.loads(report_file.read_text())
    if (report.get("runtimeError") or report.get("finalDisplayedUrl") != url
            or report.get("configSettings", {}).get("formFactor") != "mobile"
            or report.get("categories", {}).get("performance", {}).get("score") is None):
        raise RuntimeError("Lighthouse returned no mobile performance measurement for the homepage.")
    shutil.copyfile(scratch / "calendar.report.html", directory / "report.html")
    shutil.copyfile(report_file, directory / "report.json")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("scenario", choices=SCENARIOS)
    args = parser.parse_args()
    directory = args.directory.resolve()
    directory.mkdir(parents=True, exist_ok=True)
    if any((directory / name).exists() for name in ("meta.json", "report.json", "report.html")):
        parser.error("the destination already contains an audit")
    meta = {"sha": os.environ["GITHUB_SHA"], "source_run": os.environ["GITHUB_RUN_ID"],
            "profile": "mobile-performance", "path": "/",
            "mode": "live" if args.scenario == "live" else "training", "status": "ok"}
    try:
        if args.scenario == "live":
            with tempfile.TemporaryDirectory(prefix="calendar-audit-") as scratch:
                live(directory, Path(scratch))
        else:
            training(directory, args.scenario, meta["source_run"])
    except (OSError, RuntimeError, ValueError) as error:
        meta.update(status="no_data", reason=str(error))
        print(meta["reason"], flush=True)
    # A missing report is identified by its status and provenance.
    payload = ((directory / "report.json").read_bytes() if meta["status"] == "ok"
               else json.dumps(meta, sort_keys=True).encode())
    meta["report_id"] = hashlib.sha256(payload).hexdigest()
    write_json(directory / "meta.json", meta)


if __name__ == "__main__":
    main()
