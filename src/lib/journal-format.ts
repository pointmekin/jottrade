import { format } from "date-fns";
import { UNAVAILABLE } from "./metric";

export const toNumber = (value: string | null | undefined) =>
	value ? Number(value) : null;

export function formatEntryDate(value: Date | string | null | undefined) {
	if (!value) return UNAVAILABLE;
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? "Invalid date"
		: format(date, "MMM dd, HH:mm");
}
