import type { ComponentType } from "react";
import {
	BarChart2,
	CalendarDays,
	ScrollText,
	Settings,
	Target,
} from "lucide-react";

export type NavItem = {
	title: string;
	url: string;
	icon: ComponentType<{ className?: string }>;
};

export const navItems: NavItem[] = [
	{ title: "Dashboard", url: "/dashboard", icon: BarChart2 },
	{ title: "Journal", url: "/journal", icon: ScrollText },
	{ title: "Calendar", url: "/calendar", icon: CalendarDays },
	{ title: "Strategies", url: "/strategies", icon: Target },
	{ title: "Settings", url: "/settings", icon: Settings },
];
