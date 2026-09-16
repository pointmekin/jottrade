import { AccountEntryKind } from "@/lib/account-entry";
import { navItems } from "@/lib/nav-items";
import type { RegisteredCommand } from "./types";

export const commandRegistry: RegisteredCommand[] = [
	...navItems.map((item) => ({
		id: `nav:${item.url}`,
		title: item.title,
		aliases: [
			item.title.toLowerCase(),
			`go to ${item.title.toLowerCase()}`,
			...(item.url === "/journal" ? ["trades"] : []),
		],
		intent: { type: "navigation" as const, path: item.url },
	})),
	{
		id: "trade",
		title: "Log trade",
		aliases: ["log trade", "new trade", "buy", "sell", "long", "short"],
		intent: { type: "trade", params: {} },
	},
	{
		id: "deposit",
		title: "Add deposit",
		aliases: ["deposit", "add deposit"],
		intent: {
			type: "account-entry",
			params: { kind: AccountEntryKind.Deposit },
		},
	},
	{
		id: "withdrawal",
		title: "Add withdrawal",
		aliases: ["withdraw", "withdrawal", "add withdrawal"],
		intent: {
			type: "account-entry",
			params: { kind: AccountEntryKind.Withdrawal },
		},
	},
	...(["dark", "light", "system"] as const).map((theme) => ({
		id: `theme:${theme}`,
		title:
			theme === "system"
				? "System theme"
				: `${theme === "dark" ? "Dark" : "Light"} mode`,
		aliases: [theme, `${theme} mode`, `${theme} theme`],
		intent: { type: "theme" as const, theme },
	})),
];
