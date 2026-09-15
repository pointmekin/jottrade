import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resolveFxRate } from "@/server/fx";

const currencyCode = z
	.string()
	.trim()
	.toUpperCase()
	.regex(/^[A-Z]{3}$/);
const currentRateSchema = z.object({
	fromCurrency: currencyCode,
	toCurrency: currencyCode,
});

export const getCurrentFxRate = createServerFn({ method: "POST" })
	.validator(currentRateSchema)
	.handler(async ({ data }) => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() });
		if (!session) throw new Error("Unauthorized");

		try {
			const result = await resolveFxRate({
				...data,
				at: new Date(),
				mode: "CURRENT",
			});
			return { ...result, asOf: result.asOf.toISOString() };
		} catch {
			throw new Error(
				`Unable to retrieve the ${data.fromCurrency} → ${data.toCurrency} conversion rate required to calculate this position.`,
			);
		}
	});
