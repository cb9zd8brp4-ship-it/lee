#!/bin/zsh
# Install a login-time Lee Reader USB watcher on the user's Mac.
set -euo pipefail
HERE="${0:A:h}"
PYTHON="$(command -v python3 || true)"
ADB="$(command -v adb || true)"
if [[ -z "$PYTHON" || -z "$ADB" ]]; then
  echo "需先安装 python3 和 Android platform-tools (adb)，再安装 USB 同步服务。"
  exit 1
fi
DIR="$HOME/Library/LaunchAgents"
mkdir -p "$DIR" "$HOME/Library/Logs"
PLIST="$DIR/com.lee.reader-usb-sync.plist"
cat > "$PLIST" <<END
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.lee.reader-usb-sync</string>
<key>ProgramArguments</key><array>
<string>$PYTHON</string>
<string>$HERE/reader_usb_sync.py</string>
<string>--watch</string>
</array>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$ADB"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>$HOME/Library/Logs/LeeReaderUsb.log</string>
<key>StandardErrorPath</key><string>$HOME/Library/Logs/LeeReaderUsb-error.log</string>
</dict></plist>
END
plutil -lint "$PLIST"
launchctl bootout "gui/$(id -u)/com.lee.reader-usb-sync" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Lee Reader USB 自动同步服务已配置。连接并授权红米后将每30秒检查一次。"
echo "日志文件：$HOME/Library/Logs/LeeReaderUsb.log"
