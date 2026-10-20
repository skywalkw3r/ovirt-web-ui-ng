#!/usr/bin/env bash
# promote-prod.sh — promote development to production (the asap-django flow).
#
# Environments build from git branches of the PRIVATE Bitbucket app repo:
#   development  -> the dev console (every push builds and rolls dev)
#   production   -> the prod console (built only from this promotion)
# `main` is the public GitHub default branch; it is fast-forwarded to the same
# commit so the mirror's landing page always shows the released code.
#
# This script merges origin/development into production with a --no-ff
# "chore: promote to production" commit and pushes it (origin has two push
# URLs — Bitbucket, which builds, and GitHub, which runs CI). It deliberately
# does NOT check out branches in this working copy: the merge happens in a
# temporary detached worktree, so it is safe to run while other work sits on
# this checkout. It promotes what is on origin/development, i.e. exactly what
# the dev console built.
#
# Safety check: after a trial merge, the merged tree must equal
# origin/development's tree. If it differs, a change landed on production only
# (a hotfix) and must be merged back into development before promoting.
#
# Usage: scripts/promote-prod.sh [--dry-run]     (or: make promote-prod [DRY_RUN=1])
#   --dry-run  run the checks and list the commits; change nothing

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

DRY_RUN=false
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
        *) echo "Unknown option: $arg (try --dry-run)" >&2; exit 2 ;;
    esac
done

cd "$(git rev-parse --show-toplevel)"

echo -e "${BLUE}Fetching origin...${NC}"
git fetch --quiet origin development
git fetch --quiet origin production 2>/dev/null || true   # absent before the first promotion

if git rev-parse --quiet --verify origin/production >/dev/null; then
    ahead=$(git rev-list --count origin/production..origin/development)
else
    ahead=$(git rev-list --count origin/development)
    echo -e "${YELLOW}No production branch yet — the first promotion creates it from origin/development.${NC}"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 ovirt-web-ui-ng — Promote development → production"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$ahead" -eq 0 ]; then
    echo -e "${GREEN}Nothing to promote: origin/production already contains origin/development.${NC}"
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

if git rev-parse --quiet --verify origin/production >/dev/null; then
    git worktree add --quiet --detach "$tmp" origin/production
else
    git worktree add --quiet --detach "$tmp" origin/development
fi

if ! git -C "$tmp" merge --no-ff --no-commit --quiet origin/development >/dev/null 2>&1; then
    echo -e "${RED}Merge of origin/development into production has conflicts:${NC}"
    git -C "$tmp" diff --name-only --diff-filter=U
    echo -e "${RED}Resolve by merging production back into development first, then promote.${NC}"
    exit 1
fi

merged_tree=$(git -C "$tmp" write-tree)
dev_tree=$(git rev-parse "origin/development^{tree}")

if [ "$merged_tree" != "$dev_tree" ]; then
    echo -e "${RED}production contains changes that development does not (a hotfix landed on production only):${NC}"
    git -C "$tmp" diff --cached --stat origin/development
    echo -e "${RED}Merge production back into development first, then promote.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Content check: after the merge, production == origin/development.${NC}"
echo ""

echo "Commits going to production ($ahead):"
if git rev-parse --quiet --verify origin/production >/dev/null; then
    git --no-pager log --oneline origin/production..origin/development | head -40
else
    git --no-pager log --oneline origin/development | head -40
fi
[ "$ahead" -gt 40 ] && echo "... and $((ahead - 40)) more"
echo ""

if [ "$DRY_RUN" = "true" ]; then
    echo -e "${BLUE}Dry run: nothing merged or pushed.${NC}"
    exit 0
fi


echo -ne "${YELLOW}Type 'yes' to merge and push production (and fast-forward main): ${NC}"
read -r response
[ "$response" = "yes" ] || { echo "Aborted."; exit 1; }

# Trial merge already staged in the worktree (a no-op merge when production did
# not exist yet: the detached HEAD is origin/development itself).
if git rev-parse --quiet --verify origin/production >/dev/null; then
    git -C "$tmp" commit --quiet --no-verify -m "chore: promote to production"
fi
git -C "$tmp" push origin HEAD:refs/heads/production
# Keep the public default branch on the released commit (fast-forward only).
git -C "$tmp" push origin HEAD:refs/heads/main || echo -e "${YELLOW}main could not be fast-forwarded — leave it or reconcile by hand.${NC}"

git fetch --quiet origin production main
git branch -f production origin/production 2>/dev/null || true

echo ""
echo -e "${GREEN}✓ Promoted and pushed production.${NC}"
echo "   Bitbucket webhook → prod BuildConfig builds it within seconds (once prod is live)."
echo "   Watch: make deploy-status ENV=prod   |   CI on the GitHub mirror: https://github.com/skywalkw3r/ovirt-web-ui-ng/actions"
