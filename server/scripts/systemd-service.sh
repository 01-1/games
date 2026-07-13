#!/usr/bin/env bash
set -euo pipefail

action="${1:-install}"
service_name="${SERVICE_NAME:-alignment-arcade}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
workspace_dir="$(cd -- "$script_dir/../.." && pwd)"
if [[ -v SERVICE_USER ]]; then
  service_user="$SERVICE_USER"
  service_user_explicit=1
elif [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != root ]]; then
  service_user="$SUDO_USER"
  service_user_explicit=0
else
  service_user="$(id -un)"
  service_user_explicit=0
fi
npm_bin="${NPM_BIN:-$(command -v npm || true)}"
node_bin="${NODE_BIN:-$(command -v node || true)}"
unit_dir="${SYSTEMD_UNIT_DIR:-/etc/systemd/system}"
unit_path="$unit_dir/$service_name.service"
temporary_dir=""
temporary_unit=""

fail() {
  echo "error: $*" >&2
  exit 1
}

run_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

cleanup() {
  if [[ -n "${temporary_unit:-}" ]]; then
    rm -f -- "$temporary_unit"
    temporary_unit=""
  fi
  if [[ -n "${temporary_dir:-}" ]]; then
    rmdir -- "$temporary_dir" 2>/dev/null || true
    temporary_dir=""
  fi
}

validate_settings() {
  [[ "$service_name" =~ ^[A-Za-z0-9_.@-]+$ ]] || fail "invalid SERVICE_NAME: $service_name"
  [[ "$service_user" =~ ^[A-Za-z_][A-Za-z0-9_.-]*\$?$ ]] || fail "invalid SERVICE_USER: $service_user"
  id "$service_user" >/dev/null 2>&1 || fail "SERVICE_USER does not exist: $service_user"
  if [[ "$service_user_explicit" -eq 0 && "$(id -u "$service_user")" -eq 0 ]]; then
    fail "SERVICE_USER resolved to root implicitly; set SERVICE_USER explicitly to choose root"
  fi
  [[ "$workspace_dir" == /* ]] || fail "workspace path must be absolute: $workspace_dir"
  [[ ! "$workspace_dir" =~ [[:space:]\"\\] ]] || fail "workspace path cannot contain whitespace, quotes, or backslashes: $workspace_dir"
  [[ -n "$npm_bin" && -x "$npm_bin" ]] || fail "npm was not found; set NPM_BIN to its absolute path"
  [[ -n "$node_bin" && -x "$node_bin" ]] || fail "node was not found; set NODE_BIN to its absolute path"
  [[ "$npm_bin" == /* && ! "$npm_bin" =~ [[:space:]\"\\] ]] || fail "NPM_BIN must be an absolute path without whitespace, quotes, or backslashes"
  [[ "$node_bin" == /* && ! "$node_bin" =~ [[:space:]\"\\] ]] || fail "NODE_BIN must be an absolute path without whitespace, quotes, or backslashes"
}

escape_unit_value() {
  printf '%s' "$1" | sed -e 's/%/%%/g' -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

render_unit() {
  validate_settings
  local npm_dir node_dir service_path start_script escaped_workspace escaped_node escaped_script escaped_path
  npm_dir="$(dirname -- "$npm_bin")"
  node_dir="$(dirname -- "$node_bin")"
  service_path="$npm_dir:$node_dir:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
  start_script="$workspace_dir/server/scripts/start.mjs"
  escaped_workspace="$(escape_unit_value "$workspace_dir")"
  escaped_node="$(escape_unit_value "$node_bin")"
  escaped_script="$(escape_unit_value "$start_script")"
  escaped_path="$(escape_unit_value "$service_path")"

  cat <<EOF
[Unit]
Description=Alignment Arcade game servers
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=$service_user
WorkingDirectory=$escaped_workspace
Environment=NODE_ENV=production
Environment=PATH=$escaped_path
ExecStart=$escaped_node $escaped_script
Restart=on-failure
RestartSec=5
TimeoutStopSec=15
KillMode=control-group

[Install]
WantedBy=multi-user.target
EOF
}

install_service() {
  temporary_dir="$(mktemp -d)"
  temporary_unit="$temporary_dir/$service_name.service"
  trap cleanup EXIT
  render_unit >"$temporary_unit"

  if command -v systemd-analyze >/dev/null 2>&1; then
    systemd-analyze verify "$temporary_unit"
  fi

  run_root install -d -m 0755 "$unit_dir"
  run_root install -m 0644 "$temporary_unit" "$unit_path"
  run_root systemctl daemon-reload
  if ! run_root systemctl enable --now "$service_name.service"; then
    run_root systemctl --no-pager --full status "$service_name.service" || true
    run_root journalctl --no-pager -u "$service_name.service" -n 50 || true
    fail "failed to start $service_name.service"
  fi
  run_root systemctl --no-pager --full status "$service_name.service"
  cleanup
  trap - EXIT
}

uninstall_service() {
  run_root systemctl disable --now "$service_name.service" 2>/dev/null || true
  run_root rm -f -- "$unit_path"
  run_root systemctl daemon-reload
  echo "Removed $unit_path"
}

case "$action" in
  install)
    install_service
    ;;
  uninstall)
    uninstall_service
    ;;
  status)
    run_root systemctl --no-pager --full status "$service_name.service"
    ;;
  render)
    render_unit
    ;;
  *)
    fail "usage: $0 [install|uninstall|status|render]"
    ;;
esac
