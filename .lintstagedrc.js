module.exports = {
  "**/*.[tj]s?(x)": ["eslint --fix --max-warnings=0", "prettier --check"],
  "migrations/*.[tj]s": ["npm run generate:db-types"],
};
