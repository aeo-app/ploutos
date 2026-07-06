#!/usr/bin/env bash
set -euo pipefail

if [ ! -f /etc/systemd/system/ploutos-gate.service ]; then
  sudo tee /etc/systemd/system/ploutos-gate.service > /dev/null <<'EOF'
[Unit]
Description=Ploutos Gate API
After=network-online.target
Wants=network-online.target

[Service]
Type=exec
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/ploutos-gate
ExecStart=/home/ubuntu/ploutos-gate/start.sh
Restart=on-failure
RestartSec=5
Environment=UV_CACHE_DIR=/tmp/uv-cache

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable ploutos-gate
fi

sudo systemctl restart ploutos-gate
sudo systemctl status ploutos-gate --no-pager
