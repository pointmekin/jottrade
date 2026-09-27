import { AccountEntryKind } from "@/lib/account-entry";
import { navItems } from "@/lib/nav-items";
import {
	CommandTheme,
	IntentType,
	type RegisteredCommand,
	THEME_TITLES,
} from "./types";

export const commandRegistry: RegisteredCommand[] = [
	...navItems.map((item) => ({
		id: `nav:${item.url}`,
		title: item.title,
		aliases: [
			item.title.toLowerCase(),
			`go to ${item.title.toLowerCase()}`,
			...(item.url === "/journal" ? ["trades"] : []),
		],
		intent: { type: IntentType.Navigation, path: item.url },
	})),
	{
		id: "trade",
		title: "Log trade",
		aliases: ["log trade", "new trade", "buy", "sell", "long", "short"],
		intent: { type: IntentType.Trade, params: {} },
	},
	{
		id: "deposit",
		title: "Add deposit",
		aliases: ["deposit", "add deposit"],
		intent: {
			type: IntentType.AccountEntry,
			params: { kind: AccountEntryKind.Deposit },
		},
	},
	{
		id: "withdrawal",
		title: "Add withdrawal",
		aliases: ["withdraw", "withdrawal", "add withdrawal"],
		intent: {
			type: IntentType.AccountEntry,
			params: { kind: AccountEntryKind.Withdrawal },
		},
	},
	...Object.values(CommandTheme).map((theme) => ({
		id: `theme:${theme}`,
		title: THEME_TITLES[theme],
		aliases: [theme, `${theme} mode`, `${theme} theme`],
		intent: { type: IntentType.Theme, theme },
	})),
];
