import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgTransport } from "@/db/pg-transport";
import { checkTarget } from "../../scripts/db/target";

// Opt-in: point it at a disposable local database, e.g. one from `npm run db:setup`.
const url = process.env.PG_TRANSPORT_TEST_DATABASE_URL;

type Transport = {
	query: (
		text: string,
		values?: unknown[],
		options?: object,
	) => PromiseLike<unknown>;
	transaction: (queries: PromiseLike<unknown>[]) => Promise<unknown[]>;
};

describe.skipIf(!url)("pg transport on a local PostgreSQL", () => {
	let client: Transport;
	beforeAll(async () => {
		const check = checkTarget({ DATABASE_URL: url });
		if (!check.ok) throw new Error(check.reason);
		client = createPgTransport(url ?? "") as unknown as Transport;
		await client.query("drop table if exists pg_transport_probe");
		await client.query("create table pg_transport_probe (n int unique)");
	});
	afterAll(async () => {
		await client?.query("drop table if exists pg_transport_probe");
	});

	it("returns rows, arrays and full results like Neon", async () => {
		const sql = "select 1 as one, timestamp '2026-01-02 03:04:05' as at";
		expect(await client.query(sql)).toEqual([
			{ one: 1, at: "2026-01-02 03:04:05" },
		]);
		expect(await client.query(sql, [], { arrayMode: true })).toEqual([
			[1, "2026-01-02 03:04:05"],
		]);
		expect(
			await client.query("select $1::int as n", [7], { fullResults: true }),
		).toMatchObject({
			rowCount: 1,
			rows: [{ n: 7 }],
		});
	});

	it("does not run a query until it is awaited", async () => {
		client.query("insert into pg_transport_probe values (1)");
		expect(
			await client.query("select count(*)::int as c from pg_transport_probe"),
		).toEqual([{ c: 0 }]);
	});

	it("commits a batch together and rolls it back together", async () => {
		await client.transaction([
			client.query("insert into pg_transport_probe values (2)"),
			client.query("insert into pg_transport_probe values (3)"),
		]);
		await expect(
			client.transaction([
				client.query("insert into pg_transport_probe values (4)"),
				client.query("insert into pg_transport_probe values (2)"),
			]),
		).rejects.toThrow(/duplicate/);
		expect(
			await client.query(
				"select array_agg(n order by n) as ns from pg_transport_probe",
			),
		).toEqual([{ ns: [2, 3] }]);
	});
});
