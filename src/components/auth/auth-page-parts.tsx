import { Crosshair, Loader2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface AuthAsideProps {
	heading: string;
	description: string;
	steps: readonly string[];
}

export function BrandMark({ className }: { className?: string }) {
	return (
		<div className={className}>
			<Crosshair className="size-5 text-ring" />
			<span className="text-sm font-semibold">JotTrade</span>
		</div>
	);
}

export function AuthAside({ heading, description, steps }: AuthAsideProps) {
	return (
		<aside className="surface relative hidden border-y-0 border-l-0 p-10 lg:flex lg:flex-col lg:justify-between">
			<BrandMark className="flex items-center gap-3" />
			<div className="max-w-xl">
				<h2 className="text-5xl font-semibold leading-[1.1] tracking-[-0.02em]">
					{heading}
				</h2>
				<p className="mt-6 max-w-md text-base leading-7 text-muted-foreground">
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

interface IconFieldProps {
	id: string;
	label: string;
	icon: LucideIcon;
	type: string;
	autoComplete: string;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	labelAction?: ReactNode;
	hint?: string;
	minLength?: number;
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
	labelAction,
	hint,
	minLength,
}: IconFieldProps) {
	const hintId = `${id}-hint`;
	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between gap-3">
				<label htmlFor={id} className="text-sm font-medium text-foreground">
					{label}
				</label>
				{labelAction}
			</div>
			<div className="group relative">
				<div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground transition-colors group-focus-within:text-primary">
					<Icon className="h-4 w-4" />
				</div>
				<Input
					id={id}
					autoComplete={autoComplete}
					type={type}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="pl-9"
					placeholder={placeholder}
					minLength={minLength}
					aria-describedby={hint ? hintId : undefined}
					required
				/>
			</div>
			{hint && (
				<p id={hintId} className="text-xs text-muted-foreground">
					{hint}
				</p>
			)}
		</div>
	);
}

interface AuthSubmitButtonProps {
	pending: boolean;
	label: string;
	pendingLabel: string;
}

export function AuthSubmitButton({
	pending,
	label,
	pendingLabel,
}: AuthSubmitButtonProps) {
	return (
		<Button
			type="submit"
			size="lg"
			className={cn("mt-2 w-full", pending && "disabled:opacity-100")}
			aria-busy={pending}
		>
			{pending && <Loader2 className="animate-spin" />}
			{pending ? pendingLabel : label}
		</Button>
	);
}
