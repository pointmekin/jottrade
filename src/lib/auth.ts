import { getRequestHeaders } from "@tanstack/react-start/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "@/db";
import { ensureDefaultPortfolio } from "@/db/portfolios";

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: "pg" }),
	emailAndPassword: {
		enabled: true,
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
							`Default account provisioning failed for user ${user.id}; the client will retry through ensureDefaultAccount.`,
							error,
						);
					}
				},
			},
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
