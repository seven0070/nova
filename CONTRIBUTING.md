# Contributing

Use Node 24 and `npm ci`. Run `npm test`, `npm run typecheck`, `npm run build`, and `npm run cli:package` for changes to shared/device code. Stage desktop runtime with `npm run desktop:stage`; install its separate dependencies with `npm ci --prefix apps/desktop`.

Add environment I/O behind adapters, keep policy checks in NovaCore, and preserve one reasoning loop. Read docs/ARCHITECTURE.md for module ownership. Add meaningful tests for permissions, recovery, cross-owner isolation and observed behavior. Do not check in credentials, dependency directories, generated runtime or local databases.

Update docs/CAPABILITIES.md when a capability or verification boundary changes. Describe the resulting behavior and observed checks in pull requests. Native account setup and hardware verification must be labeled separately from simulated tests and installer builds.
