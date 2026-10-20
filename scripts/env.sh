# Run from the project root:  source scripts/env.sh
# Puts the project-local Node (.tools/node) on PATH and keeps npm's cache inside the project.
if [ -x "$PWD/.tools/node/bin/node" ]; then
  export PATH="$PWD/.tools/node/bin:$PATH"
  export npm_config_cache="$PWD/.cache/npm"
else
  echo "scripts/env.sh: run this from the project root (where .tools/node lives)" >&2
fi
