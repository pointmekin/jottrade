import { getRequestHeaders } from "@tanstack/react-start/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "@/db";
import { ensureDefaultPortfolio } from "@/db/portfolios";
import { sendPasswordResetEmail } from "@/lib/email";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password";

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "pg" }),
	emailAndPassword: {
		enabled: true,
		minPasswordLength: PASSWORD_MIN_LENGTH,
		maxPasswordLength: PASSWORD_MAX_LENGTH,
		resetPasswordTokenExpiresIn: 60 * 60,
		revokeSessionsOnPasswordReset: true,
		// Better Auth logs a failed send and still gives the generic response,
		// so the response does not disclose whether the account exists.
		sendResetPassword: async ({ user, url }) => {
			await sendPasswordResetEmail(user.email, url);
		},
	},
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID as string,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
		},
	},
	databaseHooks: {
		user: {
			create: {
				// The user row exists already, so a failure here must not fail the
				// sign-up. `ensureDefaultAccount` provisions the account on first load.
				after: async (user) => {
					try {
						await ensureDefaultPortfolio(user.id);
					} catch (error) {
						console.error(
							`Default account provisioning failed for user ${user.id}: ${error instanceof Error ? error.message : String(error)}. The client retries through ensureDefaultAccount.`,
							error,
						);
					}
				},
			},
		},
	},
	rateLimit: {
		customRules: {
			"/request-password-reset": { window: 60, max: 3 },
		},
	},
	advanced: {
		ipAddress: {
			// The sign-in rate limit is per client address. Vercel overwrites
			// x-forwarded-for with the real client address, so a client cannot
			// pick its own key. Another host must also overwrite this header.
			ipAddressHeaders: ["x-forwarded-for"],
		},
	},
	// tanstackStartCookies must stay the last plugin.
	plugins: [tanstackStartCookies()],
});

export async function requireUserId(): Promise<string> {
	const session = await auth.api.getSession({ headers: getRequestHeaders() });
	if (!session) throw new Error("Unauthorized");
	return session.user.id;
}
