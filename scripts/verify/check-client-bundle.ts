import { existsSync } from "node:fs";
import {
	findClientLeaks,
	missingServerMarkers,
	readBundle,
} from "./client-bundle";

const [clientDir, serverDir] = process.argv.slice(2);
if (!clientDir || !serverDir) {
	console.error(
		"Usage: tsx scripts/verify/check-client-bundle.ts <client-assets-dir> <server-output-dir>",
	);
	process.exit(2);
}
for (const dir of [clientDir, serverDir]) {
	if (!existsSync(dir)) {
		console.error(`${dir} does not exist. Build the app first.`);
		process.exit(2);
	}
}

const client = readBundle(clientDir);
const server = readBundle(serverDir);
const problems = [
	...(client.some(({ path }) => path.endsWith(".js"))
		? []
		: [`${clientDir} has no JavaScript files.`]),
	...missingServerMarkers(server).map(
		(marker) =>
			`${serverDir} does not contain the marker "${marker}". Update SERVER_ONLY_MARKERS.`,
	),
	...findClientLeaks(client, process.env),
];

if (problems.length > 0) {
	console.error(problems.join("\n"));
	process.exit(1);
}
console.log(
	`${client.length} client files contain no server-only variable, secret value or server-only module.`,
);
