export default {
  "**/*.[tj]s?(x)": ["npm run format:fix", "npm run lint:fix"],
  "migrations/*.[tj]s": [
    "npm run start:migrate",
    "npm run generate:db-types",
    "git add app/db.d.ts",
  ],
};
