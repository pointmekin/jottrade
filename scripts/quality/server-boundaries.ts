import { posix } from "node:path";
import ts from "typescript";
import { SERVER_ONLY_FILES, SERVER_ONLY_PACKAGES } from "./server-only";

export type SourceFile = { path: string; source: string };

const SERVER_DIR = "src/server/";
const AUTH_MIDDLEWARE = "src/server/auth-middleware.ts";

// Narrow, documented exceptions. Each entry needs a reason.
export const SERVER_MODULE_EXPORTS: Record<string, string> = {};
export const PUBLIC_SERVER_FUNCTIONS: Record<string, string> = {};
export const NO_INPUT_POSTS: Record<string, string> = {
	exportArchive:
		"Reads the signed-in user's whole journal and takes no input. POST keeps the large response out of HTTP caches.",
	ensureDefaultAccount:
		"Acts on the signed-in user only; there is no input to validate.",
};

const NOT_CLIENT = [
	SERVER_DIR,
	"src/db/",
	"src/test/",
	"src/routes/api/",
	"src/routeTree.gen.ts",
];

function isServerOnlyFile(path: string) {
	return SERVER_ONLY_FILES.some((pattern) =>
		pattern.endsWith("/**")
			? path.startsWith(pattern.slice(0, -2))
			: path === pattern,
	);
}

export function isClientModule(path: string) {
	return (
		path.startsWith("src/") &&
		/\.(ts|tsx)$/.test(path) &&
		!NOT_CLIENT.some((prefix) => path.startsWith(prefix)) &&
		!isServerOnlyFile(path)
	);
}

function parse({ path, source }: SourceFile) {
	return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
}

function line(file: ts.SourceFile, node: ts.Node) {
	return file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
}

/** `createServerFn(...).middleware(...).validator(...).handler(...)` as a list. */
function callChain(expression: ts.Expression) {
	const calls: { name: string; args: readonly ts.Expression[] }[] = [];
	let node: ts.Expression = expression;
	while (ts.isCallExpression(node)) {
		const callee = node.expression;
		if (ts.isPropertyAccessExpression(callee)) {
			calls.unshift({ name: callee.name.text, args: node.arguments });
			node = callee.expression;
		} else {
			if (ts.isIdentifier(callee)) {
				calls.unshift({ name: callee.text, args: node.arguments });
			}
			break;
		}
	}
	return calls;
}

function httpMethod(args: readonly ts.Expression[]) {
	const [options] = args;
	if (!options || !ts.isObjectLiteralExpression(options)) return "GET";
	for (const property of options.properties) {
		if (
			ts.isPropertyAssignment(property) &&
			property.name.getText() === "method" &&
			ts.isStringLiteral(property.initializer)
		) {
			return property.initializer.text;
		}
	}
	return "GET";
}

function usesAuthMiddleware(args: readonly ts.Expression[]) {
	const [list] = args;
	return (
		list !== undefined &&
		ts.isArrayLiteralExpression(list) &&
		list.elements.some(
			(element) =>
				ts.isIdentifier(element) && element.text === "authMiddleware",
		)
	);
}

/** The whole `createServerFn(...)....handler(...)` call that starts at `root`. */
function chainTop(root: ts.CallExpression) {
	let top: ts.CallExpression = root;
	while (
		ts.isPropertyAccessExpression(top.parent) &&
		ts.isCallExpression(top.parent.parent) &&
		top.parent.parent.expression === top.parent
	) {
		top = top.parent.parent;
	}
	return top;
}

function declarationName(node: ts.Node) {
	for (let current = node.parent; current; current = current.parent) {
		if (ts.isVariableDeclaration(current)) return current.name.getText();
	}
	return "(unnamed)";
}

