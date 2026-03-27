import React from "react";
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

// Create function components that wrap lucide icons
const DashboardIcon: React.ComponentType<{ className?: string }> = (props) => React.createElement(BarChart2, props);
const JournalIcon: React.ComponentType<{ className?: string }> = (props) => React.createElement(ScrollText, props);
const CalendarIcon: React.ComponentType<{ className?: string }> = (props) => React.createElement(CalendarDays, props);
const StrategiesIcon: React.ComponentType<{ className?: string }> = (props) => React.createElement(Target, props);
const SettingsIcon: React.ComponentType<{ className?: string }> = (props) => React.createElement(Settings, props);

export const navItems: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: DashboardIcon },
  { title: "Journal",   url: "/journal",   icon: JournalIcon },
  { title: "Calendar",  url: "/calendar",  icon: CalendarIcon },
  { title: "Strategies",url: "/strategies",icon: StrategiesIcon },
  { title: "Settings",  url: "/settings",  icon: SettingsIcon },
];
