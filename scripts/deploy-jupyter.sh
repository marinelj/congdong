#!/usr/bin/env bash
# Sync, build and serve the site on a Jupyter server (or any Linux/macOS machine).
#
#   bash scripts/deploy-jupyter.sh                 # git pull, build, (re)start the server on port 8000
#   PORT=8010 BIND=0.0.0.0 bash scripts/deploy-jupyter.sh
#   bash scripts/deploy-jupyter.sh stop            # stop the server
#
# Environment: PORT (8000), BIND (127.0.0.1: reach it through jupyter-server-proxy at
# <jupyter-url>/proxy/<PORT>/), SKIP_PULL=1, SERVE=0 (build only), NODE_VERSION (v24.22.0), NODE_MIRROR.
# Needs git, curl, python3. Node.js is installed into .tools/node when missing or too old.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PORT="${PORT:-8000}"
BIND="${BIND:-127.0.0.1}"
NODE_VERSION="${NODE_VERSION:-v24.22.0}"
PIDFILE="$ROOT/.cache/site-server.pid"
LOGFILE="$ROOT/.cache/site-server.log"
mkdir -p "$ROOT/.cache/downloads" "$ROOT/.tools"

stop_server() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    kill "$(cat "$PIDFILE")"
    sleep 1
    echo "stopped server (pid $(cat "$PIDFILE"))"
  fi
  rm -f "$PIDFILE"
}

if [ "${1:-}" = "stop" ]; then
  stop_server
  exit 0
fi

# 1. sync with GitHub (refuses to overwrite local edits)
if [ "${SKIP_PULL:-0}" != "1" ] && [ -d .git ]; then
  git pull --ff-only
fi
echo "commit: $(git log -1 --format='%h %s' 2>/dev/null || echo 'not a git checkout')"

# 2. Node.js: Vite needs ^20.19 or >=22.12
node_ok() {
  command -v node >/dev/null 2>&1 && node -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    process.exit(major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19) ? 0 : 1);'
}
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
install_node() {
  local os arch name file base
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$(uname -m)" in
    x86_64|amd64) arch=x64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) echo "unsupported CPU: $(uname -m)" >&2; exit 1 ;;
  esac
  name="node-$NODE_VERSION-$os-$arch"
  file="$ROOT/.cache/downloads/$name.tar.gz"
  for base in ${NODE_MIRROR:-} https://nodejs.org/dist https://registry.npmmirror.com/-/binary/node; do
    echo "downloading Node $NODE_VERSION from $base"
    if curl -fsSL --retry 2 -o "$file" "$base/$NODE_VERSION/$name.tar.gz" \
      && curl -fsSL --retry 2 "$base/$NODE_VERSION/SHASUMS256.txt" | grep " $name.tar.gz\$" > "$file.sha256" \
      && (cd "$ROOT/.cache/downloads" && sha256 -c "$name.tar.gz.sha256"); then
      rm -rf "$ROOT/.tools/node" "$ROOT/.tools/$name"
      tar -xzf "$file" -C "$ROOT/.tools"
      mv "$ROOT/.tools/$name" "$ROOT/.tools/node"
      return 0
    fi
  done
  echo "could not download Node $NODE_VERSION" >&2
  exit 1
}
if ! node_ok; then
  if ! PATH="$ROOT/.tools/node/bin:$PATH" node_ok; then
    install_node
  fi
  export PATH="$ROOT/.tools/node/bin:$PATH"
fi
echo "node: $(node --version)"

# 3. build (npm cache stays inside the project)
export npm_config_cache="$ROOT/.cache/npm"
npm ci --no-audit --no-fund
npm run build

# 4. (re)start the static server in the background (SERVE=0: build only, e.g. when
#    jupyter-server-proxy launches scripts/serve.py on demand)
if [ "${SERVE:-1}" = "0" ]; then
  echo "built dist/ (SERVE=0, not starting a server)"
  exit 0
fi
stop_server
nohup python3 "$ROOT/scripts/serve.py" --dir dist --prod --bind "$BIND" --port "$PORT" > "$LOGFILE" 2>&1 &
echo $! > "$PIDFILE"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fs -o /dev/null "http://127.0.0.1:$PORT/"; then
    echo "serving dist/ on $BIND:$PORT (pid $(cat "$PIDFILE"), log .cache/site-server.log)"
    echo "  on this machine:          http://127.0.0.1:$PORT/"
    echo "  through Jupyter:          <your Jupyter URL>/proxy/$PORT/   (needs jupyter-server-proxy; keep the trailing slash)"
    exit 0
  fi
  sleep 1
done
echo "server did not respond; see $LOGFILE" >&2
exit 1
