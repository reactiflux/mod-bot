export default {
  "**/*.[tj]s?(x)": [
    "eslint --no-warn-ignored --fix --max-warnings=0",
    "prettier --check",
  ],
  "migrations/*.[tj]s": [
    "npm run start:migrate",
    "npm run generate:db-types",
    "git add app/db.d.ts",
  ],
};
