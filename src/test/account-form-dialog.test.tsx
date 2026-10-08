// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AccountFormDialog } from "@/components/account/account-form-dialog";

vi.mock("@/server/portfolioActions", () => ({
	createAccount: vi.fn(),
	updateAccount: vi.fn(),
}));

function Harness() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button type="button" onClick={() => setOpen(true)}>
				Open
			</button>
			<AccountFormDialog open={open} onOpenChange={setOpen} />
		</>
	);
}

describe("AccountFormDialog", () => {
	it("returns focus to the opener on close", async () => {
		render(
			<QueryClientProvider client={new QueryClient()}>
				<Harness />
			</QueryClientProvider>,
		);
		const opener = screen.getByRole("button", { name: "Open" });
		opener.focus();
		fireEvent.click(opener);
		await screen.findByRole("dialog");

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		await waitFor(() => expect(document.activeElement).toBe(opener));
	});
});
