import { sql } from "drizzle-orm";

export function tradeSnapshotSql(alias = "t") {
	const t = sql.raw(alias);
	return sql`jsonb_build_object('kind','trades','symbol',${t}.symbol,'side',${t}.side,'status',${t}.status,'entryDate',to_char(${t}.entry_date,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'entryPrice',${t}.entry_price::text,'quantity',${t}.quantity::text,'exitDate',to_char(${t}.exit_date,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'exitPrice',${t}.exit_price::text,'fees',${t}.fees::text,'netPnl',${t}.net_pnl::text,'returnPercent',${t}.return_percent::text,'brokerSource',${t}.broker_source,'brokerTicket',${t}.broker_ticket,'brokerProfit',${t}.broker_profit::text,'brokerCommission',${t}.broker_commission::text,'brokerSwap',${t}.broker_swap::text,'brokerCloseReason',${t}.broker_close_reason,'importHash',${t}.import_hash)`;
}
export function flowSnapshotSql(alias = "f") {
	const f = sql.raw(alias);
	return sql`jsonb_build_object('kind','adjustments','occurredAt',to_char(${f}.occurred_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'amount',${f}.amount::text,'entryKind',${f}.kind,'brokerSource',${f}.broker_source,'brokerAdjustment',${f}.broker_adjustment,'importHash',${f}.import_hash)`;
}
export function undoClassificationSql(
	userId: string,
	portfolioId: number,
	batchId: string,
) {
	return sql`SELECT p,CASE
 WHEN p->>'undoState' IN ('undone','none') THEN 'No remaining mutation.'
 WHEN p->'after'->>'kind'='trades' AND t.id IS NULL THEN 'Record is already absent.'
 WHEN p->'after'->>'kind'='adjustments' AND f.id IS NULL THEN 'Record is already absent.'
 WHEN t.id IS NOT NULL AND t.edit_revision<>(p->>'afterRevision')::int THEN 'Trade changed after this import.'
 WHEN f.id IS NOT NULL AND f.edit_revision<>(p->>'afterRevision')::int THEN 'Account entry changed after this import.'
 WHEN t.id IS NOT NULL AND (COALESCE(jsonb_array_length(t.screenshots),0)>0 OR t.annotation_revision>0 OR t.reviewed_at IS NOT NULL OR t.reviewed_execution_fingerprint IS NOT NULL) THEN 'Trade has screenshots, annotations or review status.'
 WHEN EXISTS(SELECT 1 FROM review_source_trades rt WHERE rt.trade_id=t.id) OR EXISTS(SELECT 1 FROM review_source_cash_flows rf WHERE rf.cash_flow_id=f.id) THEN 'Record belongs to a persisted review, including drafts.'
 WHEN t.id IS NOT NULL AND ${tradeSnapshotSql()} <> p->'after' THEN 'Broker fields no longer match the import snapshot.'
 WHEN f.id IS NOT NULL AND ${flowSnapshotSql()} <> p->'after' THEN 'Broker fields no longer match the import snapshot.'
 ELSE NULL END AS reason
 FROM import_batches b CROSS JOIN LATERAL jsonb_array_elements(b.outcomes) p
 LEFT JOIN trades t ON p->'after'->>'kind'='trades' AND t.id=(p->>'recordId')::int AND t.user_id=${userId} AND t.portfolio_id=${portfolioId}
 LEFT JOIN cash_flows f ON p->'after'->>'kind'='adjustments' AND f.id=(p->>'recordId')::int AND f.user_id=${userId} AND f.portfolio_id=${portfolioId}
 WHERE b.id=${batchId} AND b.user_id=${userId} AND b.portfolio_id=${portfolioId}`;
}
function restoreTrades(userId: string, portfolioId: number) {
	return sql`deleted_trades AS (DELETE FROM trades t USING eligible e WHERE e.p->'after'->>'kind'='trades' AND e.p->>'action' IN ('insert','reimport') AND t.id=(e.p->>'recordId')::int AND t.user_id=${userId} AND t.portfolio_id=${portfolioId} AND t.edit_revision=(e.p->>'afterRevision')::int RETURNING t.id),
 restored_trades AS (UPDATE trades t SET symbol=r->>'symbol',side=r->>'side',status=r->>'status',entry_date=(r->>'entryDate')::timestamp,entry_price=(r->>'entryPrice')::numeric,quantity=(r->>'quantity')::numeric,exit_date=(r->>'exitDate')::timestamp,exit_price=(r->>'exitPrice')::numeric,fees=(r->>'fees')::numeric,net_pnl=(r->>'netPnl')::numeric,return_percent=(r->>'returnPercent')::numeric,broker_source=r->>'brokerSource',broker_ticket=r->>'brokerTicket',broker_profit=(r->>'brokerProfit')::numeric,broker_commission=(r->>'brokerCommission')::numeric,broker_swap=(r->>'brokerSwap')::numeric,broker_close_reason=r->>'brokerCloseReason',edit_revision=t.edit_revision+1
 FROM eligible e CROSS JOIN LATERAL (SELECT e.p->'before' AS r) data WHERE e.p->'after'->>'kind'='trades' AND e.p->>'action' IN ('correct','adopt') AND t.id=(e.p->>'recordId')::int AND t.user_id=${userId} AND t.portfolio_id=${portfolioId} AND t.edit_revision=(e.p->>'afterRevision')::int RETURNING t.id)`;
}
function restoreFlows(userId: string, portfolioId: number) {
	return sql`deleted_flows AS (DELETE FROM cash_flows f USING eligible e WHERE e.p->'after'->>'kind'='adjustments' AND e.p->>'action' IN ('insert','reimport') AND f.id=(e.p->>'recordId')::int AND f.user_id=${userId} AND f.portfolio_id=${portfolioId} AND f.edit_revision=(e.p->>'afterRevision')::int RETURNING f.id),
 restored_flows AS (UPDATE cash_flows f SET occurred_at=(r->>'occurredAt')::timestamp,amount=(r->>'amount')::numeric,kind=r->>'entryKind',broker_source=r->>'brokerSource',broker_adjustment=NULLIF(r->'brokerAdjustment','null'::jsonb),edit_revision=f.edit_revision+1
 FROM eligible e CROSS JOIN LATERAL (SELECT e.p->'before' AS r) data WHERE e.p->'after'->>'kind'='adjustments' AND e.p->>'action' IN ('correct','adopt') AND f.id=(e.p->>'recordId')::int AND f.user_id=${userId} AND f.portfolio_id=${portfolioId} AND f.edit_revision=(e.p->>'afterRevision')::int RETURNING f.id)`;
}
export function importUndoSql(
	userId: string,
	portfolioId: number,
	batchId: string,
	expectedRevision: number,
) {
	return sql`WITH owned_batch AS MATERIALIZED (SELECT id FROM import_batches WHERE id=${batchId} AND user_id=${userId} AND portfolio_id=${portfolioId} AND state IN ('applied','partially-undone') AND revision=${expectedRevision} FOR UPDATE), classified AS MATERIALIZED (${undoClassificationSql(userId, portfolioId, batchId)} AND EXISTS(SELECT 1 FROM owned_batch)), eligible AS MATERIALIZED (SELECT * FROM classified WHERE reason IS NULL),${restoreTrades(userId, portfolioId)},${restoreFlows(userId, portfolioId)},
 changed AS MATERIALIZED (SELECT id,'trades' AS kind FROM deleted_trades UNION ALL SELECT id,'trades' FROM restored_trades UNION ALL SELECT id,'adjustments' FROM deleted_flows UNION ALL SELECT id,'adjustments' FROM restored_flows),
 aliases AS (UPDATE import_identities a SET state=CASE WHEN e.p->>'action' IN ('insert','reimport') THEN 'undone' ELSE 'superseded' END FROM eligible e JOIN changed c ON c.id=(e.p->>'recordId')::int AND c.kind=e.p->'after'->>'kind' WHERE a.user_id=${userId} AND a.portfolio_id=${portfolioId} AND a.kind=c.kind AND a.recorded_record_id=c.id RETURNING a.id),
 outcomes AS (SELECT jsonb_agg(p || CASE WHEN p->>'undoState' IN ('none','undone') THEN '{}'::jsonb WHEN c.id IS NOT NULL OR reason='Record is already absent.' THEN jsonb_build_object('undoState','undone','undoReason',reason) ELSE jsonb_build_object('undoState','protected','undoReason',COALESCE(reason,'Record changed during undo.')) END) AS result FROM classified LEFT JOIN changed c ON c.id=(p->>'recordId')::int AND c.kind=p->'after'->>'kind')
 UPDATE import_batches b SET outcomes=outcomes.result,revision=b.revision+1,undone_at=NOW(),state=CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(outcomes.result) p WHERE p->>'undoState'='protected') THEN 'partially-undone' ELSE 'undone' END FROM outcomes WHERE b.id=${batchId} AND b.user_id=${userId} AND b.portfolio_id=${portfolioId} AND EXISTS(SELECT 1 FROM owned_batch) AND outcomes.result IS NOT NULL RETURNING b.id`;
}
