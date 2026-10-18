# Module Structure

How the CLI modules fit together from entry point to execution.

## Entry Point

```
bin/al-factory.js  →  src/cli/index.js  →  src/cli/*/  →  src/utils/*
```

`bin/al-factory.js` is minimal — it only imports and calls `run()`:

```javascript
import { run } from '../src/cli/index.js';
run(hideBin(process.argv));
```

`src/index.js` is the package's library entry and re-exports `run`, `loadConfig`, `loadSteps` and `resolveTemplates`.

## src/cli/

The yargs command tree, shell completion, and `withSeparator()` wrapper live in `src/cli/index.js`. Each handler function lives in a resource subdirectory:

```
src/cli/
  index.js              # Command tree and completion
  steps/                # list.js, run.js
  stations/             # status.js, empty-bins.js, update-step-metadata.js
  lines/                # list.js, show.js, status.js, empty-bins.js
  workpieces/           # list.js, show.js, watch.js
  procs/                # list.js, start.js, stop.js, restart.js, logs.js, monit.js
  config/               # show.js
  shared/               # empty-bins.js (shared by stations/lines empty-bins)
```

Canonical station and line definitions, work records, tags and supporting docs are the Orchestrator's; their commands live in `al-orc`.

## src/utils/

| Module | Responsibility |
|--------|---------------|
| `config.js` | Resolve convention-based paths (stepsDir, tempDir) and the env vars `config show` prints |
| `steps-loader.js` | Discover the factory's steps with lib-factory's `discoverSteps()` |
| `lib-factory-loader.js` | Load `@assemblyline/lib-factory` from the factory's `node_modules/` at runtime |
| `output.js` | Read/write step outputs in `temp/` |
| `station-files.js` | Read/write station, line and scenario files in `.orchestrator/` |
| `line-state.js` | Live line/bin state: topology from station files, bins from `temp/stations/` |
| `factory-processes.js` | Detect locally-running factory sessions (direct or pm2-managed), via `ps`/`lsof`/`pm2 jlist` (macOS + Linux; cwd via `/proc` on Linux) |
| `format.js`, `watch-render.js`, `picker.js`, `templates.js` | Table/time formatting, `--watch` redraw, the interactive config picker, template resolution |

## External Dependencies

| Package | Used For |
|---------|----------|
| `yargs` | Command parsing and shell completion |
| `dotenv` | Load `.env` at startup |

### Runtime dependency (not in package.json)

| Package | Used For |
|---------|----------|
| `@assemblyline/lib-factory` | `initTemplates`, `resolveConfig`, `discoverSteps`, `createHandler` — loaded from the factory's `node_modules/` at runtime via `lib-factory-loader.js`. See [lib-factory Resolution](/docs/architecture/lib-factory-resolution.md). |

## Command → Handler Mapping

| Command | Handler | File |
|---------|---------|------|
| `al-factory steps list` | `listStepsHandler()` | `steps/list.js` |
| `al-factory steps run` | `runStepHandler()` | `steps/run.js` |
| `al-factory stations status` | `statusStationHandler()` | `stations/status.js` |
| `al-factory stations empty-bins` | `emptyBinsStationHandler()` | `stations/empty-bins.js` |
| `al-factory stations update-step-metadata` | `updateStepMetadataHandler()` | `stations/update-step-metadata.js` |
| `al-factory lines list/show/status/empty-bins` | `listLinesHandler()` / `showLineHandler()` / `statusLineHandler()` / `emptyBinsLineHandler()` | `lines/*.js` |
| `al-factory workpieces list/show/watch` | `listWorkpiecesHandler()` / `showWorkpieceHandler()` / `watchHandler()` | `workpieces/*.js` |
| `al-factory procs list/start/stop/restart/logs/monit` | `listSessionsHandler()` / `startSessionHandler()` / … / `monitSessionsHandler()` | `procs/*.js` |
| `al-factory config show` | `showConfigHandler()` | `config/show.js` |

## Related Notes

- [CLI Design Style Guide](/docs/cli-design-style.md)
- [Steps Loading](/docs/architecture/steps-loading.md)
- [Config Resolution](/docs/architecture/config-resolution.md)
- [Task Construction](/docs/architecture/task-construction.md)
