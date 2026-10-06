import { listChanges } from "./changes";
import { describePlan, planChecks, writePlan } from "./plan";

const [base, dir] = process.argv.slice(2);
if (!base || !dir) {
	console.error("Usage: bun scripts/quality/select.ts <base-ref> <plan-dir>");
	process.exit(2);
}

const plan = planChecks(listChanges(base, process.cwd()));
writePlan(dir, plan);
console.log(describePlan(base, plan));
