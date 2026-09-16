const MIN_TYPO_LENGTH = 3;

/** Optimal string alignment: a transposition such as "entyr" costs 1, not 2. */
function editDistance(a: string, b: string): number {
	const rows: number[][] = [];
	for (let i = 0; i <= a.length; i++) {
		const row = new Array<number>(b.length + 1).fill(0);
		row[0] = i;
		rows.push(row);
	}
	for (let j = 0; j <= b.length; j++) rows[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let best = Math.min(
				rows[i - 1][j] + 1,
				rows[i][j - 1] + 1,
				rows[i - 1][j - 1] + cost,
			);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
				best = Math.min(best, rows[i - 2][j - 2] + 1);
			rows[i][j] = best;
		}
	}
	return rows[a.length][b.length];
}

/**
 * Rewrites a misspelled word to the vocabulary word it almost matches. The
 * first letter must agree, so an unrelated word is never rewritten.
 */
export function correctTypos(
	text: string,
	vocabulary: readonly string[],
): string {
	return text.replace(/[a-z]+/gi, (token) => {
		const word = token.toLowerCase();
		if (word.length < MIN_TYPO_LENGTH || vocabulary.includes(word))
			return token;
		const correction = vocabulary.find(
			(candidate) =>
				candidate[0] === word[0] &&
				Math.abs(candidate.length - word.length) <= 1 &&
				editDistance(word, candidate) === 1,
		);
		return correction ?? token;
	});
}
