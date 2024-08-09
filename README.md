# Jobs bot

Initial setup

```sh
yarn
yarn dev:init
yarn dev
```

Uses:

- [Remix](https://remix.run/docs/en/v1)
- [Kysely](https://kysely.dev/)
- SQLite3 (with [better-sqlite3](http://npmjs.com/package/better-sqlite3))

Deployed with:

- [GitHub Actions](https://docs.github.com/en/actions)
- [Kubernetes](https://kubernetes.io/docs/tasks/run-application/run-single-instance-stateful-application/)
- DigitalOcean managed Kubernetes

Details:

migrations with `yarn migrate:latest`. latest installed version is tracked in 2 tables of the sqlite data. schema changes must be done cautiously, should have a set up/tear down function tested before merging.

seed data is stored in seeds/

auth system is simple delegated auth to discord. accounts are created if not found locally, no passwords or secondary confirmation atm
