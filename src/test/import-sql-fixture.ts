import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { Pool } from "pg";
export const fixtureUrl = process.env.IMPORT_TEST_DATABASE_URL;
export function fixturePool() {
	if (!fixtureUrl)
		throw Error(
			"Set IMPORT_TEST_DATABASE_URL to the coordinator's disposable issue10_sql database.",
		);
	const url = new URL(fixtureUrl);
	if (
		url.hostname !== "127.0.0.1" ||
		url.pathname !== "/issue10_sql" ||
		url.username !== "jottrade_fixture"
	)
		throw Error(
			"Import SQL tests require the exclusively assigned local fixture database.",
		);
	return new Pool({ connectionString: fixtureUrl, max: 6 });
}
export async function runFixtureBatch(pool: Pool, statements: SQL[]) {
	const client = await pool.connect();
	const dialect = new PgDialect();
	try {
		await client.query("BEGIN");
		const results = [];
		for (const statement of statements) {
			const query = dialect.sqlToQuery(statement);
			results.push(await client.query(query.sql, query.params));
		}
		await client.query("COMMIT");
		return results;
	} catch (cause) {
		await client.query("ROLLBACK");
		throw cause;
	} finally {
		client.release();
	}
}
export const fixtureSchema = `
DROP SCHEMA public CASCADE; CREATE SCHEMA public;
CREATE TABLE portfolios(id serial primary key,user_id text not null,currency text);
CREATE TABLE trades(id serial primary key,user_id text not null,portfolio_id int not null references portfolios(id),symbol text not null,side text not null,status text,entry_date timestamp not null,entry_price numeric,quantity numeric,exit_date timestamp,exit_price numeric,fees numeric default 0,net_pnl numeric,return_percent numeric,broker_source text,broker_ticket text,broker_profit numeric,broker_commission numeric,broker_swap numeric,broker_close_reason text,import_hash text unique,notes text,screenshots jsonb default '[]',edit_revision int not null default 0,annotation_revision int not null default 0,reviewed_at timestamptz,reviewed_execution_fingerprint text,initial_risk_snapshot jsonb);
CREATE TABLE cash_flows(id serial primary key,user_id text not null,portfolio_id int not null references portfolios(id),occurred_at timestamp not null,amount numeric not null,kind text not null,note text,import_hash text unique,broker_source text,broker_adjustment jsonb,edit_revision int not null default 0);
CREATE TABLE import_batches(id text primary key,user_id text not null,portfolio_id int not null references portfolios(id),kind text,state text not null default 'staged',revision int not null default 0,file_name text,file_hash text,source_currency text,parser_version int not null default 2,rows jsonb not null,outcomes jsonb not null default '[]',summary jsonb not null,created_at timestamp default now(),expires_at timestamp not null,committed_at timestamp,undone_at timestamp);
CREATE TABLE import_identities(id serial primary key,user_id text not null,portfolio_id int not null references portfolios(id),kind text not null,fingerprint text not null,occurrence int not null default 0,trade_id int references trades(id) on delete set null,cash_flow_id int references cash_flows(id) on delete set null,recorded_record_id int not null,state text not null default 'active',batch_id text references import_batches(id),unique(user_id,portfolio_id,kind,fingerprint,occurrence));
CREATE TABLE review_source_trades(id serial primary key,trade_id int not null references trades(id) on delete restrict);
CREATE TABLE review_source_cash_flows(id serial primary key,cash_flow_id int not null references cash_flows(id) on delete restrict);
`;
export const tradeHeaders =
	"ticket,symbol,type,lots,opening_time_utc,closing_time_utc,opening_price,closing_price,profit,commission,swap";
export const tradeCsv = `${tradeHeaders}\n101,EURUSD,buy,0.10,2026-09-01 08:00:00,2026-09-01 10:00:00,1.1000,1.1050,50.00,-0.70,2.00`;
export const adjustmentCsv =
	"Symbol,Type,Lots,Position ID,Ex-date,Adjustment day,Adjustment date,Dividend rate,Adjustment\nUS500,Buy,1,77,,,2026-09-01 21:00:00,1.2,-4.50";
