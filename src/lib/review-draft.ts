export const REVIEW_DRAFT_PREFIX = "jottrade.review-draft.v1:";
export type RevisionedFields<T> = { revision: number; fields: T };
export type ReviewDraft<T> = RevisionedFields<T> & { generation: number };
export function reviewDraftKey(
	userId: string,
	portfolioId: number,
	record: string,
) {
	return `${REVIEW_DRAFT_PREFIX}${encodeURIComponent(userId)}:${portfolioId}:${record}`;
}
export function clearAccountReviewDrafts(userId: string, portfolioId: number) {
	const prefix = reviewDraftKey(userId, portfolioId, "");
	for (const key of Object.keys(localStorage))
		if (key.startsWith(prefix)) localStorage.removeItem(key);
}
export function sameReviewFields(left: unknown, right: unknown) {
	return JSON.stringify(left) === JSON.stringify(right);
}
