import { FlatCompat } from "@eslint/eslintrc";
import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

const compat = new FlatCompat();

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  { files: ["app/**/*.{js,mjs,cjs,ts,jsx,tsx}"] },
  {
    ignores: [
      "build",
      "migrations",
      // # Hack fix to override default behavior for ignore files linted by name
      // # https://github.com/eslint/eslint/issues/15010
      "!.*",
      "node_modules",
      "public",
      ".react-router",
      "vite.config.ts.timestamp*",
    ],
  },
  {
    settings: {
      react: { version: "detect" },
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  ...compat.extends("plugin:prettier/recommended"),
  ...compat.extends("plugin:react-hooks/recommended"),
  {
    rules: {
      "no-debugger": "warn",
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/ban-ts-comment": [
        "warn",
        { "ts-ignore": "allow-with-description" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
];
