import { sql } from "drizzle-orm";
import { db } from "@/db";
import { type ReviewFields, type ReviewKind, ReviewStatus } from "@/lib/review";
import { reviewSignatureCheck, reviewSourceWrites } from "./review-write-sql";
import { readReview } from "./reviews";

export async function saveReview(
	userId: string,
	data: {
		portfolioId: number;
		kind: ReviewKind;
		start: string;
		expectedRevision: number;
		fields: ReviewFields;
		complete: boolean;
	},
) {
	const review = await readReview(userId, data);
	if (review.window.periodStart !== data.start)
		throw new Error("Select the start of this review week.");
	if (data.complete && review.currency !== review.liveCurrency)
		throw new Error(
			"The account currency differs from this saved review. Restore its original currency before completing it.",
		);
	const { window, sources } = review;
	const value = data.fields;
	const status = data.complete ? ReviewStatus.Complete : ReviewStatus.Draft;
	const statement = sql`with saved as (
 insert into review_periods(user_id,portfolio_id,kind,status,period_start,period_end_exclusive,timezone_snapshot,week_starts_on_snapshot,currency_snapshot,intent,execution,lesson,next_action,notes,commitment_reflection,previous_review_id,previous_commitment_snapshot,revision,result_snapshot,completed_at)
 select ${userId},${data.portfolioId},${data.kind},${status},${window.periodStart}::date,${window.periodEndExclusive}::date,${window.timezoneSnapshot},${review.weekStartsOn},${review.currency},${value.intent},${value.execution},${value.lesson},${value.nextAction},${value.notes},${value.commitmentReflection},${review.previousReviewId},${review.previousCommitment},1,${data.complete ? JSON.stringify(sources.results) : null}::jsonb,case when ${data.complete} then now() else null end
 where ${data.expectedRevision === 0 || Boolean(review.period)} and exists(select 1 from portfolios where id=${data.portfolioId} and user_id=${userId} and coalesce(currency,'USD')=${review.liveCurrency}) and ${reviewSignatureCheck(userId, data.portfolioId, review)}
 on conflict(portfolio_id,kind,period_start) do update set intent=excluded.intent,execution=excluded.execution,lesson=excluded.lesson,next_action=excluded.next_action,notes=excluded.notes,commitment_reflection=excluded.commitment_reflection,status=excluded.status,revision=review_periods.revision+1,updated_at=now(),result_snapshot=coalesce(excluded.result_snapshot,review_periods.result_snapshot),completed_at=excluded.completed_at
 where review_periods.user_id=${userId} and review_periods.revision=${data.expectedRevision} and review_periods.status=${ReviewStatus.Draft}
 returning id,revision
 ), ${reviewSourceWrites(review, data.complete)} select revision from saved`;
	const result = await db.batch([
		db.execute(
			sql`select id from portfolios where id=${data.portfolioId} and user_id=${userId} order by id for update`,
		),
		db.execute(
			sql`select id from trades where portfolio_id=${data.portfolioId} and user_id=${userId} order by id for update`,
		),
		db.execute(
			sql`select id from cash_flows where portfolio_id=${data.portfolioId} and user_id=${userId} order by id for update`,
		),
		db.execute<{ revision: number }>(statement),
	]);
	const saved = result[3].rows[0];
	if (!saved)
		throw new Error(
			"This review or its sources changed elsewhere. Your draft is kept. Reload to resolve.",
		);
	return { revision: saved.revision, fields: value };
}
export async function reopenReview(
	userId: string,
	portfolioId: number,
	id: number,
	expectedRevision: number,
) {
	const result = await db.batch([
		db.execute(
			sql`select id from portfolios where id=${portfolioId} and user_id=${userId} order by id for update`,
		),
		db.execute<{ revision: number }>(
			sql`update review_periods set status=${ReviewStatus.Draft},revision=revision+1,updated_at=now(),completed_at=null where id=${id} and portfolio_id=${portfolioId} and user_id=${userId} and revision=${expectedRevision} and status=${ReviewStatus.Complete} returning revision`,
		),
	]);
	if (!result[1].rows.length)
		throw new Error("This review changed elsewhere. Reload before reopening.");
	return { success: true };
}
