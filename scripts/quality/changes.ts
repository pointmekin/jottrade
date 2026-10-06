import { execFileSync } from "node:child_process";

export const ChangeStatus = {
	Added: "added",
	Modified: "modified",
	Deleted: "deleted",
	Untracked: "untracked",
} as const;

export type ChangeStatus = (typeof ChangeStatus)[keyof typeof ChangeStatus];

export type Change = {
	status: ChangeStatus;
	path: string;
};

const gitStatus: Record<string, ChangeStatus> = {
	A: ChangeStatus.Added,
	D: ChangeStatus.Deleted,
};

function git(cwd: string, args: string[]): string {
	// eslint-disable-next-line sonarjs/no-os-command-from-path -- developer tooling: git comes from the developer's own PATH, like in quality.sh.
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		stdio: ["ignore", "pipe", "pipe"],
	});
}

// Parses `git diff --name-status -z --no-renames`: "M\0path\0D\0path\0".
export function parseNameStatus(output: string): Change[] {
	const fields = output.split("\0");
	const changes: Change[] = [];
	for (let index = 0; index + 1 < fields.length; index += 2) {
		const code = fields[index].charAt(0);
		const path = fields[index + 1];
		if (code && path) {
			changes.push({ status: gitStatus[code] ?? ChangeStatus.Modified, path });
		}
	}
	return changes;
}

export function parseUntracked(output: string): Change[] {
	return output
		.split("\0")
		.filter(Boolean)
		.map((path) => ({ status: ChangeStatus.Untracked, path }));
}

export function findMergeBase(base: string, cwd: string): string {
	try {
		return git(cwd, ["merge-base", base, "HEAD"]).trim();
	} catch {
		throw new Error(
			`Cannot find a merge base between ${base} and HEAD. Fetch ${base} with full history, or set BASE to an existing ref.`,
		);
	}
}

// Compares the working tree (committed, staged and unstaged changes) with the
// merge base. Renames are reported as a deletion and an addition, so the old
// path still counts for tooling triggers.
export function listChanges(base: string, cwd: string): Change[] {
	const mergeBase = findMergeBase(base, cwd);
	const tracked = parseNameStatus(
		git(cwd, [
			"diff",
			"--name-status",
			"-z",
			"--no-renames",
			"--no-ext-diff",
			"--ignore-submodules",
			mergeBase,
			"--",
		]),
	);
	const untracked = parseUntracked(
		git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
	);
	return [...tracked, ...untracked];
}
