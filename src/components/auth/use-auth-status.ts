import { useCallback, useEffect, useState } from "react";

export const AuthStatus = {
	Idle: "idle",
	Email: "email",
	Google: "google",
} as const;
export type AuthStatus = (typeof AuthStatus)[keyof typeof AuthStatus];

// One request at a time on an auth page: the email form and the Google button
// share this state, so a tap on one locks the other until it fails.
export function useAuthStatus() {
	const [status, setStatus] = useState<AuthStatus>(AuthStatus.Idle);
	const [error, setError] = useState("");

	// Back from Google can restore this page from the browser cache with the
	// pending state still set, which would leave the button stuck.
	useEffect(() => {
		const reset = (event: PageTransitionEvent) => {
			if (event.persisted) setStatus(AuthStatus.Idle);
		};
		window.addEventListener("pageshow", reset);
		return () => window.removeEventListener("pageshow", reset);
	}, []);

	const start = useCallback((next: Exclude<AuthStatus, "idle">) => {
		setStatus(next);
		setError("");
	}, []);

	const fail = useCallback((message: string) => {
		setStatus(AuthStatus.Idle);
		setError(message);
	}, []);

	return { status, error, busy: status !== AuthStatus.Idle, start, fail };
}

export type AuthFlow = ReturnType<typeof useAuthStatus>;
