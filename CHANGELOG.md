# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-19

First release as `@assemblyline/al-factory`, forked from `@finopsbricks/fob-worker` 2.1.0.
Entries below 0.1.0 are the history of `fob-worker`.

### Changed
- **BREAKING:** package `@assemblyline/al-factory`, binary `al-factory`.
- **BREAKING:** works on factory repos built on `@assemblyline/lib-factory`: detection,
  `steps run` and the conveyor checks look for `@assemblyline/lib-factory` and
  `lib-factory:move_files`.
- **BREAKING:** `config show` reports `FACTORY_LOCATION`.
- `procs` manages factory sessions; `procs list` has a `FACTORY` column.
- Help, errors and docs use the factory vocabulary and point at `al-orc` and
  assemblyline.sh.

### Removed
- `steps run` no longer adds `item_snapshot` to the local task, and passes `org_id: 'local'`
  instead of the location.

## [2.1.0] - 2026-10-03

First public release. Docs: https://finopsbricks.com/docs/workers

### Added
- Line files: `fob-worker lines list` shows NAME and LOCATION columns from `.orchestrator/lines/<CODE>.json` (written by `fob-orc lines pull`) and lists a line that has a file but no stations yet; `fob-worker lines show` prints the line's name, location and description. `--json` output for both now nests `{ name, location, stations }` / `{ line, stations }`. Library: `listLocalLines()` / `getLinesDir()` in `src/utils/station-files.js`.
- `--help` links the docs and the fob-worker page.

### Fixed
- `--json` output is parseable: the `====` separator lines are no longer printed with `--json`, and `lines list --json` and `workpieces list --json` print JSON (not a message) when there's nothing to show.
- `import '@finopsbricks/fob-worker'` no longer throws (the entry re-exported a missing `src/cli.js`).
- `--version` prints fob-worker's version, not the version of the project it's run in.
- Unknown commands and actions exit 1 with an error instead of exiting 0 silently.
- `config show` no longer prints any characters of `ORCHESTRATOR_API_KEY` or `ORCHESTRATOR_API_SECRET`; it shows `*** (set)`.
- Hints that named retired commands (`fob steps list`, `fob stations pull`, `fob workers stop`, …) now name the current ones (`fob-worker …`, `fob-orc …`).
- `workpieces list`, `show` and `watch` show event times in local time, with the zone in the header. They printed UTC with no label.
- "No lines found" messages say where lines come from (`.orchestrator/stations/`) and how to fetch them.
- The test suite passes again (it had 36 failures from the line-file and `discoverSteps()` changes).

## [2.0.0] - 2026-08-31

