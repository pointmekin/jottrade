export const TradingSession = {
	Asia: "asia",
	London: "london",
	NewYork: "newYork",
	Other: "other",
} as const;

export type TradingSession =
	(typeof TradingSession)[keyof typeof TradingSession];

/** Fixed UTC windows by entry time; the end hour is not in the window. */
export const SESSION_WINDOW = {
	[TradingSession.Asia]: { name: "Asia", fromHour: 0, toHour: 8 },
	[TradingSession.London]: { name: "London", fromHour: 8, toHour: 13 },
	[TradingSession.NewYork]: { name: "New York", fromHour: 13, toHour: 21 },
	[TradingSession.Other]: { name: "Other", fromHour: 21, toHour: 24 },
} satisfies Record<
	TradingSession,
	{ name: string; fromHour: number; toHour: number }
>;

const hourText = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export function sessionLabel(session: TradingSession) {
	const { name, fromHour, toHour } = SESSION_WINDOW[session];
	return `${name} (${hourText(fromHour)}–${hourText(toHour)} UTC)`;
}

export function sessionOf(entryDate: Date): TradingSession {
	const hour = entryDate.getUTCHours();
	const match = Object.entries(SESSION_WINDOW).find(
		([, window]) => hour >= window.fromHour && hour < window.toHour,
	);
	return (match?.[0] as TradingSession | undefined) ?? TradingSession.Other;
}
