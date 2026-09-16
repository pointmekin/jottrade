import { parseAccountEntry } from "./parsers/account-entry";
import { parseTrade } from "./parsers/trade";
import { commandRegistry } from "./registry";
import type { CommandCandidate } from "./types";

function score(query: string, alias: string): number {
	if (query === alias) return 1;
	if (alias.startsWith(query))
		return 0.65 + (0.2 * query.length) / alias.length;
	if (alias.includes(query)) return 0.6;
	let index = 0;
	for (const char of alias) if (char === query[index]) index++;
	return index === query.length ? (0.4 * query.length) / alias.length : 0;
}
export function matchCommands(input: string): CommandCandidate[] {
	const query = input.trim().toLowerCase().replace(/\s+/g, " ");
	if (!query)
		return commandRegistry.map(({ aliases: _, ...command }) => ({
			...command,
			confidence: 0,
		}));
	const parsed = parseTrade(query) ?? parseAccountEntry(query);
	const matches: CommandCandidate[] = commandRegistry
		.map(({ aliases, ...command }) => ({
			...command,
			confidence: Math.max(...aliases.map((alias) => score(query, alias))),
		}))
		.filter((command) => command.confidence > 0 && command.id !== parsed?.id);
	if (parsed) matches.push(parsed);
	return matches.sort((a, b) => b.confidence - a.confidence);
}
