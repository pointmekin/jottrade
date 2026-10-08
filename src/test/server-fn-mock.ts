// Stands in for `@tanstack/react-start` in server-function tests:
// vi.mock("@tanstack/react-start", () => import("./server-fn-mock"));
// A call runs the function middleware as a chain (so `authMiddleware` calls
// the mocked `requireUserId`), then the validator, then the handler, in the
// same order as the real server. A middleware that does not call `next()`
// stops the call, as on the server.
type Context = Record<string, unknown>;
type Next = (options?: { context?: Context }) => Promise<unknown>;
type MiddlewareServer = (options: {
	data: unknown;
	context: Context;
	next: Next;
}) => Promise<unknown>;
type Middleware = { server?: MiddlewareServer };
type Validator =
	| { parse: (data: unknown) => unknown }
	| ((data: unknown) => unknown);
type Handler = (options: { data: unknown; context: Context }) => unknown;

export function createMiddleware() {
	return {
		server: (server: MiddlewareServer): Middleware => ({ server }),
	};
}

function validate(validator: Validator | undefined, data: unknown) {
	if (!validator) return data;
	return typeof validator === "function"
		? validator(data)
		: validator.parse(data);
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
			(call: { data?: unknown } = {}) => {
				let result: unknown;
				let reachedHandler = false;
				const run = async (
					index: number,
					context: Context,
				): Promise<unknown> => {
					const middleware = middlewares[index];
					if (!middleware?.server) {
						reachedHandler = true;
						result = await handler({
							data: validate(validator, call.data),
							context,
						});
						return { context };
					}
					return middleware.server({
						data: call.data,
						context,
						next: (options) =>
							run(index + 1, { ...context, ...options?.context }),
					});
				};
				return run(0, {}).then(() => {
					if (!reachedHandler)
						throw new Error("A middleware did not call next().");
					return result;
				});
			},
	};
	return builder;
}
