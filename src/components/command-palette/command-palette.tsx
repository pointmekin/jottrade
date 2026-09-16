import { useNavigate } from "@tanstack/react-router";
import { MicIcon, SquareIcon } from "lucide-react";
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
import { useSpeechInput } from "@/hooks/use-speech-input";
import { authClient } from "@/lib/auth-client";
import { toCommandCandidate } from "@/lib/commands/intent-schema";
import { matchCommands } from "@/lib/commands/matcher";
import type { CommandCandidate } from "@/lib/commands/types";
import { extractCommandIntent } from "@/server/commandIntentActions";

/** Below this, a local match is a guess, so offer the Gemini fallback. */
const LOCAL_CONFIDENCE_THRESHOLD = 0.9;

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
	const [interpretError, setInterpretError] = useState<string>();
	const request = useRef(0);
	const candidates = matchCommands(query);
	const command = query.trim();
	const offerFallback =
		command.length > 0 &&
		(candidates[0]?.confidence ?? 0) < LOCAL_CONFIDENCE_THRESHOLD;
	// Discard an in-flight interpretation once the command text moves on.
	const changeQuery = (next: string) => {
		request.current++;
		setInterpreting(false);
		setInterpretError(undefined);
		setQuery(next);
	};
	const speech = useSpeechInput(changeQuery);
	const stopSpeech = speech.stop;
	const typeQuery = (next: string) => {
		speech.clearError();
		changeQuery(next);
	};
	useEffect(() => {
		if (!open) {
			setQuery("");
			setSelected(undefined);
		}
	}, [open]);
	// Never keep the microphone open behind a closed palette or a preview.
	useEffect(() => {
		if (!open || selected) stopSpeech();
	}, [open, selected, stopSpeech]);
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
		const id = ++request.current;
		setInterpreting(true);
		setInterpretError(undefined);
		try {
			const extracted = await extractCommandIntent({ data: { command } });
			if (id !== request.current) return;
			const candidate = toCommandCandidate(extracted);
			if (!candidate) {
				setInterpretError(
					"That did not match a supported command. Try a typed command.",
				);
				setInterpreting(false);
				return;
			}
			setInterpreting(false);
			choose(candidate);
		} catch (error) {
			if (id !== request.current) return;
			setInterpretError(
				error instanceof Error
					? error.message
					: "Could not interpret that command. Try typing it.",
			);
			setInterpreting(false);
		}
	};
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!saving) onOpenChange(next);
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
						<div className="relative">
							<CommandInput
								aria-label="Search commands"
								placeholder="Search or tell JotTrade what to do"
								value={query}
								onValueChange={typeQuery}
								className="pr-8"
							/>
							{speech.supported && (
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={
										speech.listening ? "Stop dictation" : "Dictate a command"
									}
									aria-pressed={speech.listening}
									className="-translate-y-1/2 absolute top-1/2 right-2 size-7"
									onClick={() =>
										speech.listening ? speech.stop() : speech.start()
									}
								>
									{speech.listening ? (
										<SquareIcon className="size-3.5 fill-destructive text-destructive" />
									) : (
										<MicIcon className="size-4 opacity-60" />
									)}
								</Button>
							)}
						</div>
						{speech.listening && (
							<output className="block space-y-1 border-b px-3 py-2 text-xs text-muted-foreground">
								<span className="flex items-center gap-2">
									<span className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" />
									<span className="truncate">
										{speech.interim || "Listening… speak your command."}
									</span>
								</span>
								<span className="block">
									Most browsers send the audio to their own speech service.
								</span>
							</output>
						)}
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
							{offerFallback && (
								<CommandItem
									value="interpret"
									onSelect={() => {
										if (!interpreting) void interpret();
									}}
									className="min-h-11"
								>
									<div className="min-w-0">
										<p>
											{interpreting ? "Interpreting…" : "Interpret with Gemini"}
										</p>
										<p className="text-xs text-muted-foreground">
											Sends this command text to Google. Nothing saves without
											your confirmation.
										</p>
									</div>
								</CommandItem>
							)}
						</CommandList>
						{(interpretError ?? speech.error) && (
							<p
								role="alert"
								className="border-t px-3 py-2 text-sm text-destructive"
							>
								{interpretError ?? speech.error}
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
