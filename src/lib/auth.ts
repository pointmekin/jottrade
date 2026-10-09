import { getRequestHeaders } from "@tanstack/react-start/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureDefaultPortfolio } from "@/db/portfolios";
import { reviewPeriods, user as userTable } from "@/db/schema";
import { sendPasswordResetEmail } from "@/lib/email";
import { deleteGcpPrefix, userObjectPrefix } from "@/lib/gcp";
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
	user: {
		deleteUser: {
			enabled: true,
			// The media goes first: when it fails, no row is deleted and a retry is safe.
			// The review links restrict the cascade from trades, and Better Auth deletes
			// without a transaction, so the reviews and the user go here in one batch.
			// Without GCP_BUCKET_NAME no upload is possible, so there is no media.
			beforeDelete: async (deleted) => {
				try {
					if (process.env.GCP_BUCKET_NAME) {
						await deleteGcpPrefix(userObjectPrefix(deleted.id));
					}
					await db.batch([
						db
							.delete(reviewPeriods)
							.where(eq(reviewPeriods.userId, deleted.id)),
						db.delete(userTable).where(eq(userTable.id, deleted.id)),
					]);
				} catch (error) {
					console.error(
						`Account deletion failed for user ${deleted.id}. No row was deleted.`,
						error,
					);
					throw error;
				}
			},
		},
	},
	hooks: {
		// Better Auth accepts a session from the last 24 hours in place of the
		// password. A user with a password must still enter it to delete the account.
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path !== "/delete-user" || ctx.body?.password) return;
			const session = await getSessionFromCtx(ctx);
			if (!session) return;
			const credential =
				await ctx.context.internalAdapter.findCredentialAccount(
					session.user.id,
				);
			if (credential?.password) {
				throw APIError.from("BAD_REQUEST", {
					message: "Invalid password",
					code: "INVALID_PASSWORD",
				});
			}
		}),
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
			"/delete-user": { window: 60, max: 5 },
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
