# Developer entry points, mirroring asap-django's Makefile. The console itself is
# driven with npm inside app/ (see app/package.json); these wrap the release and
# operations scripts so the two projects feel the same.

.DEFAULT_GOAL := help
ENV ?= dev

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

.PHONY: dev
dev: ## Run the console against the in-repo mock engine (no lab needed)
	cd app && npm run dev:mock

.PHONY: check
check: ## Lint + typecheck + unit tests (what CI runs first)
	cd app && npm run lint && npm run typecheck && npm test

.PHONY: e2e
e2e: ## Playwright suite against the mock engine (includes the axe route sweep)
	cd app && npm run e2e

.PHONY: promote-prod
promote-prod: ## Merge origin/development into production (--no-ff) and push; prompts first, refuses if production carries changes development lacks. DRY_RUN=1 to only check
	./scripts/promote-prod.sh $(if $(DRY_RUN),--dry-run,)

.PHONY: deploy-status
deploy-status: ## OCP builds + webhook + rollout + ArgoCD state for ENV=dev|prod (default dev); offers oc login --web when the session is missing or expired
	@test -x deploy/tools/deploy-status.sh || { echo "deploy/ (the private deploy repo clone) is missing — see docs/DEPLOY.md"; exit 1; }
	./deploy/tools/deploy-status.sh $(ENV)
