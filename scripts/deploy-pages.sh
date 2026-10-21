#!/usr/bin/env bash
# Build the site and publish dist/ on GitHub Pages through the public repo marinelj/congdong.
# The source repo stays private: on GitHub's free plan Pages only serves public repos, so the
# public repo holds nothing but the built files.
#
#   bash scripts/deploy-pages.sh                  # build, then push dist/ to the Pages repo (main branch)
#   ALLOW_DIRTY=1 bash scripts/deploy-pages.sh    # also publish uncommitted changes
#
# The site is live at https://marinelj.github.io/congdong/ about a minute after the push.
# Needs push access to the Pages repo (e.g. `gh auth login` with git credentials set up by gh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PAGES_REPO="${PAGES_REPO:-https://github.com/marinelj/congdong.git}"
PAGES_URL="${PAGES_URL:-https://marinelj.github.io/congdong/}"
WORK="$ROOT/.cache/pages"
if [ -x "$ROOT/.tools/node/bin/node" ]; then
  export PATH="$ROOT/.tools/node/bin:$PATH"
fi

# publish only what is committed, so the live site always matches a commit
if [ "${ALLOW_DIRTY:-0}" != "1" ] && [ -n "$(git status --porcelain)" ]; then
  echo "uncommitted changes: commit them first, or run with ALLOW_DIRTY=1" >&2
  exit 1
fi
SOURCE="congdong-sports-website@$(git rev-parse --short HEAD)"

npm run build

# a fresh shallow checkout of the Pages repo (an empty repo has no branch yet)
rm -rf "$WORK"
if git ls-remote --exit-code --heads "$PAGES_REPO" main >/dev/null 2>&1; then
  git clone --quiet --depth 1 --branch main "$PAGES_REPO" "$WORK"
else
  git init --quiet -b main "$WORK"
  git -C "$WORK" remote add origin "$PAGES_REPO"
fi

# replace everything but .git with the new build
find "$WORK" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R dist/. "$WORK/"
touch "$WORK/.nojekyll"   # serve the files as they are, without Jekyll
cat > "$WORK/README.md" <<EOF
# 丛动体育官网（发布版）

线上地址：$PAGES_URL

这里只放构建好的网站文件，由私有源码仓库的 \`scripts/deploy-pages.sh\` 自动生成。
请不要直接修改这里的文件，下次发布时会被覆盖。
EOF

git -C "$WORK" add -A
if git -C "$WORK" diff --cached --quiet; then
  echo "nothing changed since the last deploy"
else
  git -C "$WORK" commit --quiet -m "Deploy $SOURCE"
  git -C "$WORK" push --quiet origin main
  echo "pushed $SOURCE"
fi
echo "live about a minute after the push: $PAGES_URL"
