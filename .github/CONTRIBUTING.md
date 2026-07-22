# Contributing to openapi-to-mcp

Thanks for considering a contribution. The most valuable ones are usually small:
a real OpenAPI spec that doesn't map the way you'd expect, with a test that
reproduces it. Edge cases in schema conversion are where this tool lives or dies.

## Requirements

- **Node.js ≥ 20** (the CI matrix runs 20 and 22).
- npm (the repo uses `package-lock.json`; use `npm ci` for reproducible installs).

## Getting started

```bash
git clone https://github.com/Karlangas12/openapi-to-mcp.git
cd openapi-to-mcp
npm ci
npm test
```

## Before you open a pull request

Run the full quality gate locally — the same one CI runs:

```bash
npm run typecheck   # strict TypeScript, no errors allowed
npm test            # the whole suite must stay green
npm run build       # must compile cleanly
```

## Ground rules

- **Strict TypeScript, no exceptions.** `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes` and `noUnusedLocals` are on. An array index is
  `T | undefined`; handle it.
- **Every new feature or bug fix ships with tests.** A change to schema
  conversion or tool mapping must come with a test case — ideally derived from a
  **real** spec, not a synthetic one.
- **Keep dependencies light.** The runtime has exactly two (`zod`, `yaml`).
  Adding a third needs a strong justification in the PR description — a big
  OpenAPI parser is exactly what this project avoids on purpose.
- **Inject side effects.** HTTP goes through an injectable `fetch`; do the same
  for anything that touches the network, the clock or the filesystem, so it stays
  testable.

## Commit style

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new mapping capability, transport, or CLI option
- `fix:` a bug fix or a schema-conversion correction
- `perf:` a performance improvement
- `docs:` documentation only
- `test:` tests only
- `chore:` tooling, CI, dependencies

Example: `feat(schema): map multipart/form-data request bodies`

## Reporting security vulnerabilities

**Do not open a public issue for a vulnerability.** See
[SECURITY.md](SECURITY.md) for private disclosure.
