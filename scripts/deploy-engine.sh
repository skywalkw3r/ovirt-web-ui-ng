#!/usr/bin/env bash
#
# deploy-engine.sh -- push a local build of the next-gen portal to a live oVirt
# engine over SSH. Nothing needs to be installed ON the engine (no git, no Node,
# no build toolchain): the app is pure static assets, so we build here and rsync
# the result into the webroot the engine's Apache already serves.
#
# This mirrors what packaging/ovirt-web-ui-ng.spec's %install does (see
# docs/DEPLOY.md), just over ssh/rsync instead of an RPM:
#   * app/dist/  ->  /usr/share/ovirt-engine/ovirt-web-ui-ng/   (the Apache Alias)
#   * served same-origin at  https://<engine>/ovirt-engine/web-ui-ng/
#
# config.js (window.ovirtWebUiConfig -- your Grafana embed config) is deploy-time
# state edited ON the engine, so routine deploys PRESERVE it (rsync --exclude).
# Pass --with-config to overwrite it from your local app/dist/config.js.
#
# The Apache drop-in rarely changes, so it is left alone unless you pass
# --with-conf (which also reloads httpd). Asset-only bumps need no httpd reload:
# index.html is served no-cache and content-hashed assets are immutable.
#
# Source control (gitea) and deployment are separate concerns: keep pushing the
# source to gitea for history; this script ships the built assets to the engine.

set -euo pipefail

usage() {
  cat <<'EOF'
Deploy the next-gen oVirt portal to a live engine (build local, rsync static).

Usage: scripts/deploy-engine.sh [options]

Options:
  --host <user@host>  SSH target for the engine
                      (default: $ENGINE_SSH or root@engine.lab.homelabz.xyz)
  --skip-build        deploy the existing app/dist/ as-is (skip npm build)
  --with-config       also push config.js (overwrites the engine's live copy)
  --with-conf         install packaging/ovirt-web-ui-ng.conf as
                      zz-ovirt-web-ui-ng.conf and reload httpd
  --dry-run           show what would transfer / run; change nothing
  -h, --help          this help

Env overrides: ENGINE_SSH, WEBROOT, VITE_BASE (only to relocate the sub-path).
EOF
}

# --- args ------------------------------------------------------------------
ENGINE_SSH="${ENGINE_SSH:-root@engine.lab.homelabz.xyz}"
DO_BUILD=1
WITH_CONFIG=0
WITH_CONF=0
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --host)        ENGINE_SSH="$2"; shift 2 ;;
    --skip-build)  DO_BUILD=0; shift ;;
    --with-config) WITH_CONFIG=1; shift ;;
    --with-conf)   WITH_CONF=1; shift ;;
    --dry-run)     DRY_RUN=1; shift ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

# --- derived paths (repo-relative, so it runs from anywhere) ---------------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$REPO_ROOT/app"
DIST_DIR="$APP_DIR/dist"
CONF_SRC="$REPO_ROOT/packaging/ovirt-web-ui-ng.conf"

WEBROOT="${WEBROOT:-/usr/share/ovirt-engine/ovirt-web-ui-ng}"
CONF_DEST="/etc/httpd/conf.d/zz-ovirt-web-ui-ng.conf"   # zz- so it loads AFTER
                                                        # the engine's proxy conf
BASE_PATH="${VITE_BASE:-/ovirt-engine/web-ui-ng/}"
APP_URL="https://${ENGINE_SSH##*@}${BASE_PATH}"

say() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }

# --- preflight -------------------------------------------------------------
command -v rsync >/dev/null || { echo "rsync is required locally." >&2; exit 1; }

say "Checking SSH + rsync on $ENGINE_SSH"
ssh -o ConnectTimeout=8 "$ENGINE_SSH" \
  'command -v rsync >/dev/null || { echo "ERROR: rsync missing on the engine (dnf install rsync)"; exit 3; }; echo "  engine reachable: $(hostname)"'

# --- build -----------------------------------------------------------------
if [ "$DO_BUILD" = 1 ]; then
  say "Building app  (base=$BASE_PATH)"
  (
    cd "$APP_DIR"
    [ -d node_modules ] || npm ci
    npm run build   # tsc -b && vite build -> app/dist/ ; fails loudly on type errors
  )
else
  say "Skipping build (--skip-build)"
fi

[ -f "$DIST_DIR/index.html" ] || {
  echo "No build found at $DIST_DIR (index.html missing)." >&2
  echo "Run without --skip-build, or 'cd app && npm run build' first." >&2
  exit 1
}

# --- sync ------------------------------------------------------------------
say "Ensuring webroot $WEBROOT"
[ "$DRY_RUN" = 1 ] || ssh "$ENGINE_SSH" "mkdir -p '$WEBROOT'"

# -a archive, -z compress, --delete prunes old content-hashed assets.
# config.js is excluded by default so a routine deploy never clobbers the
# engine's live Grafana config (the exclude also shields it from --delete).
rsync_flags=(-az --delete --stats)
[ "$WITH_CONFIG" = 1 ] || rsync_flags+=(--exclude 'config.js')
[ "$DRY_RUN" = 1 ] && rsync_flags+=(--dry-run --itemize-changes)

say "Syncing dist/ -> $ENGINE_SSH:$WEBROOT/"
rsync "${rsync_flags[@]}" "$DIST_DIR/" "$ENGINE_SSH:$WEBROOT/"

# index.html loads config.js; on a first-ever deploy the engine has none, so
# seed it from the build (otherwise the page 404s on config.js). No-op once a
# curated config.js exists on the engine.
if [ "$WITH_CONFIG" != 1 ] && [ "$DRY_RUN" != 1 ]; then
  if ! ssh "$ENGINE_SSH" "test -f '$WEBROOT/config.js'"; then
    say "No config.js on engine yet -- seeding the default from the build"
    rsync -az "$DIST_DIR/config.js" "$ENGINE_SSH:$WEBROOT/config.js"
  fi
fi

# httpd serves from /usr/share/ovirt-engine/*; make sure freshly-written files
# carry an httpd-readable SELinux label (best-effort; no-op if SELinux is off).
say "Restoring SELinux context (best-effort)"
[ "$DRY_RUN" = 1 ] || ssh "$ENGINE_SSH" "command -v restorecon >/dev/null && restorecon -RF '$WEBROOT' || true"

# --- optional: Apache drop-in ----------------------------------------------
if [ "$WITH_CONF" = 1 ]; then
  say "Installing Apache drop-in -> $CONF_DEST and reloading httpd"
  if [ "$DRY_RUN" != 1 ]; then
    scp "$CONF_SRC" "$ENGINE_SSH:$CONF_DEST"
    # configtest first so a bad conf never takes httpd down on reload.
    ssh "$ENGINE_SSH" "apachectl configtest && systemctl reload httpd"
  else
    printf '   [dry-run] scp %s -> %s\n   [dry-run] apachectl configtest && systemctl reload httpd\n' "$CONF_SRC" "$CONF_DEST"
  fi
fi

# --- verify ----------------------------------------------------------------
if [ "$DRY_RUN" != 1 ]; then
  say "Verifying $APP_URL"
  code=$(curl -sk -o /dev/null -w '%{http_code}' "$APP_URL" || echo 000)
  echo "  HTTP $code"
  if [ "$code" != 200 ]; then
    echo "  Non-200. If this is the first deploy, the Apache Alias may be missing:" >&2
    echo "  re-run with --with-conf to install zz-ovirt-web-ui-ng.conf and reload httpd." >&2
  fi
fi

say "Done -> $APP_URL"
