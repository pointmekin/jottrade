import { Crosshair, type LucideIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";

interface AuthAsideProps {
	heading: string;
	description: string;
	steps: readonly string[];
}

export function AuthAside({ heading, description, steps }: AuthAsideProps) {
	return (
		<aside className="surface relative hidden border-y-0 border-l-0 p-10 lg:flex lg:flex-col lg:justify-between">
			<div className="flex items-center gap-3">
				<Crosshair className="size-5 text-ring" />
				<span className="text-sm font-semibold">JotTrade</span>
			</div>
			<div className="max-w-3xl">
				<h2 className="max-w-4xl text-[clamp(3.5rem,7vw,7.5rem)] font-semibold leading-[0.84] tracking-[-0.06em]">
					{heading}
				</h2>
				<p className="mt-8 max-w-xl text-base leading-7 text-muted-foreground">
					{description}
				</p>
			</div>
			<div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
				{steps.map((step) => (
					<span key={step} className="surface p-3">
						{step}
					</span>
				))}
			</div>
		</aside>
	);
}

export function GoogleAuthSection({ label }: { label: string }) {
	return (
		<div className="space-y-3">
			<button
				type="button"
				onClick={async () => {
					await authClient.signIn.social({
						provider: "google",
						callbackURL: "/dashboard",
					});
				}}
				className="flex w-full items-center justify-center gap-3 border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
			>
				<svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
					<path
						d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
						fill="#4285F4"
					/>
					<path
						d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
						fill="#34A853"
					/>
					<path
						d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
						fill="#FBBC05"
					/>
					<path
						d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
						fill="#EA4335"
					/>
				</svg>
				{label}
			</button>

			<div className="relative">
				<div className="absolute inset-0 flex items-center">
					<div className="w-full border-t border-border" />
				</div>
				<div className="relative flex justify-center text-xs">
					<span className="bg-background px-2 text-muted-foreground">
						or continue with email
					</span>
				</div>
			</div>
		</div>
	);
}

interface IconFieldProps {
	id: string;
	label: string;
	icon: LucideIcon;
	type: string;
	autoComplete: string;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
}

export function IconField({
	id,
	label,
	icon: Icon,
	type,
	autoComplete,
	placeholder,
	value,
	onChange,
}: IconFieldProps) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={id} className="text-sm font-medium text-foreground block">
				{label}
			</label>
			<div className="relative group">
				<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground group-focus-within:text-primary transition-colors">
					<Icon className="h-4 w-4" />
				</div>
				<input
					id={id}
					autoComplete={autoComplete}
					type={type}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="block w-full border border-input bg-background py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
					placeholder={placeholder}
					required
				/>
			</div>
		</div>
	);
}
