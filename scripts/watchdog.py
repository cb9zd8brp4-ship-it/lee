"""Cloud-only monitor of the published feed and its update workflow."""
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request

UTC = dt.timezone.utc
FEED_URL = "https://cb9zd8brp4-ship-it.github.io/lee/feed.json"
API = "https://api.github.com"


def parse_time(value):
    try:
        result = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        return result.astimezone(UTC) if result.tzinfo else None
    except (AttributeError, ValueError):
        return None


def target_slot(now):
    """Most recent 08:17 or 17:17 Beijing slot, allowing for 25m grace."""
    now = now.astimezone(UTC)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    slots = [today + dt.timedelta(days=d, hours=h, minutes=17)
             for d in (-1, 0) for h in (0, 9)]
    return max(slot for slot in slots if slot + dt.timedelta(minutes=25) <= now)


def feed_healthy(feed, target):
    checked, generated = parse_time(feed.get("checkedAt")), parse_time(feed.get("generatedAt"))
    return bool(checked and generated and checked >= target and generated >= target and not feed.get("stale"))


def request(url, token=None, data=None):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "lee-cloud-watchdog", "Cache-Control": "no-cache"}
    if token:
        headers["Authorization"] = "Bearer " + token
        headers["X-GitHub-Api-Version"] = "2022-11-28"
    body = None if data is None else json.dumps(data).encode()
    if body is not None: headers["Content-Type"] = "application/json"
    with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=headers), timeout=30) as response:
        content = response.read()
        return json.loads(content) if content else None


def read_feed():
    return request(FEED_URL + "?watchdog=" + str(int(time.time())))


def workflow_runs(repo, token):
    url = f"{API}/repos/{repo}/actions/workflows/update.yml/runs?branch=main&per_page=30"
    return request(url, token)["workflow_runs"]


def active_run(runs, target):
    return next((r for r in runs if parse_time(r.get("created_at")) and parse_time(r["created_at"]) >= target
                 and r.get("status") not in ("completed",)), None)


def run():
    repo, token = os.environ["GITHUB_REPOSITORY"], os.environ["GH_TOKEN"]
    target = target_slot(dt.datetime.now(UTC))
    print("应完成时段 UTC:", target.isoformat(), flush=True)
    deadline, triggered = time.monotonic() + 45 * 60, False
    observed_run = None
    while time.monotonic() < deadline:
        try:
            feed = read_feed()
            print("线上 checkedAt:", feed.get("checkedAt"), "generatedAt:", feed.get("generatedAt"), "stale:", feed.get("stale"), flush=True)
            if feed_healthy(feed, target):
                print("线上内容已完成本时段更新并部署。", flush=True)
                return 0
        except (OSError, ValueError, KeyError) as exc:
            print("线上内容暂时无法读取:", exc, flush=True)
        try:
            runs = workflow_runs(repo, token)
            active = active_run(runs, target)
            if active:
                observed_run = active["id"]
                print("等待正在运行的更新:", observed_run, active.get("status"), flush=True)
            elif not triggered:
                print("本时段尚未完成，发起一次云端补跑。", flush=True)
                request(f"{API}/repos/{repo}/actions/workflows/update.yml/dispatches", token, {"ref": "main"})
                triggered = True
                observed_run = None
                time.sleep(20)  # Allow GitHub to register the dispatched run.
                continue
            elif observed_run:
                completed = next((r for r in runs if r["id"] == observed_run), None)
                if completed and completed.get("status") == "completed" and completed.get("conclusion") != "success":
                    print("补跑失败:", completed.get("conclusion"), completed.get("html_url"), flush=True)
                    return 1
                # A successful run can take time to become visible on Pages.
                print("等待部署后的线上内容可见。", flush=True)
        except (OSError, ValueError, KeyError) as exc:
            print("GitHub 检查或触发失败:", exc, flush=True)
        time.sleep(30)
    print("本轮更新失败或未能验证部署；网站应继续显示最近一次成功版本。", flush=True)
    return 1


if __name__ == "__main__":
    sys.exit(run())
