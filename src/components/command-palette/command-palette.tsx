import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CommandPreview } from "@/components/command-palette/command-preview";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import {
	commandIntentSchema,
	LOCAL_CONFIDENCE_THRESHOLD,
	MAX_COMMAND_LENGTH,
} from "@/lib/commands/intent-schema";
import { matchCommands } from "@/lib/commands/matcher";
import { commandRegistry } from "@/lib/commands/registry";
import type { CommandCandidate } from "@/lib/commands/types";
import { extractCommandIntent } from "@/server/commandIntentActions";

export function CommandPalette({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();
	const { setTheme } = useTheme();
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<CommandCandidate>();
	const [saving, setSaving] = useState(false);
	const [interpreting, setInterpreting] = useState(false);
	const [interpretationError, setInterpretationError] = useState<string>();
	const [interpreted, setInterpreted] = useState<CommandCandidate>();
	const request = useRef<AbortController | null>(null);
	const localCandidates = matchCommands(query);
	const candidates = interpreted ? [interpreted] : localCandidates;
	const canInterpret =
		query.trim().length > 0 &&
		query.trim().length <= MAX_COMMAND_LENGTH &&
		(localCandidates[0]?.confidence ?? 0) < LOCAL_CONFIDENCE_THRESHOLD;
	const cancelInterpretation = () => {
		request.current?.abort();
		request.current = null;
		setInterpreting(false);
	};
	const changeQuery = (value: string) => {
		cancelInterpretation();
		setInterpretationError(undefined);
		setInterpreted(undefined);
		setQuery(value);
	};
	useEffect(() => {
		// A dismissed palette or changed session must never receive an old interpretation.
		return () => {
			request.current?.abort();
			request.current = null;
		};
	}, [open, session?.user.id]);
	useEffect(() => {
		if (!open) {
			setQuery("");
			setSelected(undefined);
			setInterpreting(false);
			setInterpretationError(undefined);
			setInterpreted(undefined);
		}
	}, [open]);
	useEffect(() => {
		if (!session) return;
		const handleKey = (event: KeyboardEvent) => {
			if (
				event.key.toLowerCase() !== "k" ||
				!(event.metaKey || event.ctrlKey) ||
				event.altKey ||
				event.isComposing ||
				event.repeat
			)
				return;
			event.preventDefault();
			if (!saving) onOpenChange(!open);
		};
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [session, open, onOpenChange, saving]);
	if (!session) return null;
	const choose = (candidate: CommandCandidate) => {
		cancelInterpretation();
		const intent = candidate.intent;
		if (intent.type === "navigation") {
			void navigate({ to: intent.path });
			onOpenChange(false);
		} else if (intent.type === "theme") {
			setTheme(intent.theme);
			onOpenChange(false);
		} else setSelected(candidate);
	};
	const interpret = async () => {
		if (!canInterpret || request.current) return;
		const controller = new AbortController();
		request.current = controller;
		setInterpreting(true);
		setInterpretationError(undefined);
		setInterpreted(undefined);
		try {
			const result = await extractCommandIntent({
				data: { command: query },
				signal: controller.signal,
			});
			if (controller.signal.aborted) return;
			if (result.error) {
				setInterpretationError(result.error);
				return;
			}
			const parsed = commandIntentSchema.safeParse(result.intent);
			if (!parsed.success || parsed.data.type === "unknown") {
				setInterpretationError(
					"No supported command was found. Rephrase it or choose a local command.",
				);
				return;
			}
			const intent = parsed.data;
			const registered = commandRegistry.find((item) => {
				if (intent.type === "navigation")
					return (
						item.intent.type === "navigation" &&
						item.intent.path === intent.path
					);
				if (intent.type === "theme")
					return (
						item.intent.type === "theme" && item.intent.theme === intent.theme
					);
				if (intent.type === "account-entry")
					return (
						item.intent.type === "account-entry" &&
						item.intent.params.kind === intent.params.kind
					);
				return item.intent.type === "trade";
			});
			if (!registered) return;
			const candidate = {
				...registered,
				intent,
				confidence: 0,
				warning: "Interpreted by Gemini. Check every field before saving.",
			};
			if (intent.type === "trade" || intent.type === "account-entry")
				setSelected(candidate);
			else setInterpreted(candidate);
		} catch {
			if (!controller.signal.aborted)
				setInterpretationError(
					"Could not reach Gemini. Try again or use a local command.",
				);
		} finally {
			if (request.current === controller) {
				request.current = null;
				setInterpreting(false);
			}
		}
	};
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!saving) {
					cancelInterpretation();
					onOpenChange(next);
				}
			}}
		>
			<DialogContent
				className="max-h-[85dvh] overflow-y-auto p-0 sm:max-w-lg"
				showCloseButton={!saving}
			>
				<DialogTitle className="sr-only">JotTrade commands</DialogTitle>
				<DialogDescription className="sr-only">
					Navigate, change the theme, or review a trade or account entry before
					saving.
				</DialogDescription>
				{selected &&
				(selected.intent.type === "trade" ||
					selected.intent.type === "account-entry") ? (
					<CommandPreview
						intent={selected.intent}
						warning={selected.warning}
						onBack={() => setSelected(undefined)}
						onSuccess={() => onOpenChange(false)}
						onSavingChange={setSaving}
					/>
				) : (
					<Command shouldFilter={false}>
						<CommandInput
							aria-label="Search commands"
							placeholder="Search or tell JotTrade what to do"
							value={query}
							onValueChange={changeQuery}
							className="pr-8"
						/>
						<CommandList className="max-h-[min(360px,60dvh)] p-2">
							<CommandEmpty>
								No matching commands. Try “short gold” or “deposit 1000”.
							</CommandEmpty>
							{candidates.map((candidate) => (
								<CommandItem
									key={candidate.id}
									value={candidate.id}
									onSelect={() => choose(candidate)}
									className="min-h-11"
								>
									<div className="min-w-0">
										<p>{candidate.title}</p>
										{candidate.intent.type === "navigation" && (
											<p className="text-xs text-muted-foreground">
												Go to {candidate.intent.path}
											</p>
										)}
										{(candidate.intent.type === "trade" ||
											candidate.intent.type === "account-entry") && (
											<p className="text-xs text-muted-foreground">
												Review details before saving
											</p>
										)}
									</div>
								</CommandItem>
							))}
						</CommandList>
						{canInterpret && (
							<div className="space-y-2 border-t px-3 py-3">
								<p className="text-xs text-muted-foreground">
									Using Gemini sends this command text to Google. Only continue
									if you want to share it.
								</p>
								<Button
									type="button"
									variant="outline"
									disabled={interpreting}
									onClick={() => void interpret()}
									className="min-h-11"
								>
									{interpreting ? "Interpreting…" : "Interpret with Gemini"}
								</Button>
								{interpreting && (
									<p role="status" className="text-xs text-muted-foreground">
										Waiting for Gemini. You can keep using local commands.
									</p>
								)}
							</div>
						)}
						{interpretationError && (
							<p role="alert" className="px-3 pb-3 text-sm text-destructive">
								{interpretationError}
							</p>
						)}
						<p className="border-t px-3 py-2 text-xs text-muted-foreground">
							↑ ↓ to choose · Enter to continue · Esc to close
						</p>
					</Command>
				)}
			</DialogContent>
		</Dialog>
	);
}
