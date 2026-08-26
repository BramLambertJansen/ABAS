import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // `eslint-config-next` (above) already wires in a handful of jsx-a11y
  // rules as warnings. `plugin:jsx-a11y/recommended` replaces that subset
  // with the full recommended ruleset, and `check:a11y` (see package.json)
  // fails the build on warnings too — so this is the "script, not review
  // duty" gate CLAUDE.md calls for, not just an editor nicety.
  ...compat.extends("plugin:jsx-a11y/recommended"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "supabase/.temp/**",
      "designs/**",
    ],
  },
];

export default eslintConfig;
