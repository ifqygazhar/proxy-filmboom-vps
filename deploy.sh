#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-filmboom-vps-proxy}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"

DEFAULT_HOST="${HOST:-0.0.0.0}"
DEFAULT_PORT="${PORT:-8787}"
DEFAULT_ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://film.meongplod.my.id,http://localhost:5173,http://localhost:4173}"
DEFAULT_PROXY_SHARED_SECRET="${PROXY_SHARED_SECRET:-}"
DEFAULT_FETCH_TIMEOUT_MS="${FETCH_TIMEOUT_MS:-15000}"

cd "$APP_DIR"

ensure_bun() {
	if command -v bun >/dev/null 2>&1; then
		return
	fi

	echo "Bun tidak ditemukan. Menginstall Bun..."
	curl -fsSL https://bun.sh/install | bash

	export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
	export PATH="$BUN_INSTALL/bin:$PATH"

	if ! command -v bun >/dev/null 2>&1; then
		echo "Bun masih tidak ditemukan setelah install. Cek PATH VPS kamu." >&2
		exit 1
	fi
}

resolve_bun_bin() {
	if command -v bun >/dev/null 2>&1; then
		BUN_BIN="$(command -v bun)"
	elif [[ -x "$HOME/.bun/bin/bun" ]]; then
		BUN_BIN="$HOME/.bun/bin/bun"
		export PATH="$HOME/.bun/bin:$PATH"
	else
		echo "Bun tidak ditemukan di PATH atau $HOME/.bun/bin/bun." >&2
		exit 1
	fi

	export BUN_BIN
}

ensure_pm2() {
	if command -v pm2 >/dev/null 2>&1; then
		return
	fi

	echo "PM2 tidak ditemukan. Menginstall PM2..."

	if command -v npm >/dev/null 2>&1; then
		npm install -g pm2
	else
		bun add -g pm2
		export PATH="$HOME/.bun/bin:$PATH"
	fi

	if ! command -v pm2 >/dev/null 2>&1; then
		echo "PM2 masih tidak ditemukan setelah install. Cek PATH VPS kamu." >&2
		exit 1
	fi
}

create_env_if_missing() {
	if [[ -f "$ENV_FILE" ]]; then
		echo "Memakai env existing: $ENV_FILE"
		return
	fi

	echo "Membuat env baru: $ENV_FILE"
cat >"$ENV_FILE" <<EOF
HOST=$DEFAULT_HOST
PORT=$DEFAULT_PORT
ALLOWED_ORIGINS=$DEFAULT_ALLOWED_ORIGINS
PROXY_SHARED_SECRET=$DEFAULT_PROXY_SHARED_SECRET
FETCH_TIMEOUT_MS=$DEFAULT_FETCH_TIMEOUT_MS
BUN_BIN=$BUN_BIN
EOF
}

set_env_value() {
	local key="$1"
	local value="$2"

	if grep -q "^${key}=" "$ENV_FILE"; then
		sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
	else
		printf '\n%s=%s\n' "$key" "$value" >>"$ENV_FILE"
	fi
}

load_env() {
	set -a
	# shellcheck disable=SC1090
	source "$ENV_FILE"
	set +a

	export APP_NAME
}

ensure_bun
resolve_bun_bin
ensure_pm2
create_env_if_missing
load_env
resolve_bun_bin
set_env_value "BUN_BIN" "$BUN_BIN"

echo "Menginstall dependency Bun..."
bun install --production

echo "Start/reload PM2 app: $APP_NAME"
BUN_BIN="$BUN_BIN" pm2 start "$APP_DIR/ecosystem.config.cjs" --update-env
pm2 save

echo
echo "Deploy selesai."
echo "Health check lokal:"
echo "  curl http://127.0.0.1:${PORT:-8787}/health"
echo
echo "Untuk auto-start setelah reboot, jalankan sekali di VPS:"
echo "  pm2 startup"
echo "  pm2 save"
