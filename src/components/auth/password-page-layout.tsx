import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { AuthAside } from "@/components/auth/auth-page-parts";

interface PasswordPageLayoutProps {
	title: string;
	description: string;
	children: ReactNode;
}

export function PasswordPageLayout({
	title,
	description,
	children,
}: PasswordPageLayoutProps) {
	return (
		<div className="grid min-h-screen overflow-hidden lg:grid-cols-[minmax(0,1fr)_30rem]">
			<AuthAside
				heading="Get back to your trading record."
				description="Set a new password, then continue where you stopped."
				steps={["Request", "Reset", "Sign in"]}
			/>
			<main className="flex items-center justify-center px-6 py-10">
				<div className="w-full max-w-[380px] border-y border-border py-7">
					<div className="mb-6">
						<h1 className="mb-1 text-xl font-semibold text-foreground">
							{title}
						</h1>
						<p className="text-sm text-muted-foreground">{description}</p>
					</div>
					{children}
					<Link
						to="/sign-in"
						className="mt-6 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to sign in
					</Link>
				</div>
			</main>
		</div>
	);
}

export function FormError({ message }: { message: string }) {
	return (
		<div
			role="alert"
			className="mb-5 border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive"
		>
			{message}
		</div>
	);
}

export function FormNotice({ children }: { children: ReactNode }) {
	return (
		<output className="block border border-border bg-accent/40 p-3.5 text-sm text-foreground">
			{children}
		</output>
	);
}

export const SUBMIT_CLASS =
	"mt-2 flex w-full items-center justify-center border border-primary bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/88 disabled:cursor-not-allowed disabled:opacity-60";
