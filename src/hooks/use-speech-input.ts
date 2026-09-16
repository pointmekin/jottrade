import { useCallback, useEffect, useRef, useState } from "react";

// lib.dom.d.ts ships the result types but not SpeechRecognition itself.
type RecognitionEvent = { results: SpeechRecognitionResultList };
type RecognitionErrorEvent = { error: string };
type Recognition = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	start: () => void;
	abort: () => void;
	onresult: ((event: RecognitionEvent) => void) | null;
	onerror: ((event: RecognitionErrorEvent) => void) | null;
	onend: (() => void) | null;
};
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | undefined {
	if (typeof window === "undefined") return undefined;
	const scope = window as unknown as {
		SpeechRecognition?: RecognitionConstructor;
		webkitSpeechRecognition?: RecognitionConstructor;
	};
	return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

const BLOCKED =
	"Microphone access is blocked. Allow it in your browser, or type the command.";
const ERRORS: Record<string, string> = {
	"not-allowed": BLOCKED,
	"service-not-allowed": BLOCKED,
	"audio-capture": "No microphone was found. Type the command instead.",
	"no-speech": "Nothing was heard. Try again, or type the command.",
	network: "Dictation could not reach the network. Type the command instead.",
};
const FAILED = "Dictation failed. Type the command instead.";

export function useSpeechInput(onTranscript: (text: string) => void) {
	const [supported, setSupported] = useState(false);
	const [listening, setListening] = useState(false);
	const [interim, setInterim] = useState("");
	const [error, setError] = useState<string>();
	const recognition = useRef<Recognition | null>(null);
	const handleTranscript = useRef(onTranscript);
	handleTranscript.current = onTranscript;

	// Resolved after mount so the server and the client render the same markup.
	useEffect(() => setSupported(Boolean(recognitionConstructor())), []);

	const stop = useCallback(() => {
		const active = recognition.current;
		recognition.current = null;
		if (active) {
			active.onresult = null;
			active.onerror = null;
			active.onend = null;
			active.abort();
		}
		setListening(false);
		setInterim("");
	}, []);

	// A live microphone must never outlive the palette.
	useEffect(() => stop, [stop]);

	const start = useCallback(() => {
		const Constructor = recognitionConstructor();
		if (!Constructor || recognition.current) return;
		setError(undefined);
		setInterim("");
		const active = new Constructor();
		active.lang = "en-US";
		active.continuous = false;
		active.interimResults = true;
		active.onresult = (event) => {
			let text = "";
			let final = false;
			for (let index = 0; index < event.results.length; index++) {
				const result = event.results[index];
				text += result[0].transcript;
				if (result.isFinal) final = true;
			}
			// A transcript only fills the input. The user still confirms every write.
			if (!final) {
				setInterim(text.trim());
				return;
			}
			stop();
			handleTranscript.current(text.trim());
		};
		active.onerror = (event) => {
			setError(ERRORS[event.error] ?? FAILED);
			stop();
		};
		active.onend = () => {
			if (recognition.current === active) stop();
		};
		recognition.current = active;
		try {
			// The browser asks for microphone permission here, not before.
			active.start();
		} catch {
			setError(FAILED);
			stop();
			return;
		}
		setListening(true);
	}, [stop]);

	const clearError = useCallback(() => setError(undefined), []);
	return { supported, listening, interim, error, start, stop, clearError };
}
