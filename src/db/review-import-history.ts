import { sql } from "drizzle-orm";
import { db } from "@/db";

export type ReviewImportChange = {
	batchId: string;
	fileName: string;
	recordId: number;
	rowNumber: number;
	action: string;
	reason: string;
};
export async function reviewImportHistory(
	userId: string,
	portfolioId: number,
	tradeIds: number[],
	flowIds: number[],
) {
	if (!tradeIds.length && !flowIds.length) return [];
	const result = await db.execute<ReviewImportChange>(sql`
select b.id as "batchId", b.file_name as "fileName", (p->>'recordId')::int as "recordId", (p->>'rowNumber')::int as "rowNumber", p->>'action' as action, p->>'reason' as reason
from import_batches b cross join lateral jsonb_array_elements(b.outcomes) p
where b.user_id=${userId} and b.portfolio_id=${portfolioId} and b.committed_at is not null
and ((p->'after'->>'kind'='trades' and (p->>'recordId')::int in (select value::int from jsonb_array_elements_text(${JSON.stringify(tradeIds)}::jsonb)))
or (p->'after'->>'kind'='adjustments' and (p->>'recordId')::int in (select value::int from jsonb_array_elements_text(${JSON.stringify(flowIds)}::jsonb))))
order by b.committed_at desc,b.id desc limit 50`);
	return result.rows;
}
