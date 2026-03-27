import {
  BarChart2,
  CalendarDays,
  Settings,
  Target,
  ScrollText,
} from "lucide-react";

export type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
};

export const navItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: BarChart2 },
  { title: "Journal",   url: "/journal",   icon: ScrollText },
  { title: "Calendar",  url: "/calendar",  icon: CalendarDays },
  { title: "Strategies",url: "/strategies",icon: Target },
  { title: "Settings",  url: "/settings",  icon: Settings },
];
