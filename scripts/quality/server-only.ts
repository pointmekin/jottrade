// Modules that must never reach the browser (database clients, auth secrets,
// storage keys). vite.config.ts feeds these to
// TanStack Start import protection (the build fails on a client import), and
// scripts/quality/server-boundaries.ts checks direct imports before the build.

/** Source files, relative to the repository root. */
export const SERVER_ONLY_FILES = [
	"src/db/**",
	"src/lib/auth.ts",
	"src/lib/gcp.ts",
];

/** Package specifiers: database drivers, the auth server adapter, storage. */
export const SERVER_ONLY_PACKAGES = [
	"pg",
	"@neondatabase/serverless",
	"drizzle-orm/neon-http",
	"drizzle-orm/node-postgres",
	"better-auth/adapters/drizzle",
	"@tanstack/react-start/server",
];
