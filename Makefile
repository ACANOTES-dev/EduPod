SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help setup dev build lint type-check test test-affected test-integration test-visual validate migrate post-migrate seed seed-demo seed-demo-reset doctor audit-rls

help: ## Show the common local developer commands
	@grep -E '^[a-zA-Z0-9_-]+:.*## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "%-18s %s\n", $$1, $$2}'

setup: ## Install dependencies and generate the Prisma client
	pnpm install --frozen-lockfile
	pnpm --filter @school/prisma exec prisma generate

dev: ## Start the local app processes
	pnpm dev

build: ## Run the monorepo build
	pnpm build

lint: ## Run lint across the monorepo
	pnpm lint

type-check: ## Run type-check across the monorepo
	pnpm type-check

test: ## Run the unit test suite
	pnpm test

test-affected: ## Run tests for packages changed since HEAD~1
	pnpm test:affected

test-integration: ## Run the API integration suite
	pnpm test:integration

test-visual: ## Run the web visual smoke suite
	pnpm test:visual

validate: ## Run the local validation command used by CI
	pnpm validate

migrate: ## Run Prisma migrations against the direct database URL
	pnpm db:migrate

post-migrate: ## Re-apply post-migration SQL such as RLS policies
	pnpm db:post-migrate

seed: ## Seed the base development dataset
	pnpm db:seed

seed-demo: ## Re-run the demo seed without resetting the database
	pnpm seed:demo

seed-demo-reset: ## Rebuild the demo seed from a clean database
	pnpm seed:demo:reset

doctor: ## Check local env, services, and generated artifacts
	pnpm run doctor

audit-rls: ## Print a quick RLS catalogue summary
	pnpm audit:rls
