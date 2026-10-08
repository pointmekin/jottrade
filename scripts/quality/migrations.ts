export type MigrationFiles = {
	journal: { entries: { idx: number; tag: string }[] };
	sqlFiles: string[];
	snapshots: Record<string, { id: string; prevId: string }>;
};

const ROOT_ID = "00000000-0000-0000-0000-000000000000";
const FIX =
	"Take main's drizzle/meta, delete the branch migration, then run npx drizzle-kit generate --name <name>. See docs/workflows.md.";

export function checkMigrations({
	journal,
	sqlFiles,
	snapshots,
}: MigrationFiles): string[] {
	const errors: string[] = [];
	const tags = journal.entries.map((entry) => entry.tag);

	journal.entries.forEach((entry, position) => {
		const prefix = String(position).padStart(4, "0");
		if (entry.idx !== position || !entry.tag.startsWith(`${prefix}_`)) {
			errors.push(
				`journal entry ${position} (idx ${entry.idx}, ${entry.tag}): expected idx ${position} and a ${prefix}_ tag`,
			);
		}
		if (!sqlFiles.includes(`${entry.tag}.sql`)) {
			errors.push(`${entry.tag}: drizzle/${entry.tag}.sql is missing`);
		}
	});
	for (const file of sqlFiles) {
		if (!tags.includes(file.replace(/\.sql$/, ""))) {
			errors.push(`drizzle/${file} is not in drizzle/meta/_journal.json`);
		}
	}

	let prevId = ROOT_ID;
	for (const name of Object.keys(snapshots).sort()) {
		if (snapshots[name].prevId !== prevId) {
			errors.push(
				`drizzle/meta/${name}: prevId ${snapshots[name].prevId} does not follow ${prevId}`,
			);
		}
		prevId = snapshots[name].id;
	}

	return errors.map((error) => `${error}. ${FIX}`);
}
