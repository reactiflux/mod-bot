import globals from "globals";
import tseslint from "typescript-eslint";

import { FlatCompat } from "@eslint/eslintrc";
import pluginJs from "@eslint/js";

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
      ".lintstagedrc.js",
      "build",
      "migrations",
      // # Hack fix to override default behavior for ignore files linted by name
      // # https://github.com/eslint/eslint/issues/15010
      "!.*",
      "node_modules",
      "public",
      ".react-router",
      "*timestamp*",
    ],
  },
  {
    settings: {
      react: { version: "detect" },
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  ...compat.extends("plugin:react-hooks/recommended"),
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            ".lintstagedrc.js",
            "eslint.config.js",
            "postcss.config.mjs",
            "tailwind.config.js",
            "scripts/get-stripe-price.js",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Config files don't need type-checked linting
    files: [
      "*.config.{js,mjs,ts}",
      ".lintstagedrc.js",
      "eslint.config.js",
      "index.*.js",
    ],
  },
  {
    rules: {
      // General JavaScript rules
      "no-debugger": "warn",
      "prefer-const": "error",
      "no-var": "error",

      // React rules
      "react/react-in-jsx-scope": "off",
      "react-hooks/exhaustive-deps": "warn",

      // TypeScript rules
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
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: { attributes: false, arguments: false },
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/only-throw-error": "off", // React Router uses throw redirect()

      // Allow common patterns
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",

      "no-console": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
];
