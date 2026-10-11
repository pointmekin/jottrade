import { sql } from "drizzle-orm";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import type { ImportCommitPlan, ImportSummary } from "@/lib/import-batch";
import { TradeStatus } from "@/lib/trade";

function commitGate(
	userId: string,
	portfolioId: number,
	batchId: string,
	revision: number,
	currency: string,
) {
	return sql`gate AS MATERIALIZED (SELECT EXISTS(SELECT 1 FROM portfolios WHERE id=${portfolioId} AND user_id=${userId} AND COALESCE(currency,${DEFAULT_CURRENCY})=${currency})
 AND EXISTS(SELECT 1 FROM import_batches WHERE id=${batchId} AND user_id=${userId} AND portfolio_id=${portfolioId} AND state='staged' AND revision=${revision} AND expires_at > NOW())
 AND NOT EXISTS(SELECT 1 FROM input p WHERE p->>'action' IN ('correct','adopt') AND NOT EXISTS(
 SELECT 1 FROM trades t WHERE p->'after'->>'kind'='trades' AND t.id=(p->>'recordId')::int AND t.user_id=${userId} AND t.portfolio_id=${portfolioId} AND t.edit_revision=(p->>'expectedRevision')::int AND t.import_hash IS NOT DISTINCT FROM p->>'expectedImportHash'
 UNION ALL SELECT 1 FROM cash_flows f WHERE p->'after'->>'kind'='adjustments' AND f.id=(p->>'recordId')::int AND f.user_id=${userId} AND f.portfolio_id=${portfolioId} AND f.edit_revision=(p->>'expectedRevision')::int AND f.import_hash IS NOT DISTINCT FROM p->>'expectedImportHash'))
 AND NOT EXISTS(SELECT 1 FROM input p JOIN import_identities a ON a.user_id=${userId} AND a.portfolio_id=${portfolioId} AND a.kind=p->'after'->>'kind' AND a.fingerprint=p->>'fingerprint' AND a.occurrence=(p->>'occurrence')::int
 WHERE p->>'action'='insert' OR (p->>'action'='reimport' AND a.state <> 'undone' AND (a.trade_id IS NOT NULL OR a.cash_flow_id IS NOT NULL))) AS ok)`;
}
function tradeWrites(userId: string, portfolioId: number) {
	return sql`inserted_trades AS (INSERT INTO trades (user_id,portfolio_id,symbol,side,status,entry_date,entry_price,quantity,exit_date,exit_price,fees,net_pnl,return_percent,broker_source,broker_ticket,broker_profit,broker_commission,broker_swap,broker_close_reason,import_hash,notes)
 SELECT ${userId},${portfolioId},r->>'symbol',r->>'side',r->>'status',(r->>'entryDate')::timestamp,(r->>'entryPrice')::numeric,(r->>'quantity')::numeric,(r->>'exitDate')::timestamp,(r->>'exitPrice')::numeric,(r->>'fees')::numeric,(r->>'netPnl')::numeric,(r->>'returnPercent')::numeric,r->>'brokerSource',r->>'brokerTicket',(r->>'brokerProfit')::numeric,(r->>'brokerCommission')::numeric,(r->>'brokerSwap')::numeric,r->>'brokerCloseReason',r->>'importHash',p->>'notes'
 FROM input p CROSS JOIN LATERAL (SELECT p->'after' AS r) data WHERE (SELECT ok FROM gate) AND p->>'action' IN ('insert','reimport') AND r->>'kind'='trades' RETURNING id,import_hash,edit_revision,net_pnl,status),
 updated_trades AS (UPDATE trades t SET symbol=r->>'symbol',side=r->>'side',status=r->>'status',entry_date=(r->>'entryDate')::timestamp,entry_price=(r->>'entryPrice')::numeric,quantity=(r->>'quantity')::numeric,exit_date=(r->>'exitDate')::timestamp,exit_price=(r->>'exitPrice')::numeric,fees=(r->>'fees')::numeric,net_pnl=(r->>'netPnl')::numeric,return_percent=(r->>'returnPercent')::numeric,broker_source=r->>'brokerSource',broker_ticket=r->>'brokerTicket',broker_profit=(r->>'brokerProfit')::numeric,broker_commission=(r->>'brokerCommission')::numeric,broker_swap=(r->>'brokerSwap')::numeric,broker_close_reason=r->>'brokerCloseReason',edit_revision=t.edit_revision+1
 FROM input p CROSS JOIN LATERAL (SELECT p->'after' AS r) data WHERE (SELECT ok FROM gate) AND p->>'action' IN ('correct','adopt') AND r->>'kind'='trades' AND t.id=(p->>'recordId')::int AND t.user_id=${userId} AND t.portfolio_id=${portfolioId} AND t.edit_revision=(p->>'expectedRevision')::int RETURNING t.id,t.edit_revision,t.net_pnl,t.status)`;
}
function adjustmentWrites(userId: string, portfolioId: number) {
	return sql`inserted_flows AS (INSERT INTO cash_flows (user_id,portfolio_id,occurred_at,amount,kind,note,broker_source,broker_adjustment,import_hash)
 SELECT ${userId},${portfolioId},(r->>'occurredAt')::timestamp,(r->>'amount')::numeric,r->>'entryKind',p->>'notes',r->>'brokerSource',NULLIF(r->'brokerAdjustment','null'::jsonb),r->>'importHash'
 FROM input p CROSS JOIN LATERAL (SELECT p->'after' AS r) data WHERE (SELECT ok FROM gate) AND p->>'action' IN ('insert','reimport') AND r->>'kind'='adjustments' RETURNING id,import_hash,edit_revision,amount),
 updated_flows AS (UPDATE cash_flows f SET occurred_at=(r->>'occurredAt')::timestamp,amount=(r->>'amount')::numeric,kind=r->>'entryKind',broker_source=r->>'brokerSource',broker_adjustment=NULLIF(r->'brokerAdjustment','null'::jsonb),edit_revision=f.edit_revision+1
 FROM input p CROSS JOIN LATERAL (SELECT p->'after' AS r) data WHERE (SELECT ok FROM gate) AND p->>'action' IN ('correct','adopt') AND r->>'kind'='adjustments' AND f.id=(p->>'recordId')::int AND f.user_id=${userId} AND f.portfolio_id=${portfolioId} AND f.edit_revision=(p->>'expectedRevision')::int RETURNING f.id,f.edit_revision,f.amount)`;
}
function identityWrites(userId: string, portfolioId: number, batchId: string) {
	return sql`resolved AS MATERIALIZED (SELECT p,COALESCE(it.id,ut.id,iflow.id,uf.id,(p->>'recordId')::int) AS record_id,COALESCE(it.edit_revision,ut.edit_revision,iflow.edit_revision,uf.edit_revision) AS revision
 FROM input p LEFT JOIN inserted_trades it ON it.import_hash=p->'after'->>'importHash' LEFT JOIN updated_trades ut ON ut.id=(p->>'recordId')::int AND p->'after'->>'kind'='trades'
 LEFT JOIN inserted_flows iflow ON iflow.import_hash=p->'after'->>'importHash' LEFT JOIN updated_flows uf ON uf.id=(p->>'recordId')::int AND p->'after'->>'kind'='adjustments'),
 superseded AS (UPDATE import_identities a SET state='superseded' FROM resolved r WHERE (SELECT ok FROM gate) AND r.p->>'action'='correct' AND a.user_id=${userId} AND a.portfolio_id=${portfolioId} AND a.kind=r.p->'after'->>'kind' AND (a.trade_id=r.record_id OR a.cash_flow_id=r.record_id) AND a.fingerprint<>r.p->>'fingerprint' RETURNING a.id),
 aliases AS (INSERT INTO import_identities (user_id,portfolio_id,kind,fingerprint,occurrence,trade_id,cash_flow_id,recorded_record_id,state,batch_id)
 SELECT ${userId},${portfolioId},p->'after'->>'kind',p->>'fingerprint',(p->>'occurrence')::int,CASE WHEN p->'after'->>'kind'='trades' THEN record_id END,CASE WHEN p->'after'->>'kind'='adjustments' THEN record_id END,record_id,'active',${batchId}
 FROM resolved WHERE (SELECT ok FROM gate) AND p->>'action' IN ('insert','reimport','adopt','correct')
 ON CONFLICT (user_id,portfolio_id,kind,fingerprint,occurrence) DO UPDATE SET trade_id=EXCLUDED.trade_id,cash_flow_id=EXCLUDED.cash_flow_id,recorded_record_id=EXCLUDED.recorded_record_id,state='active',batch_id=EXCLUDED.batch_id RETURNING id)`;
}
function appliedEffects(userId: string, portfolioId: number) {
	return sql`before_values AS MATERIALIZED (SELECT p,CASE WHEN p->'after'->>'kind'='trades' THEN CASE WHEN t.status=${TradeStatus.Closed} THEN COALESCE(t.net_pnl,0) ELSE 0 END ELSE COALESCE(f.amount,0) END AS money FROM input p LEFT JOIN trades t ON p->'after'->>'kind'='trades' AND t.id=(p->>'recordId')::int AND t.user_id=${userId} AND t.portfolio_id=${portfolioId} LEFT JOIN cash_flows f ON p->'after'->>'kind'='adjustments' AND f.id=(p->>'recordId')::int AND f.user_id=${userId} AND f.portfolio_id=${portfolioId}),
 account_before AS MATERIALIZED (SELECT COALESCE((SELECT SUM(net_pnl) FROM trades WHERE status=${TradeStatus.Closed} AND user_id=${userId} AND portfolio_id=${portfolioId}),0)+COALESCE((SELECT SUM(amount) FROM cash_flows WHERE user_id=${userId} AND portfolio_id=${portfolioId}),0) AS money)`;
}
function actualReconciliation(expectedDelta: string) {
	return sql`effects AS MATERIALIZED (SELECT id,'trades' AS kind,CASE WHEN status=${TradeStatus.Closed} THEN COALESCE(net_pnl,0) ELSE 0 END AS delta FROM inserted_trades UNION ALL SELECT u.id,'trades',(CASE WHEN u.status=${TradeStatus.Closed} THEN COALESCE(u.net_pnl,0) ELSE 0 END)-b.money FROM updated_trades u JOIN before_values b ON u.id=(b.p->>'recordId')::int AND b.p->'after'->>'kind'='trades' UNION ALL SELECT id,'adjustments',amount FROM inserted_flows UNION ALL SELECT u.id,'adjustments',u.amount-b.money FROM updated_flows u JOIN before_values b ON u.id=(b.p->>'recordId')::int AND b.p->'after'->>'kind'='adjustments'),
 actual AS MATERIALIZED (SELECT COUNT(*)::int AS count,COALESCE(SUM(delta),0) AS delta FROM effects),
 assert_effects AS MATERIALIZED (SELECT CASE WHEN (SELECT ok FROM gate) THEN 1 / CASE WHEN (SELECT count FROM actual)=(SELECT COUNT(*) FROM input p WHERE p->>'action' IN ('insert','reimport','correct','adopt')) AND (SELECT delta FROM actual)=${expectedDelta}::numeric THEN 1 ELSE 0 END ELSE 1 END AS passed)`;
}
export function importCommitSql(
	userId: string,
	portfolioId: number,
	batchId: string,
	revision: number,
	currency: string,
	plan: ImportCommitPlan[],
	summary: ImportSummary,
) {
	return sql`WITH input AS MATERIALIZED (SELECT value AS p FROM jsonb_array_elements(${JSON.stringify(plan)}::jsonb)),${commitGate(userId, portfolioId, batchId, revision, currency)},${appliedEffects(userId, portfolioId)},${tradeWrites(userId, portfolioId)},${adjustmentWrites(userId, portfolioId)},${identityWrites(userId, portfolioId, batchId)},${actualReconciliation(summary.expectedAccountDelta)}
 UPDATE import_batches SET state='applied',committed_at=NOW(),revision=revision+1,rows=(SELECT COALESCE(jsonb_agg(value - 'source'), '[]'::jsonb) FROM jsonb_array_elements(rows)),summary=${JSON.stringify(summary)}::jsonb || jsonb_build_object('accountDelta',(SELECT delta::text FROM actual),'actualMutations',(SELECT count FROM actual),'accountBefore',(SELECT money::text FROM account_before),'accountAfter',(SELECT (money+(SELECT delta FROM actual))::text FROM account_before),'reconciled',true),
 outcomes=(SELECT jsonb_agg((p-'expectedRevision'-'expectedImportHash'-'notes') || jsonb_build_object('recordId',record_id,'afterRevision',revision)) FROM resolved)
 WHERE id=${batchId} AND (SELECT ok FROM gate) AND (SELECT passed FROM assert_effects)=1 RETURNING id`;
}
