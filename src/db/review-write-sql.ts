import { sql } from "drizzle-orm";
import { TradeStatus } from "@/lib/trade";
import type { readReview } from "./reviews";

type LoadedReview = Awaited<ReturnType<typeof readReview>>;
export function reviewSignatureCheck(
	userId: string,
	portfolioId: number,
	review: LoadedReview,
) {
	const { window, sources } = review;
	const tradeDay = sql`((case when trades.status = ${TradeStatus.Closed} then coalesce(trades.exit_date,trades.entry_date) else trades.entry_date end) at time zone 'UTC' at time zone ${window.timezoneSnapshot})::date`;
	const flowDay = sql`(cash_flows.occurred_at at time zone 'UTC' at time zone ${window.timezoneSnapshot})::date`;
	return sql`coalesce((select jsonb_agg(jsonb_build_array(id,md5(to_jsonb(trades)::text)) order by id) from trades where user_id = ${userId} and portfolio_id = ${portfolioId} and ${tradeDay} >= ${window.periodStart}::date and ${tradeDay} < ${window.periodEndExclusive}::date),'[]'::jsonb) = ${JSON.stringify(sources.tradeSignatures)}::jsonb
 and coalesce((select jsonb_agg(jsonb_build_array(id,md5(to_jsonb(cash_flows)::text)) order by id) from cash_flows where user_id = ${userId} and portfolio_id = ${portfolioId} and ${flowDay} >= ${window.periodStart}::date and ${flowDay} < ${window.periodEndExclusive}::date),'[]'::jsonb) = ${JSON.stringify(sources.flowSignatures)}::jsonb`;
}
export function reviewSourceWrites(review: LoadedReview, complete: boolean) {
	const tradeRecords = review.sources.trades.map((snapshot) => ({
		id: snapshot.id,
		fingerprint: snapshot.executionFingerprint,
		snapshot,
	}));
	const flowRecords = review.sources.flows.map((snapshot) => ({
		id: snapshot.id,
		fingerprint: snapshot.executionFingerprint,
		snapshot,
	}));
	return sql`trade_links as (
 insert into review_source_trades(review_id,trade_id,execution_fingerprint,snapshot,included_in_snapshot)
 select saved.id, source.id, source.fingerprint, source.snapshot, ${complete} from saved cross join jsonb_to_recordset(${JSON.stringify(tradeRecords)}::jsonb) as source(id integer,fingerprint text,snapshot jsonb)
 on conflict(review_id,trade_id) do update set execution_fingerprint = case when ${complete} then excluded.execution_fingerprint else review_source_trades.execution_fingerprint end, snapshot = case when ${complete} then excluded.snapshot else review_source_trades.snapshot end, included_in_snapshot = case when ${complete} then true else review_source_trades.included_in_snapshot end returning trade_id
 ), flow_links as (
 insert into review_source_cash_flows(review_id,cash_flow_id,execution_fingerprint,snapshot,included_in_snapshot)
 select saved.id, source.id, source.fingerprint, source.snapshot, ${complete} from saved cross join jsonb_to_recordset(${JSON.stringify(flowRecords)}::jsonb) as source(id integer,fingerprint text,snapshot jsonb)
 on conflict(review_id,cash_flow_id) do update set execution_fingerprint = case when ${complete} then excluded.execution_fingerprint else review_source_cash_flows.execution_fingerprint end, snapshot = case when ${complete} then excluded.snapshot else review_source_cash_flows.snapshot end, included_in_snapshot = case when ${complete} then true else review_source_cash_flows.included_in_snapshot end returning cash_flow_id
 ), excluded_trades as (
 update review_source_trades set included_in_snapshot = false where ${complete} and review_id in(select id from saved) and trade_id not in(select id from jsonb_to_recordset(${JSON.stringify(tradeRecords)}::jsonb) as source(id integer)) returning trade_id
 ), excluded_flows as (
 update review_source_cash_flows set included_in_snapshot = false where ${complete} and review_id in(select id from saved) and cash_flow_id not in(select id from jsonb_to_recordset(${JSON.stringify(flowRecords)}::jsonb) as source(id integer)) returning cash_flow_id
 )`;
}
