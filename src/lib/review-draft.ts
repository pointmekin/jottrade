import { TRADE_DRAFT_PREFIX } from "./trade-draft";

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
export function userDraftKeys(userId: string) {
	const prefixes = [REVIEW_DRAFT_PREFIX, TRADE_DRAFT_PREFIX].map(
		(prefix) => `${prefix}${encodeURIComponent(userId)}:`,
	);
	return Object.keys(localStorage).filter((key) =>
		prefixes.some((prefix) => key.startsWith(prefix)),
	);
}
export function clearUserDrafts(userId: string) {
	for (const key of userDraftKeys(userId)) localStorage.removeItem(key);
}
export function sameReviewFields(left: unknown, right: unknown) {
	return JSON.stringify(left) === JSON.stringify(right);
}
