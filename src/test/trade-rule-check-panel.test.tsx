// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TradeRuleCheck } from "@/components/journal/trade-rule-check";
import {
	RiskRuleKind,
	RuleOutcome,
	type StoredRuleCheck,
} from "@/lib/risk-rule-evaluation";
import { RiskCaptureSource } from "@/lib/trade-risk-schema";

const check: StoredRuleCheck = {
	v: 1,
	version: 3,
	timezone: "America/New_York",
	dayKey: "2026-10-09",
	evaluatedAt: "2026-10-09T14:00:00.000Z",
	captureSource: RiskCaptureSource.Command,
	outcomes: [
		{
			kind: RiskRuleKind.TradeRiskAmount,
			outcome: RuleOutcome.NotSet,
			limit: null,
			actual: null,
			reason: null,
			until: null,
		},
		{
			kind: RiskRuleKind.DailyTradeCount,
			outcome: RuleOutcome.Violated,
			limit: 3,
			actual: 4,
			reason: null,
			until: null,
		},
	],
	acknowledged: true,
	note: "Clean breakout.",
	reason: null,
};

const panel = () => screen.getByRole("region", { name: "Rule check at entry" });

afterEach(cleanup);

describe("rule check at entry", () => {
	it("says why a trade has no check", () => {
		render(<TradeRuleCheck check={null} currency="USD" />);

		expect(panel().textContent).toContain("Logged before rules, or imported.");
	});

	it("shows the stored outcomes, the version and the note", () => {
		render(<TradeRuleCheck check={check} currency="USD" />);

		const text = panel().textContent;
		expect(text).toContain("Trades today: 4 of 3 · Violated");
		expect(text).not.toContain("Risk per trade");
		expect(text).toContain("Rules v3 · Fri 9 Oct, America/New_York");
		expect(text).toContain("Why did you take it?");
		expect(text).toContain("Clean breakout.");
	});

	it("shows Unknown when the rules could not be read", () => {
		render(
			<TradeRuleCheck
				check={{
					...check,
					version: null,
					timezone: null,
					dayKey: null,
					outcomes: [],
					note: null,
					reason: "Rules could not be read",
				}}
				currency="USD"
			/>,
		);

		expect(panel().textContent).toContain("Unknown: rules could not be read");
	});
});
