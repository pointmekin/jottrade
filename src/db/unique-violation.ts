const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown) {
	const codeOf = (value: unknown) =>
		typeof value === "object" && value !== null && "code" in value
			? value.code
			: undefined;
	const cause = error instanceof Error ? error.cause : undefined;
	return (
		codeOf(error) === UNIQUE_VIOLATION || codeOf(cause) === UNIQUE_VIOLATION
	);
}
