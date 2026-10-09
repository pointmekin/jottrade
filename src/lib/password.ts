// src/lib/auth.ts gives these to Better Auth, so sign-up, reset and change
// use the same rules.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function newPasswordError(
	password: string,
	confirm: string,
): string | null {
	if (password.length < PASSWORD_MIN_LENGTH) {
		return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
	}
	if (password.length > PASSWORD_MAX_LENGTH) {
		return `Use ${PASSWORD_MAX_LENGTH} characters or fewer.`;
	}
	if (password !== confirm) return "The passwords do not match.";
	return null;
}
