# fob-worker

> **Assembly Line fork** of `~/ec2code/finopsbricks/cli/fob-worker` (remote `finopsbricks`), being converted per `engine-fork.md` in the assemblyline.sh repo. Workspace rules: `~/ec2code/assemblyline/CLAUDE.md`.

Run and debug [FinOpsBricks Orchestrator](https://orchestrator.finopsbricks.com) worker steps on your own machine, and see what's sitting in each station's bins.

```bash
fob-worker steps run IN1_01_count --scenario two-invoices
fob-worker lines status IN
fob-worker workpieces show 2026-10-03-acme
```

**Beta.** [Docs](https://finopsbricks.com/docs/workers) · [About](https://finopsbricks.com/cli/fob-worker) · [Changelog](CHANGELOG.md)

## What you need

fob-worker works inside a **worker repo**: a Node.js project that runs your steps for the Orchestrator.

- **An Orchestrator account**, to run the worker for real: [sign up](https://console.finopsbricks.com/signup), then create an organisation in the [Orchestrator](https://orchestrator.finopsbricks.com/orgs). Running steps locally needs no account.
- **A worker repo** built on [`@fob/lib-worker`](https://github.com/finopsbricks/lib-worker). Start from [worker-template](https://github.com/finopsbricks/worker-template).
- **Node.js 18 or later.**
- [`fob-orc`](https://www.npmjs.com/package/@finopsbricks/fob-orc), to pull and push station definitions.
- For `fob-worker procs` only: macOS or Linux, and [pm2](https://pm2.keymetrics.io/) installed globally.

## Install

```bash
npm install -g @finopsbricks/fob-worker
fob-worker --version
```

## First run

From the root of a worker repo, after `npm install`:

```bash
fob-worker steps list                 # the steps under src/steps/
fob-worker steps run <slug> --empty   # run one with an empty config
```

The output is printed and saved to `temp/<slug>.json`, where the next step you run picks it up as `step_outputs`. Without `--empty`, `--station` or `--scenario`, fob-worker asks which config to use: one from a station that includes the step, a saved scenario, or none.

See [Get started](https://finopsbricks.com/docs/workers/get-started) for the full walkthrough from the template.

## Commands

| Command | What it does |
| --- | --- |
| `steps list`, `steps run` | List the worker's steps; run one locally |
| `lines list`, `lines show`, `lines status` | Lines and their stations from `.orchestrator/`; live bin counts from `temp/stations/` |
| `stations status` | One station's bins and the workpieces in them |
| `workpieces list`, `show`, `watch` | Where each workpiece is, its journey, a live tail |
| `lines empty-bins`, `stations empty-bins` | Clear bins (asks first) |
| `procs list`, `start`, `stop`, `restart`, `logs`, `monit` | Run the worker under pm2 on this machine |
| `config show` | Paths and which environment variables are set |

Add `--json` to list and status commands for machine-readable output. `fob-worker <resource> <action> --help` shows every option.

fob-worker reads local files only. It never calls the Orchestrator; `fob-orc` does that.

## Use as a library

```js
import { loadConfig, loadSteps } from '@finopsbricks/fob-worker';

const steps = await loadSteps(loadConfig().stepsDir); // slug → step definition
```

## Beta limits

- `steps run` builds a local task with no item (`item_snapshot` is `null`), so steps that read the item need a scenario or station config that supplies what they need.
- `steps run` output is for people, not scripts.
- `lines` and `stations` show what `fob-orc` last pulled; there's no live view of the Orchestrator.
- `procs` is macOS and Linux only and manages workers started with pm2.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues as described in [SECURITY.md](SECURITY.md).

## License

Apache-2.0
