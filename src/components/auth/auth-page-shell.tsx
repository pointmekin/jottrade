import type { ReactNode } from "react";
import {
	AuthAside,
	type AuthAsideProps,
	BrandMark,
} from "@/components/auth/auth-page-parts";
import { FormError } from "@/components/auth/password-page-layout";
import { Skeleton } from "@/components/ui/skeleton";

function AuthFormSkeleton({ fields }: { fields: number }) {
	return (
		<div aria-hidden="true" className="space-y-4">
			<Skeleton className="h-10" />
			<Skeleton className="h-4 w-1/2" />
			{Array.from({ length: fields }, (_, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder rows
				<div key={index} className="space-y-1.5">
					<Skeleton className="h-4 w-16" />
					<Skeleton className="h-9" />
				</div>
			))}
			<Skeleton className="h-10" />
		</div>
	);
}

interface AuthPageShellProps {
	aside: AuthAsideProps;
	title: string;
	description: string;
	error: string;
	loading: boolean;
	fields: number;
	footer: ReactNode;
	children: ReactNode;
}

export function AuthPageShell({
	aside,
	title,
	description,
	error,
	loading,
	fields,
	footer,
	children,
}: AuthPageShellProps) {
	return (
		<div className="grid min-h-screen overflow-hidden lg:grid-cols-[minmax(0,1fr)_30rem]">
			<AuthAside {...aside} />

			<main className="flex items-center justify-center px-6 py-10">
				<div className="w-full max-w-[380px]">
					<BrandMark className="mb-10 flex items-center gap-2.5 lg:hidden" />

					<div className="border-y border-border py-7">
						<div className="mb-6">
							<h1 className="mb-1 text-xl font-semibold text-foreground">
								{title}
							</h1>
							<p className="text-sm text-muted-foreground">{description}</p>
						</div>

						{error && <FormError message={error} />}

						{loading ? (
							<>
								<AuthFormSkeleton fields={fields} />
								<output className="sr-only">Checking your session</output>
							</>
						) : (
							<>
								{children}
								<p className="mt-6 text-center text-sm text-muted-foreground">
									{footer}
								</p>
							</>
						)}
					</div>
				</div>
			</main>
		</div>
	);
}
