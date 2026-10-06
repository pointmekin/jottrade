#!/usr/bin/env bash
# tsc and Vitest check the whole project. main still has older findings, so
# Biome, SonarJS and React Doctor check only the files changed since BASE.
# scripts/quality/plan.ts also selects focused checks for tooling, config,
# shared UI and route changes. See docs/quality-gate.md.
set -euo pipefail

BASE="${BASE:-origin/main}"
plan="$(mktemp -d)"
trap 'rm -rf "$plan"' EXIT

warn_runtime() {
	local expected actual
	expected="$(cat .bun-version)"
	actual="$(bun --version)"
	if [ "$expected" != "$actual" ]; then
		echo "Warning: Bun $actual is running, but .bun-version pins $expected (used by CI)." >&2
	fi
	expected="$(cat .nvmrc)"
	actual="$(node --version)"
	actual="${actual#v}"
	if [ "${actual%%.*}" != "$expected" ]; then
		echo "Warning: Node $actual is running, but .nvmrc pins Node $expected (used by CI)." >&2
	fi
}

needs() {
	grep -qx "$1" "$plan/checks"
}

# Runs a command on a NUL-separated file list, if the list is not empty.
on_files() {
	local list="$plan/$1"
	shift
	if [ -s "$list" ]; then
		xargs -0 "$@" <"$list"
	fi
}

route_tree_hash() {
	git hash-object src/routeTree.gen.ts
}

warn_runtime
bun scripts/quality/select.ts "$BASE" "$plan"

bunx tsc --noEmit
bunx vitest run

on_files biome bunx biome check --no-errors-on-unmatched
on_files sonar bunx eslint --no-warn-ignored
on_files doctor bunx react-doctor --no-telemetry --no-supply-chain --blocking warning --verbose -y
on_files shell -n 1 bash -n

if needs biome-config; then
	bunx biome check --no-errors-on-unmatched biome.json
fi
if needs eslint-project; then
	echo "SonarJS on the whole project (ESLint config or dependencies changed)."
	bunx eslint
fi
if needs lockfile; then
	echo "Lockfile matches package.json."
	bun install --frozen-lockfile --dry-run >/dev/null
fi
if needs workflows; then
	bun scripts/quality/check-workflows.ts
fi
if needs build; then
	before="$(route_tree_hash)"
	bun run build
	if [ "$before" != "$(route_tree_hash)" ]; then
		echo "The build regenerated src/routeTree.gen.ts. Commit the regenerated file." >&2
		exit 1
	fi
fi
