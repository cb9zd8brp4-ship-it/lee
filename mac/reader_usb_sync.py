#!/usr/bin/env python3
"""Lee Reader USB event sync for Mac. No cloud, no root.
 Requires ADB (Android platform tools) and a paired, USB-debugging-authorized Redmi.
 Run once: python3 reader_usb_sync.py --once
 Run on Mac login: python3 reader_usb_sync.py --watch
"""
import argparse
import json
import os
import subprocess
import tempfile
import time
from datetime import datetime
from pathlib import Path

APP_ID = "com.lee.reader"
REMOTE = f"/sdcard/Android/data/{APP_ID}/files/lee-reader-sync"
BASE = Path.home() / "Documents" / "Lee_AI_Vault" / "LeeReader"
STATE = BASE / "usb_sync_state.json"
MAX_BYTES = 6 * 1024 * 1024

def cmd(*args, timeout=30, check=True):
    return subprocess.run(["adb", *args], capture_output=True, timeout=timeout, check=check)

def get_devices():
    try:
        lines = cmd("devices", timeout=8).stdout.decode("utf-8", errors="replace").splitlines()[1:]
    except (OSError, subprocess.SubprocessError):
        return []
    return [line.split()[0] for line in lines if len(line.split()) >= 2 and line.split()[1] == "device"]

def validate(data):
    if data.get("kind") != "lee-reader-export" or not isinstance(data.get("events"), list):
        raise ValueError("not a Lee Reader events export")
    if len(data["events"]) > 30000:
        raise ValueError("too many events")
    for event in data["events"]:
        if not isinstance(event, dict) or not isinstance(event.get("id"), str) or not isinstance(event.get("key"), str):
            raise ValueError("malformed event")
    return data["events"]

def read_state():
    if not STATE.exists():
        return []
    raw = STATE.read_bytes()
    if len(raw) > MAX_BYTES:
        raise ValueError("Mac state is oversized")
    return validate(json.loads(raw.decode("utf-8")))

def export_json(events):
    return {"kind": "lee-reader-export", "version": 1, "exportedAt": datetime.now().astimezone().isoformat(), "events": events}

def save_atomic(target, content):
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="wb", dir=target.parent, delete=False) as temp:
        temp.write(content)
        temp.flush()
        os.fsync(temp.fileno())
        name = temp.name
    os.replace(name, target)

def note(session, events):
    # Idempotent, managed section; never overwrite handwritten text outside markers.
    day = session.date().isoformat()
    this_day = [e for e in events if str(e.get("at", "")).startswith(day)]
    if not this_day:
        return
    sessions = [e for e in this_day if e.get("type") == "session" and isinstance(e.get("value"), dict)]
    opened = [e for e in this_day if e.get("type") == "history"]
    discussions = [e for e in this_day if e.get("type") == "discussion"]
    total = sum(max(0, int(e["value"].get("seconds") or 0)) for e in sessions)
    lines = [
        "<!-- LEE_READER_AUTO_START -->",
        "## Lee Reader 自动阅读记录",
        f"- 阅读会话：{len(sessions)} 次；合计约 {round(total / 60)} 分钟",
        f"- 文章浏览记录：{len(opened)} 条",
        f"- AI 阅读讨论：{len(discussions)} 条",
    ]
    for e in sessions:
        info = e["value"]
        title = str(info.get("title") or "未命名书籍").replace("\n", " ")[:120]
        lines.append(f"- 《{title}》：{round(int(info.get('seconds') or 0) / 60)} 分钟，{info.get('fromPercent', 0)}% → {info.get('toPercent', 0)}%")
    lines.append("<!-- LEE_READER_AUTO_END -->")
    new = "\n".join(lines)
    file = BASE / "阅读日志" / f"{day}.md"
    old = file.read_text(encoding="utf-8") if file.exists() else f"# {day} 阅读日志\n\n"
    a, b = "<!-- LEE_READER_AUTO_START -->", "<!-- LEE_READER_AUTO_END -->"
    if a in old and b in old:
        old = old[:old.index(a)] + new + old[old.index(b) + len(b):]
    else:
        old = old.rstrip() + "\n\n" + new + "\n"
    save_atomic(file, old.encode("utf-8"))

def sync_once(serial):
    adb = ["-s", serial]
    path = f"{REMOTE}/snapshot.json"
    phone = cmd(*adb, "exec-out", "cat", path, timeout=20, check=False)
    if phone.returncode != 0 or not phone.stdout.strip():
        print("Lee Reader 尚未生成 USB 快照；请在红米中启动一次新版本应用")
        return False
    if len(phone.stdout) > MAX_BYTES:
        raise ValueError("Phone snapshot oversized")
    incoming = validate(json.loads(phone.stdout.decode("utf-8")))
    local = read_state()
    merged = {e["id"]: e for e in local}
    for item in incoming:
        merged.setdefault(item["id"], item)
    ordered = sorted(merged.values(), key=lambda e: (str(e.get("at") or ""), e["id"]))
    out = json.dumps(export_json(ordered), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(out) > MAX_BYTES:
        raise ValueError("Merged log too large for USB transport")
    save_atomic(STATE, out)
    note(datetime.now().astimezone(), ordered)
    # Push only when there is new Mac-side data to merge back into the phone.
    if len(ordered) > len(incoming):
        with tempfile.TemporaryDirectory() as temp:
            f = Path(temp) / "inbox.json"
            f.write_bytes(out)
            cmd(*adb, "push", str(f), f"{REMOTE}/inbox.json", timeout=25)
    print(f"Lee Reader USB: phone {len(incoming)} events / Mac {len(ordered)} merged; state saved")
    return True

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--watch", action="store_true")
    args = parser.parse_args()
    if not args.once and not args.watch:
        parser.error("pass --once or --watch")
    last = ""
    while True:
        devices = get_devices()
        if devices:
            try:
                # Run on connection and every 30 seconds to collect ongoing reading.
                if devices[0] != last or time.time() - last_sync[0] > 30:
                    sync_once(devices[0])
                    last_sync[0] = time.time()
                last = devices[0]
            except (subprocess.SubprocessError, OSError, ValueError, json.JSONDecodeError) as e:
                print(f"USB sync cannot complete: {e}")
        else:
            last = ""
        if args.once:
            break
        time.sleep(5)

last_sync = [0.0]
if __name__ == "__main__":
    main()
