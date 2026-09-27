import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CommandPreview } from "@/components/command-palette/command-preview";
import { CommandSearch } from "@/components/command-palette/command-search";
import { useTheme } from "@/components/theme-provider";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { useCommandShortcut } from "@/hooks/use-command-shortcut";
import { useSpeechInput } from "@/hooks/use-speech-input";
import { authClient } from "@/lib/auth-client";
import { toCommandCandidate } from "@/lib/commands/intent-schema";
import { matchCommands } from "@/lib/commands/matcher";
import {
	type CommandCandidate,
	IntentType,
	isWriteIntent,
} from "@/lib/commands/types";
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
	// Reset on the way in, not on the way out. A reset during the close
	// animation swaps the content back to the default list and looks like a jump.
	const [wasOpen, setWasOpen] = useState(open);
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			setQuery("");
			setSelected(undefined);
			setInterpreting(false);
			setInterpretError(undefined);
		}
	}
	// Drop an in-flight interpretation when the palette closes.
	useEffect(() => {
		if (!open) request.current++;
	}, [open]);
	// Never keep the microphone open behind a closed palette or a preview.
	useEffect(() => {
		if (!open || selected) stopSpeech();
	}, [open, selected, stopSpeech]);
	useCommandShortcut({
		enabled: Boolean(session),
		onToggle: () => {
			if (!saving) onOpenChange(!open);
		},
	});
	if (!session) return null;
	const choose = (candidate: CommandCandidate) => {
		const intent = candidate.intent;
		if (intent.type === IntentType.Navigation) {
			void navigate({ to: intent.path });
			onOpenChange(false);
		} else if (intent.type === IntentType.Theme) {
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
				{selected && isWriteIntent(selected.intent) ? (
					<CommandPreview
						intent={selected.intent}
						warning={selected.warning}
						onBack={() => setSelected(undefined)}
						onSuccess={() => onOpenChange(false)}
						onSavingChange={setSaving}
					/>
				) : (
					<CommandSearch
						query={query}
						onQueryChange={typeQuery}
						speech={speech}
						candidates={candidates}
						interpreting={interpreting}
						offerFallback={offerFallback}
						error={interpretError ?? speech.error}
						onChoose={choose}
						onInterpret={() => {
							if (!interpreting) void interpret();
						}}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