### Changed
- **BREAKING:** Split from `@fob/cli-fob` (binary `fob`). This package is now `@finopsbricks/fob-worker` (binary `fob-worker`), the machine-local half: steps, lines, stations status, workpieces, procs and config. Station definitions, work records, tags, supporting docs and orchestrator status moved to [`fob-orc`](https://www.npmjs.com/package/@finopsbricks/fob-orc).
- **BREAKING:** The pm2 resource `workers` is renamed `procs`.
- **BREAKING:** `steps run --item` is removed; fob-worker makes no Orchestrator API calls.
- `LineState.bins[station][bin]` is now `Map<id, subpath>` instead of `Set<id>`. Consumers that iterate ids should use `.keys()`; `.size` and `.has()` keep working unchanged.
- `workpieceDir()` uses `pos.subpath` when set so sub-bin layouts resolve correctly.
- `fob-worker workpieces list` and `fob-worker stations status` show the sub-bin path when a workpiece lives under one (e.g. `HI3/output/invoices` in `POSITION`).
- Help output: each command's own options now render under `Options:` above a dedicated `Global Options:` group (`--help`, `--version`), instead of being interleaved. Help text only — no behavior change.

### Added
- `--watch [--interval=N]` flag on `fob-worker lines status` and `fob-worker stations status`. Re-renders the snapshot in place on the main screen (cursor-home + erase-to-end, no scrollback pollution; last frame stays visible after Ctrl-C). Default interval 1s. Mutually exclusive with `--json` (one-shot format). Shared helper lives in `src/utils/watch-render.js`.
- `scanBinWorkpieces(bin_dir)` in `src/utils/line-state.js` — walks a bin tree (up to `MAX_BIN_DEPTH` = 4) and treats any directory containing `pointer.json` as a workpiece. Lets workpieces live under typed sub-bins (`output/invoices/`, `output/PO/`, `output/MSA/`) while keeping the workpiece-id namespace flat.
- `Position.subpath` — the path from a bin root to the workpiece directory. Equals the workpiece id for flat layouts; carries the sub-bin segment for nested layouts (e.g. `'invoices/hi-1__NT-001'`).
- `collectIdsForBin()` now accepts an optional `STATION/BIN/SUBPATH` form (e.g. `HI3/output/invoices`) to narrow to a specific sub-bin.

### Fixed
- `procs` detects workers on Linux as well as macOS.
- Timestamps render in local time, not UTC.
- Shell completion completes partial words and no longer includes step-discovery log output.
- Station short_codes are shown instead of raw ids.
- Help output wraps to the terminal width.

## [1.0.1] - 2026-06-11

### Removed
- **BREAKING:** `.orchestrator/processes/` read fallback in `station-files.js`. Worker repos that haven't re-pulled since the 1.0.0 rename must run `fob stations pull --all` — `loadStation()` now returns `null` for files only present in the legacy directory.

## [1.0.0] - 2026-06-11

First stable release. The CLI surface and on-disk layout are now considered stable; future breaking changes will follow strict semver.

### Added
- Legacy `.orchestrator/processes/` directory continues to be read as a fallback so worker repos that pulled before this release keep working. Writes always go to `.orchestrator/stations/`. (Removed in the next release — see [Unreleased].)

### Changed
- **BREAKING:** Hard rename of the CLI's user-facing vocabulary from "process" to "station". The orchestrator HTTP API and database keep "process" — only the CLI side renames.
- **BREAKING:** `fob processes <action>` is removed. Use `fob stations <action>` (no alias).
- **BREAKING:** `fob steps run --process` → `--station`. `-p` and `-s` aliases dropped (the latter collided with `--scenario`).
- **BREAKING:** `fob work-records list --process` → `--station`. `-s` alias dropped (collided with `--status`).
- **BREAKING:** `fob items show --processes` → `--stations`.
- Source layout: `src/cli/processes/` → `src/cli/stations/`; `src/utils/process-files.js` → `src/utils/station-files.js`. JS symbols in `src/utils/orchestrator.js` renamed to match (`listProcesses`→`listStations`, etc.); the HTTP path strings (`/api/v1/processes/*`) and URL segments passed to `setEntityTags` keep the API contract wording.
- Docs renamed: `docs/usage/process-sync.md` → `station-sync.md`; `docs/architecture/process-files-layout.md` → `station-files-layout.md`. README, CLAUDE.md, and every other doc updated to match.

### Fixed
- `update-step-metadata.test.js` was mocking `config.stepsPath` while the handler reads `config.stepsDir` — pre-existing bug surfaced and fixed while threading the rename through.
- `steps/run.test.js` mocked `@fob/lib-worker` directly, bypassing the runtime `lib-worker-loader.js`. Mock now matches the loader the handler actually uses.

### Removed
- **BREAKING:** `fob processes` command tree and the `process-files.js` module.

## [0.8.0] - 2026-06-08

### Added
- `fob stations {list,show,run,pull,push,edit,update-step-metadata}` — vocabulary alias of `fob processes`, same handlers with "station" vocab threaded through help/usage/error strings
- `fob lines list` and `fob lines show <LINE>` — group local station JSONs by `line` field, topo-sort by `dependencies`, surface conveyor topology from each station's `lib-worker:move_files` step
- `fob lines status [code]` — snapshot summary of line health (IN-FLIGHT / STUCK / FINISHED / HEALTH) or one-line drilldown
- `fob stations status <code>` (also reachable via `fob processes status`) — single-station bin drilldown
- `fob workpieces {list,show}` — workpiece resource with `--line`, `--bin`, `--match` scoping; `show` resolving to >1 substring matches auto-promotes to dashboard view
- `fob workpieces watch` — append-style live tail with per-id-tagged notices for moves, new log events, and a one-time ✓ finished notice
- `--force` flag on `fob processes push` — on 404 during PUT, falls back to POST with the same id so the server creates with the client-specified id (enables cross-environment upsert without ID drift)
- `.orchestrator/stations/{LINE}/` nested layout supported alongside legacy `.orchestrator/processes/` flat layout (push reads both)
- `src/utils/line-state.js` — CLI-scoped bin-walking helpers, topology resolution, shared `topoSortStations` indexed on both `short_code` and `id`
- `docs/usage/monitoring.md` — how-to walking through line-level and workpiece-level views with bin-semantics mental model
- Sections for `fob stations`, `fob lines`, and `fob workpieces` in `commands.md`
- Shell completion entries for `stations` and `lines`
- Tests: 36 new tests for line-state helpers, workpieces, and status/watch handlers

### Changed
- **BREAKING:** `STEP_PREFIX` env var renamed to `WORKER_LOCATION`
- **BREAKING:** `X-Step-Prefix` header renamed to `X-Location`
- `findPreviousStep` no longer assumes slash-prefixed slugs; tests updated for unprefixed slug format
- `saveProcess()` no longer constructs per-line subfolders — writes flat to `.orchestrator/stations/` when layout='stations' or `.orchestrator/processes/` when layout='processes'. Line membership lives in the JSON `line` key, not the folder.
- `fob processes push` reads both `.orchestrator/processes/` and `.orchestrator/stations/` layouts; `loadProcessByFilename()` and `finalizeNewProcessFile()` accept either a bare filename or a relative path
- Docs handbook/engineering-standards references updated to new repo locations; absolute paths stripped

### Fixed
- `fob lines list/show/status` now agree on station ordering — all three commands source topology from `.orchestrator/stations/*.json` and use the shared `topoSortStations` so id-based dependency edges resolve correctly
- `fob lines show --json` matches the table's dependency ordering (previously dumped alphabetical-file order while the table was topo-sorted)
- `collectIdsForBin` no longer rejects valid station codes — `fob workpieces list --bin AP3b/failed`, `TR1`, `P10`, etc. now parse
- `fob processes show` and `fob stations show` print a hint that matches the plural the user typed (previously both said `fob stations status …`)

### Removed
- **BREAKING:** `--state` flag on `fob lines list/show`, `fob stations show`, `fob processes show` — replaced by the `status` verb (`fob lines status`, `fob stations status`)
- **BREAKING:** `--watch` flag on `fob workpieces list/show` — replaced by `fob workpieces watch` verb
- `X-Worker-Type` header from worker config (orchestrator no longer uses it; task routing uses `X-Step-Prefix` / now `X-Location` only)

## [0.7.1] - 2026-03-22

### Fixed
- `fob processes push` now uses JSON content (`id` field presence) instead of filename to decide create vs update

## [0.7.0] - 2026-03-20

### Added
- `fob work-records cancel` command — cancel work records from the CLI
- Config-based step discovery — steps are now discovered from config files instead of requiring a manual `index.js` registry

### Changed
- `fob steps list` now sorted by folder then filename
- `fob steps list` uses `_file` from step discovery for folder/file columns
- Updated txn app references to "statements" in docs

## [0.6.0] - 2026-03-17

### Added
- Tag management commands: `fob tags list`, `fob tags create`, `fob tags edit`, `fob tags delete`
- Tag filtering on `fob processes list` and `fob work-records list` via `--tag` option
- Shared tag editing for `fob items edit` and `fob work-records edit`
- `fob processes edit` command
- `fob items edit` and `fob work-records edit` commands
- Process `short_code` support — use short codes instead of full IDs throughout CLI
- Dependency `short_code` resolution on `fob processes push` and `fob processes pull`
- `fob processes push` now supports create-or-update (creates process if it doesn't exist)
- `src/utils/lib-worker-loader.js` — runtime resolution of `@fob/lib-worker` from worker's `node_modules/`
- `src/utils/tags.js` — tag name/ID resolution helpers
- Tests for all new commands and utilities

### Changed
- `@fob/lib-worker` removed as direct CLI dependency, now resolved at runtime from worker's `node_modules/` to avoid dual-module-instance bug
- Docs restructured: new `cli-design-style.md`, updated README, reorganized usage docs

## [0.5.1] - 2026-03-02

### Changed
- Separator lines (`====`) are now printed centrally via a `withSeparator` wrapper in `index.js` rather than inside each handler
- Removed orchestrator config dump (URL, org, API key) from the top of `processes list`, `work-records list`, and `worker status` output
- Internal cleanup of `orchestrator.js` and `config.js`

## [0.5.0] - 2026-03-02

### Added
- Comprehensive test suite — unit tests for all `src/utils/` modules (47 tests) with AAA pattern, 80% coverage thresholds, and GitHub Actions CI
- gh-style handler tests for all 11 CLI command handlers (44 tests) — dependencies mocked at module boundary, `captureOutput` helper captures stdout/stderr, `ExitError` halts execution on `process.exit` for assertable exit codes
- `src/utils/picker.js` — `interactivePicker` extracted as a standalone utility
- `getStepSlugs()` exported from `src/utils/steps-loader.js`

### Changed
- Refactored `src/cli.js` (~1000 lines) into `src/cli/` folder structure that mirrors the CLI command tree — each handler in its own file (e.g. `fob processes pull` → `src/cli/processes/pull.js`)
- Simplified CLI environment variable configuration
- Auth and worker status connection handling improvements

## [0.4.0] - 2026-03-02

### Changed
- Worker endpoints now authenticate with `ORCHESTRATOR_API_KEY` and `ORCHESTRATOR_API_SECRET` instead of `WORKER_SECRET`
- Replaced `WORKER_ORG` env var with `STEP_PREFIX` for step namespace identification
- Upgraded `@fob/lib-worker` to v0.6.0

### Removed
- `WORKER_SECRET` environment variable support
- `WORKER_ORG` environment variable support
- `orchestrator.url` and `orchestrator.org` keys from `.fob.json` config (orchestrator URL now read directly from `ORCHESTRATOR_URL` env var only)
- `FOB_TXN_API_URL` and `TXN_ORG_ID` from relevant env vars display

## [0.3.0] - 2026-03-02

### Added
- Extensive architecture documentation: config-resolution, module-structure, steps-loading, task-construction, template-resolution
- Usage documentation: configuration, installation, process-sync, running-steps, scenarios

### Changed
- Orchestrator connection (`ORCHESTRATOR_URL`, `WORKER_ORG`) now read directly from environment variables instead of `.fob.json` config — remove `orchestrator` keys from `.fob.json` if present
- `fob config init` no longer prompts for orchestrator URL or org
- `getRelevantEnvVars` no longer includes `FOB_TXN_API_URL` / `TXN_ORG_ID`
- Upgraded `@fob/lib-worker` to v0.5.0
- README substantially expanded with usage examples and architecture overview

### Fixed

### Removed
- `orchestrator.url` and `orchestrator.org` config defaults from `.fob.json` schema
- Env var config layer for `ORCHESTRATOR_URL` and `WORKER_ORG` (now read directly)

## [0.2.1] - 2026-02-24

### Changed
- Replaced local `resolveTemplates` with `resolveConfig` from `@fob/lib-worker` for template resolution
- Template resolution now uses `step_outputs` context instead of `tempDir` for better orchestrator compatibility
- Updated README documentation

## [0.2.0] - 2026-02-24

### Added
- Initial CLI implementation with `fob steps list` and `fob steps run` commands
- Template resolution for config files (`{{env.VAR}}`, `{{step/slug.field}}`)
- Shell completion support via yargs for bash/zsh (`fob completion`)
- Config commands: `fob config show` and `fob config init`
- Orchestrator integration commands:
  - `fob processes list/show` - view processes from orchestrator
  - `fob work-records list/show` - view work records with filters (`--limit`, `--status`, `--process`)
  - `fob worker status` - check orchestrator connectivity
- API client with dual auth support (Worker endpoints and V1 API endpoints)
- Folder and file columns in `fob steps list` output for readability
- Steps loader module for dynamic step imports from worker repos
- Task structure matching orchestrator's Task typedef (`step.config`, `work_record.step_outputs`)
- Documentation: README, CLI pattern rationale, task structure docs

### Changed
- Deduplicated `createHandler` by importing from `@fob/lib-worker`
- Refactored to resource + action pattern for consistency and expandability
