#!/usr/bin/env bash
# promote-prod.sh — promote development to main (and, via CI, to production).
#
# Environments build from git branches (docs/DEPLOY.md §Pipeline):
#   development  -> the dev console (every push builds and rolls dev)
#   main         -> the merge/release gate: CI runs the full matrix, and when it
#                   is green the `production` job fast-forwards…
#   production   -> …which the prod console builds. Never pushed by hand.
#
# This script merges origin/development into main with a --no-ff
# "chore: promote to production" commit and pushes it. It deliberately does
# NOT check out branches in this working copy: the merge happens in a
# temporary detached worktree, so it is safe to run while other work sits on
# this checkout. It promotes what is on origin/development, i.e. exactly what
# the dev console built.
#
# Safety check: after a trial merge, the merged tree must equal
# origin/development's tree. If it differs, a change landed on main only (a
# hotfix) and must be merged back into development before promoting.
#
# Usage: scripts/promote-prod.sh [--dry-run] [--pr]
#        (or: cd app && npm run promote:prod -- --dry-run)
#   --dry-run  run the checks and list the commits; change nothing
#   --pr       open a pull request development -> main with `gh` instead of
#              pushing the merge directly (for when main requires PRs)

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

DRY_RUN=false
OPEN_PR=false
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --pr) OPEN_PR=true ;;
        -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
        *) echo "Unknown option: $arg (try --dry-run / --pr)" >&2; exit 2 ;;
    esac
done

cd "$(git rev-parse --show-toplevel)"

echo -e "${BLUE}Fetching origin...${NC}"
git fetch --quiet origin development main

ahead=$(git rev-list --count origin/main..origin/development)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 ovirt-web-ui-ng — Promote development → main (→ production via CI)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$ahead" -eq 0 ]; then
    echo -e "${GREEN}Nothing to promote: origin/main already contains origin/development.${NC}"
    exit 0
fi

if [ "$(git rev-parse --quiet --verify development 2>/dev/null || true)" != "$(git rev-parse origin/development)" ]; then
    echo -e "${YELLOW}Note: your local 'development' differs from origin/development.${NC}"
    echo -e "${YELLOW}Promoting origin/development (what the dev console built). Push first if you meant to include local commits.${NC}"
    echo ""
fi

# --- Trial merge in a temporary worktree ----------------------------------
tmp=$(mktemp -d)
cleanup() { git worktree remove --force "$tmp" 2>/dev/null || true; }
trap cleanup EXIT

git worktree add --quiet --detach "$tmp" origin/main

if ! git -C "$tmp" merge --no-ff --no-commit --quiet origin/development >/dev/null 2>&1; then
    echo -e "${RED}Merge of origin/development into main has conflicts:${NC}"
    git -C "$tmp" diff --name-only --diff-filter=U
    echo -e "${RED}Resolve by merging main back into development first, then promote.${NC}"
    exit 1
fi

merged_tree=$(git -C "$tmp" write-tree)
dev_tree=$(git rev-parse "origin/development^{tree}")

if [ "$merged_tree" != "$dev_tree" ]; then
    echo -e "${RED}main contains changes that development does not (a hotfix landed on main only):${NC}"
    git -C "$tmp" diff --cached --stat origin/development
    echo -e "${RED}Merge main back into development first, then promote.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Content check: after the merge, main == origin/development.${NC}"
echo ""

echo "Commits going to main ($ahead):"
git --no-pager log --oneline origin/main..origin/development | head -40
[ "$ahead" -gt 40 ] && echo "... and $((ahead - 40)) more"
echo ""

if [ "$DRY_RUN" = "true" ]; then
    echo -e "${BLUE}Dry run: nothing merged or pushed.${NC}"
    exit 0
fi

if [ "$OPEN_PR" = "true" ]; then
    command -v gh >/dev/null 2>&1 || { echo -e "${RED}gh CLI not found; install it or run without --pr.${NC}"; exit 1; }
    gh pr create --base main --head development \
        --title "chore: promote to production" \
        --body "Promotes origin/development to main. Once CI is green, the \`production\` job fast-forwards the production branch and the prod console builds it."
    exit 0
fi

echo -ne "${YELLOW}Type 'yes' to merge and push main: ${NC}"
read -r response
[ "$response" = "yes" ] || { echo "Aborted."; exit 1; }

git -C "$tmp" commit --quiet --no-verify -m "chore: promote to production"
git -C "$tmp" push origin HEAD:refs/heads/main

# Keep the local main branch in step when it is not checked out anywhere.
git fetch --quiet origin main
git branch -f main origin/main 2>/dev/null || true

echo ""
echo -e "${GREEN}✓ Promoted and pushed main.${NC}"
echo "   CI: https://github.com/skywalkw3r/ovirt-web-ui-ng/actions — when green, branch 'production' advances"
echo "   and the prod console's build poller picks it up within ~2 minutes (once prod is live)."
