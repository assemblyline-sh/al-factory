# Contributing to al-factory

Thanks for helping. Bug reports and pull requests are welcome.

## Before you open an issue

- Run with `DEBUG=1` and include the command and output.
- **Remove secrets first.** Never paste `ORCHESTRATOR_API_KEY`, `ORCHESTRATOR_API_SECRET` or
  other credentials from your `.env`. Replace business data in workpieces with placeholders.
- Say which `@assemblyline/lib-factory` version your factory repo uses (see its `package.json`).

## Development

```bash
npm install
npm test          # jest (ESM)
```

- Source is plain JavaScript (ES modules) with JSDoc types.
- Each CLI command lives in `src/cli/<resource>/<action>.js`, with tests in `tests/cli/<resource>/`.
- al-factory works on the current directory's factory repository (`src/steps`, `temp/`,
  `.orchestrator/`). Tests use fixtures; they never call an Orchestrator.

## Pull requests

- One change per pull request, with tests.
- Add a line under `## [Unreleased]` in `CHANGELOG.md`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:` …).

By contributing, you agree that your contributions are licensed under the Apache-2.0 license.
