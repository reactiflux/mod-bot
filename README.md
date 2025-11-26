# Mod bot

![CI](https://github.com/reactiflux/mod-bot/workflows/Node.js%20CI/badge.svg)

This code powers the Euno bot on Discord.

The GitLab Handbook has [a section on Product Principles](https://handbook.gitlab.com/handbook/product/product-principles/) that are really good, and the spirit of which should be followed by anyone contributing:

> - We are customer zero, therefore we use our own product: Everything you put into the product should be a feature you or our Engineering team would use as part of our daily work.
> - We are design-led: It does not matter what customer pain points you work with Engineering to resolve if what is provided to customers is hard (or almost impossible) to use.
> - We fail fast and iterate with intention: Define a hypothesis on how to address a customer use case or pain point and validate (or invalidate) it quickly through problem validation.
> - We believe in product-led growth over unguided experiences: Our product should be GitLab’s best Sales team member, and its own biggest champion.

## Initial setup

```sh
npm i
npm run dev
```

## Development

The dev server uses Vite for intelligent hot reloading:

- **Frontend changes** (React components, routes, styles): Vite HMR updates instantly (<1s) without restarting the server
- **Server changes** (Discord bot, commands, helpers, models): Vite automatically reloads the server module to apply changes

Just run `npm run dev` and edit any file - the right reload strategy is applied automatically!

## Tech

- [Remix](https://remix.run/docs/en/v1)
- [Kysely](https://kysely.dev/)
- SQLite3 (with [better-sqlite3](http://npmjs.com/package/better-sqlite3))

### CI/CD

- [GitHub Actions](https://docs.github.com/en/actions)
- [Kubernetes](https://kubernetes.io/docs/tasks/run-application/run-single-instance-stateful-application/)
- DigitalOcean managed Kubernetes

## Implementation Details

migrations with `npm run start:migrate`. latest installed version is tracked in 2 tables of the sqlite data. schema changes must be done cautiously, should have a set up/tear down function tested before merging. Start a new migration with `npx kysely migrate:make <name>`

Migrations are stored in `migrations/`.

Generated DB types are stored in `app/db.d.ts` and generated automatically in a precommit hook and on app startup.

The code runs on a managed Kubernetes instance on Digital Ocean, using GitHub Actions as CI/CD. The service is configured using a `kustomization.yaml` file, which relies on configuration files within `cluster/`. Most of the configuration is in place to inject secrets stored in GitHub into the service upon deployment. Maybe most confusingly, there's a `k8s-context` file generated as part of CI that exists to pass along the latest Docker image tag from CI into the cluster configuration.

This bot was architected to support a web portal, but the k8s cluster configuration currently is not configured to be exposed to the internet, so it can not be used for a web portal in its current form.

The auth system is simple delegated auth to Discord. accounts are created if not found locally, no passwords or secondary confirmation atm. This system is not currently used for anything, it's a remnant of an earlier project that was abandoned.
