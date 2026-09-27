#!/usr/bin/env bash
# main still has older findings, so Biome, SonarJS and React Doctor check only
# the files changed since BASE. tsc and Vitest check the whole project.
set -euo pipefail

BASE="${BASE:-origin/main}"
merge_base="$(git merge-base "$BASE" HEAD)"

changed="$(
	{
		git diff --name-only --diff-filter=ACMR "$merge_base" -- src scripts
		git ls-files --others --exclude-standard -- src scripts
	} | grep -E '\.(ts|tsx)$' | grep -vE '^src/(routeTree\.gen\.ts|components/ui/)' | sort -u || true
)"

bunx tsc --noEmit
bunx vitest run

if [ -z "$changed" ]; then
	echo "No changed source files since $BASE."
	exit 0
fi

echo "$changed" | xargs bunx biome check
echo "$changed" | xargs bunx eslint
echo "$changed" | xargs bunx react-doctor --no-telemetry --no-supply-chain --blocking warning --verbose -y
