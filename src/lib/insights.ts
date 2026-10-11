import { roundCents } from "./currency";
import type { GroupSummary } from "./group-summary";

export const INSIGHT_FOOTER =
	"Association in your journal. Not a cause and not a prediction.";

/** A convention, not a statistical test: below it, a difference is too noisy to show as a finding. */
export const FINDING_MIN_TRADES = 20;

export type TagFinding = {
	key: string;
	name: string;
	count: number;
	avgPnl: number;
	/** Null when the tag has fewer than FINDING_MIN_TRADES closed trades. */
	difference: number | null;
};

/** The comparison is the whole scope (owner decision Q4), so a tag on every trade shows no difference. */
export function tagFindings(
	byTag: (GroupSummary & { key: string; name: string })[],
	scope: GroupSummary,
): TagFinding[] {
	return byTag.map(({ key, name, count, avgPnl }) => ({
		key,
		name,
		count,
		avgPnl,
		difference:
			count >= FINDING_MIN_TRADES ? roundCents(avgPnl - scope.avgPnl) : null,
	}));
}
