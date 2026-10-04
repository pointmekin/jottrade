export function sourceDiscrepancies<
	T extends { id: number; executionFingerprint: string },
>(
	current: readonly T[],
	links: readonly { includedInSnapshot: boolean; snapshot: T }[],
) {
	const frozen = new Map(
		links
			.filter((link) => link.includedInSnapshot)
			.map((link) => [link.snapshot.id, link.snapshot]),
	);
	const live = new Map(current.map((source) => [source.id, source]));
	return {
		added: current.filter((source) => !frozen.has(source.id)).length,
		changed: current.filter((source) => {
			const old = frozen.get(source.id);
			return old && old.executionFingerprint !== source.executionFingerprint;
		}).length,
		removed: [...frozen.keys()].filter((id) => !live.has(id)).length,
	};
}