function serverFunctionProblems(
	file: ts.SourceFile,
	root: ts.CallExpression,
	hasRealAuthMiddleware: boolean,
): string[] {
	const name = declarationName(root);
	const where = `${file.fileName}:${line(file, root)} ${name}`;
	const calls = callChain(chainTop(root));
	const problems: string[] = [];
	const middleware = calls.find((call) => call.name === "middleware");
	const isAuthenticated =
		hasRealAuthMiddleware && middleware && usesAuthMiddleware(middleware.args);
	if (!isAuthenticated && !(name in PUBLIC_SERVER_FUNCTIONS)) {
		problems.push(
			`${where}: add .middleware([authMiddleware]) after createServerFn(), with authMiddleware imported from src/server/auth-middleware.ts, and read the user from context.userId. For a public function, add it to PUBLIC_SERVER_FUNCTIONS with a reason.`,
		);
	}
	if (
		httpMethod(calls[0].args) === "POST" &&
		!calls.some((call) => call.name === "validator") &&
		!(name in NO_INPUT_POSTS)
	) {
		problems.push(
			`${where}: a POST server function must validate its input with .validator(schema). For a POST without input, add it to NO_INPUT_POSTS with a reason.`,
		);
	}
	return problems;
}

function serverFunctionRoots(file: ts.SourceFile) {
	const roots: ts.CallExpression[] = [];
	const visit = (node: ts.Node) => {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === "createServerFn"
		) {
			roots.push(node);
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return roots;
}

function declaresAuthMiddleware(file: ts.SourceFile) {
	let found = false;
	const visit = (node: ts.Node) => {
		if (
			(ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) &&
			node.name?.getText(file) === "authMiddleware"
		) {
			found = true;
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return found;
}

function importsAuthMiddleware(path: string, file: ts.SourceFile) {
	return runtimeImports(file).some(
		({ specifier, names }) =>
			resolveSource(path, specifier) === AUTH_MIDDLEWARE.replace(/\.ts$/, "") &&
			names.includes("authMiddleware"),
	);
}

/** Every createServerFn, in any file: authenticated, and validated if POST. */
function checkServerFunctions(input: SourceFile, file: ts.SourceFile) {
	const roots = serverFunctionRoots(file);
	if (roots.length === 0) return [];
	const hasRealAuthMiddleware =
		importsAuthMiddleware(input.path, file) && !declaresAuthMiddleware(file);
	return roots.flatMap((root) =>
		serverFunctionProblems(file, root, hasRealAuthMiddleware),
	);
}

function isExported(node: ts.Node) {
	return (
		ts.canHaveModifiers(node) &&
		(ts.getModifiers(node) ?? []).some(
			(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
		)
	);
}

function isAllowedExport(statement: ts.Statement) {
	if (
		ts.isTypeAliasDeclaration(statement) ||
		ts.isInterfaceDeclaration(statement)
	) {
		return true;
	}
	if (ts.isExportDeclaration(statement)) return statement.isTypeOnly;
	if (!ts.isVariableStatement(statement)) return false;
	return statement.declarationList.declarations.every((declaration) => {
		const root = declaration.initializer
			? callChain(declaration.initializer)[0]?.name
			: undefined;
		return root === "createServerFn" || root === "createMiddleware";
	});
}

/** src/server/ files export only server functions, middleware and types. */
function exportShapeProblems(input: SourceFile, file: ts.SourceFile) {
	if (input.path in SERVER_MODULE_EXPORTS) return [];
	return file.statements
		.filter(
			(statement) =>
				isExported(statement) ||
				ts.isExportDeclaration(statement) ||
				ts.isExportAssignment(statement),
		)
		.filter((statement) => !isAllowedExport(statement))
		.map(
			(statement) =>
				`${input.path}:${line(file, statement)}: a server module may export only createServerFn or createMiddleware results and types. Move this helper to a server-only module (src/db/ for queries, src/lib/auth.ts for the session). A helper export here keeps its imports in the client bundle.`,
		);
}

/** Rules for files in src/server/. */
export function checkServerModule(input: SourceFile): string[] {
	const file = parse(input);
	const problems = [
		...exportShapeProblems(input, file),
		...checkServerFunctions(input, file),
	];
	if (input.path !== AUTH_MIDDLEWARE) {
		for (const { specifier, names, node } of runtimeImports(file)) {
			if (
				resolveSource(input.path, specifier) === "src/lib/auth" &&
				names.includes("requireUserId")
			) {
				problems.push(
					`${input.path}:${line(file, node)}: do not call requireUserId in a server function. Use .middleware([authMiddleware]) and context.userId.`,
				);
			}
		}
	}
	return problems;
}

type RuntimeImport = { specifier: string; names: string[]; node: ts.Node };

function importDeclaration(node: ts.ImportDeclaration): RuntimeImport[] {
	if (!ts.isStringLiteral(node.moduleSpecifier)) return [];
	const clause = node.importClause;
	if (clause?.isTypeOnly) return [];
	const bindings = clause?.namedBindings;
	const named =
		bindings && ts.isNamedImports(bindings)
			? bindings.elements.filter((element) => !element.isTypeOnly)
			: [];
	const onlyTypes =
		clause !== undefined &&
		!clause.name &&
		bindings !== undefined &&
		ts.isNamedImports(bindings) &&
		named.length === 0;
	if (onlyTypes) return [];
	return [
		{
			specifier: node.moduleSpecifier.text,
			names: named.map(
				(element) => (element.propertyName ?? element.name).text,
			),
			node,
		},
	];
}

function moduleReference(node: ts.Node): RuntimeImport[] {
	if (ts.isImportDeclaration(node)) return importDeclaration(node);
	if (
		ts.isExportDeclaration(node) &&
		!node.isTypeOnly &&
		node.moduleSpecifier &&
		ts.isStringLiteral(node.moduleSpecifier)
	) {
		return [{ specifier: node.moduleSpecifier.text, names: [], node }];
	}
	const [argument] = ts.isCallExpression(node) ? node.arguments : [];
	if (
		ts.isCallExpression(node) &&
		node.expression.kind === ts.SyntaxKind.ImportKeyword &&
		argument &&
		ts.isStringLiteral(argument)
	) {
		return [{ specifier: argument.text, names: [], node }];
	}
	return [];
}

function runtimeImports(file: ts.SourceFile): RuntimeImport[] {
	const imports: RuntimeImport[] = [];
	const visit = (node: ts.Node) => {
		imports.push(...moduleReference(node));
		ts.forEachChild(node, visit);
	};
	visit(file);
	return imports;
}

function resolveSource(from: string, specifier: string) {
	if (specifier.startsWith("@/")) return `src/${specifier.slice(2)}`;
	if (specifier.startsWith(".")) {
		return posix.normalize(posix.join(posix.dirname(from), specifier));
	}
	return undefined;
}

function isServerOnlyTarget(target: string) {
	return [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`].some(
		isServerOnlyFile,
	);
}

/** Rule for client-reachable files: no direct import of a server-only module. */
export function checkClientModule(input: SourceFile): string[] {
	const file = parse(input);
	return [
		...checkServerFunctions(input, file),
		...clientImportProblems(input, file),
	];
}

function clientImportProblems(input: SourceFile, file: ts.SourceFile) {
	return runtimeImports(file).flatMap(({ specifier, node }) => {
		const target = resolveSource(input.path, specifier);
		const denied = target
			? isServerOnlyTarget(target)
			: SERVER_ONLY_PACKAGES.some(
					(name) => specifier === name || specifier.startsWith(`${name}/`),
				);
		return denied
			? [
					`${input.path}:${line(file, node)}: client code imports the server-only module "${specifier}". Call a server function from src/server/ instead. A type-only import (import type) is allowed.`,
				]
			: [];
	});
}

export function checkBoundaries(files: SourceFile[]): string[] {
	return files.flatMap((file) => {
		if (file.path.startsWith(SERVER_DIR)) return checkServerModule(file);
		if (isClientModule(file.path)) return checkClientModule(file);
		if (file.path.startsWith("src/test/")) return [];
		return checkServerFunctions(file, parse(file));
	});
}
