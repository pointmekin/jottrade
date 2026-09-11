import type { ReactNode } from "react";

interface AppPageHeaderProps {
	title: string;
	description?: string;
	actions?: ReactNode;
	toolbar?: ReactNode;
}

export function AppPageHeader({
	title,
	description,
	actions,
	toolbar,
}: AppPageHeaderProps) {
	return (
		<header className="mb-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h1 className="page-title">{title}</h1>
					{description && <p className="page-description">{description}</p>}
				</div>
				{actions && (
					<div className="flex shrink-0 flex-wrap items-center gap-2">
						{actions}
					</div>
				)}
			</div>
			{toolbar && <div className="toolbar mt-4">{toolbar}</div>}
		</header>
	);
}

interface SectionHeadingProps {
	title: string;
	detail?: string;
	actions?: ReactNode;
}

export function SectionHeading({
	title,
	detail,
	actions,
}: SectionHeadingProps) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<div className="min-w-0">
				<h2 className="text-base font-semibold">{title}</h2>
				{detail && <p className="field-label">{detail}</p>}
			</div>
			{actions}
		</div>
	);
}
