const RESEND_URL = "https://api.resend.com/emails";
// Better Auth waits for the send only for a known email. A slow Resend must
// not make that response much slower, because the delay shows that the
// account exists.
const RESEND_TIMEOUT_MS = 5_000;

export async function sendPasswordResetEmail(
	to: string,
	url: string,
): Promise<void> {
	const apiKey = process.env.RESEND_API_KEY;
	const from = process.env.EMAIL_FROM;
	if (!apiKey || !from) {
		// The link is a credential, so only a local or test server may log it.
		if (process.env.NODE_ENV === "production") {
			const missing = apiKey ? "EMAIL_FROM" : "RESEND_API_KEY";
			throw new Error(`Password reset email not sent: ${missing} is not set.`);
		}
		console.warn(
			`Password reset link for ${to} (email not configured): ${url}`,
		);
		return;
	}

	const response = await fetch(RESEND_URL, {
		method: "POST",
		signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from,
			to: [to],
			subject: "Reset your JotTrade password",
			text: [
				"Use this link to set a new JotTrade password:",
				url,
				"The link expires in 1 hour and works one time.",
				"If you did not ask for a password reset, ignore this email.",
			].join("\n\n"),
		}),
	});
	if (!response.ok) {
		// The response body can contain the recipient address.
		throw new Error(
			`Password reset email not sent: Resend returned ${response.status}.`,
		);
	}
}
