# al-factory

Run and debug [Assembly Line](https://assemblyline.sh) factory steps on your own machine,
see what's sitting in each station's bins, and run factory sessions under pm2.

```bash
al-factory steps run EX1_01_count_words --empty
al-factory lines status EX
al-factory workpieces show stations
```

**Beta.** [Docs](https://assemblyline.sh/docs) · [About](https://assemblyline.sh) · [Changelog](CHANGELOG.md)

## What you need

al-factory works inside a **factory repo**: a Node.js project holding your lines, stations
and steps.

- **A factory repo** built on [`@assemblyline/lib-factory`](https://github.com/assemblyline-sh/lib-factory).
  Start from [factory-template](https://github.com/assemblyline-sh/factory-template).
- **Node.js 18 or later.**
- **An Orchestrator account**, only to run the factory for real at
  [orchestrator.assemblyline.sh](https://orchestrator.assemblyline.sh). Running steps locally
  needs no account.
- [`al-orc`](https://www.npmjs.com/package/@assemblyline/al-orc), to push and pull line and
  station definitions.
- For `al-factory procs` only: macOS or Linux, and [pm2](https://pm2.keymetrics.io/) installed
  globally.

## Install

```bash
npm install -g @assemblyline/al-factory
al-factory --version
```

## First run

From the root of a factory repo, after `npm install`:

```bash
al-factory steps list                 # the steps under src/steps/
al-factory steps run <slug> --empty   # run one with an empty config
```

The output is printed and saved to `temp/<slug>.json`, where the next step you run picks it
up as `step_outputs`. Without `--empty`, `--station` or `--scenario`, al-factory asks which
config to use: one from a station that includes the step, a saved scenario, or none.

## Commands

| Command | What it does |
| --- | --- |
| `steps list`, `steps run` | List the factory's steps; run one locally |
| `lines list`, `lines show`, `lines status` | Lines and their stations from `.orchestrator/`; live bin counts from `temp/stations/` |
| `stations status` | One station's bins and the workpieces in them |
| `workpieces list`, `show`, `watch` | Where each workpiece is, its journey, a live tail |
| `lines empty-bins`, `stations empty-bins` | Clear bins (asks first) |
| `procs list`, `start`, `stop`, `restart`, `logs`, `monit` | Run factory sessions under pm2 on this machine |
| `config show` | Paths and which environment variables are set |

Add `--json` to list and status commands for machine-readable output.
`al-factory <resource> <action> --help` shows every option.

al-factory reads local files only. It never calls the Orchestrator; `al-orc` does that.

## Use as a library

```js
import { loadConfig, loadSteps } from '@assemblyline/al-factory';

const steps = await loadSteps(loadConfig().stepsDir); // slug → step definition
```

## Beta limits

- `steps run` output is for people, not scripts.
- `lines` and `stations` show what `al-orc` last pulled; there's no live view of the
  Orchestrator.
- `procs` is macOS and Linux only and manages factory sessions started with pm2.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues as described in
[SECURITY.md](SECURITY.md).

## License

Apache-2.0
