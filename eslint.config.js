// ESLint runs only the SonarJS rules. Biome owns formatting and every other lint rule.
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: [
			"src/routeTree.gen.ts",
			"src/components/ui/**",
			".output/**",
			".vercel/**",
			"dist/**",
		],
	},
	{
		files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
		languageOptions: { parser: tseslint.parser },
		...sonarjs.configs.recommended,
		rules: {
			...sonarjs.configs.recommended.rules,
			"sonarjs/max-lines": ["error", { maximum: 400 }],
		},
	},
	{
		files: ["src/test/**"],
		rules: { "sonarjs/max-lines": ["error", { maximum: 500 }] },
	},
);
