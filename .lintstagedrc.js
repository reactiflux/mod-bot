export default {
  "**/*.[tj]s?(x)": ["npm run format:check", "npm run lint"],
  "migrations/*.[tj]s": [
    "npm run start:migrate",
    "npm run generate:db-types",
    "git add app/db.d.ts",
  ],
};
