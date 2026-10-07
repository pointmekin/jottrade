// Stands in for `@tanstack/react-start` in server-function tests:
// vi.mock("@tanstack/react-start", () => import("./server-fn-mock"));
// A call runs the function middleware (so `authMiddleware` calls the mocked
// `requireUserId`), then the validator, then the handler, in the same order
// as the real server.
type Context = Record<string, unknown>;
type Next = (options?: { context?: Context }) => Promise<{ context: Context }>;
type MiddlewareServer = (options: {
	data: unknown;
	context: Context;
	next: Next;
}) => Promise<unknown>;
type Middleware = { server?: MiddlewareServer };
type Validator = { parse: (data: unknown) => unknown };
type Handler = (options: { data: unknown; context: Context }) => unknown;

export function createMiddleware() {
	return {
		server: (server: MiddlewareServer): Middleware => ({ server }),
	};
}

export function createServerFn() {
	const middlewares: Middleware[] = [];
	let validator: Validator | undefined;
	const builder = {
		middleware: (list: Middleware[]) => {
			middlewares.push(...list);
			return builder;
		},
		validator: (value: Validator) => {
			validator = value;
			return builder;
		},
		handler:
			(handler: Handler) =>
			async (call: { data?: unknown } = {}) => {
				let context: Context = {};
				for (const middleware of middlewares) {
					await middleware.server?.({
						data: call.data,
						context,
						next: async (options) => {
							context = { ...context, ...options?.context };
							return { context };
						},
					});
				}
				const data = validator ? validator.parse(call.data) : call.data;
				return handler({ data, context });
			},
	};
	return builder;
}
