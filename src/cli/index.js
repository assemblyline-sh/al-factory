/**
 * CLI entry point using yargs — the LOCAL factory plane.
 *
 * Pattern: al-factory <resource> <action> [target] [options]
 *
 * This is the machine-local half of the old `fob` CLI (FinOpsBricks): step execution, local
 * run-state (temp/stations/ → lines/workpieces/bins), and pm2 processes. The
 * orchestrator control plane (canonical station defs, work records, tags,
 * supporting docs) now lives in the sibling `al-orc` CLI / `@assemblyline/al-orc` client.
 */

import { readFileSync } from 'node:fs';
import yargs from 'yargs';
import 'dotenv/config';

import { DOCS_URL, LANDING_URL } from '../links.js';

import { localOptions } from './_helpers.js';

import { showConfigHandler } from './config/show.js';
import { updateStepMetadataHandler } from './stations/update-step-metadata.js';
import { listSessionsHandler } from './procs/list.js';
import { startSessionHandler } from './procs/start.js';
import { stopSessionHandler } from './procs/stop.js';
import { restartSessionHandler } from './procs/restart.js';
import { logsSessionHandler } from './procs/logs.js';
import { monitSessionsHandler } from './procs/monit.js';
import { listStepsHandler } from './steps/list.js';
import { runStepHandler } from './steps/run.js';
import { listLinesHandler } from './lines/list.js';
import { showLineHandler } from './lines/show.js';
import { statusLineHandler } from './lines/status.js';
import { emptyBinsLineHandler } from './lines/empty-bins.js';
import { statusStationHandler } from './stations/status.js';
import { emptyBinsStationHandler } from './stations/empty-bins.js';
import { listWorkpiecesHandler } from './workpieces/list.js';
import { showWorkpieceHandler } from './workpieces/show.js';
import { watchHandler } from './workpieces/watch.js';
import { getStepSlugs } from '../utils/steps-loader.js';

// Read our own package.json: yargs' default --version looks for the nearest
// package.json from the working directory, which is the host project's when
// al-factory is installed as a dependency.
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

/**
 * Frame human output with separator lines. `--json` output is left bare so it
 * stays parseable.
 */
function withSeparator(handler) {
  return async (argv) => {
    if (argv.json) return handler(argv);
    console.log('='.repeat(60));
    await handler(argv);
    console.log('='.repeat(60));
  };
}

/**
 * Bin-selector flags shared by `al-factory stations empty-bins` and
 * `al-factory lines empty-bins`. Kept in one place so the two stay in sync.
 */
function withBinSelectorFlags(yargs) {
  return localOptions(yargs)
    .option('all', { describe: 'Wipe all 5 bins AND the intake-registry (full reset)', type: 'boolean' })
    .option('all-bins', { describe: 'Wipe all 5 bins; leave the intake-registry intact', type: 'boolean' })
    .option('input', { describe: 'Empty the input bin', type: 'boolean' })
    .option('doing', { describe: 'Empty the doing bin', type: 'boolean' })
    .option('output', { describe: 'Empty the output bin', type: 'boolean' })
    .option('failed', { describe: 'Empty the failed bin', type: 'boolean' })
    .option('done', { describe: 'Empty the done (archive) bin', type: 'boolean' })
    .option('intake-registry', { describe: 'Delete intake-registry.jsonl (line-head allocation log)', type: 'boolean' })
    .option('yes', { alias: 'y', describe: 'Skip the confirmation prompt', type: 'boolean' });
}

/**
 * Build the subcommand tree for `al-factory stations` — LOCAL run-state only.
 * (Canonical station definitions live in `al-orc stations`.)
 */
function buildStationSubcommands(yargs) {
  return yargs
    .usage('$0 stations <action> [options]')
    .command(
      'status [id]',
      'Snapshot of live bin state for one station (reads temp/stations/)',
      (yargs) => {
        return localOptions(
          yargs.positional('id', { describe: 'Station short_code (e.g. VM3)', type: 'string' })
        )
          .option('json', { describe: 'Output raw JSON', type: 'boolean' })
          .option('watch', { alias: 'w', describe: 'Re-render on an interval (clear-screen between frames). Mutually exclusive with --json.', type: 'boolean' })
          .option('interval', { describe: 'Watch refresh interval in seconds (default 1)', type: 'number' });
      },
      (argv) => {
        if (argv.getYargsCompletions) return;
        if (!argv.id) {
          console.error('Usage: al-factory stations status <short_code>');
          console.error('Pass the station short_code (e.g. VM3). Run "al-factory lines status" to see active lines.');
          process.exit(1);
        }
        return withSeparator(statusStationHandler)(argv);
      },
    )
    .command(
      'empty-bins [id]',
      'Wipe selected bin directories under temp/stations/<STATION>/ (destructive)',
      (yargs) => {
        return withBinSelectorFlags(
          yargs.positional('id', { describe: 'Station short_code (e.g. IG0)', type: 'string' })
        );
      },
      (argv) => {
        if (argv.getYargsCompletions) return;
        if (!argv.id) {
          console.error('Usage: al-factory stations empty-bins <short_code> [--all | --input | --doing | --output | --failed | --done] [--yes]');
          console.error('Run "al-factory stations status <short_code>" to preview bin contents first.');
          process.exit(1);
        }
        return withSeparator(emptyBinsStationHandler)(argv);
      },
    )
    .command(
      'update-step-metadata',
      'Update step name/description in local station files from code',
      {},
      withSeparator(updateStepMetadataHandler),
    )
    .demandCommand(1, 'Specify an action: status, empty-bins, update-step-metadata');
}

/**
 * Build and run CLI
 */
export function run(args) {
  const cli = yargs(args)
    .scriptName('al-factory')
    .usage('$0 <resource> <action> [options]')
    .command('lines', 'Inspect assembly lines (config + live state)', (yargs) => {
      return yargs
        .usage('$0 lines <action> [options]')
        .command(
          'list',
          'List lines grouped from local station files (definitional)',
          (yargs) => localOptions(yargs).option('json', { describe: 'Output raw JSON', type: 'boolean' }),
          withSeparator(listLinesHandler),
        )
        .command(
          'show [line]',
          'Show line config: stations in dependency order + conveyor topology (definitional)',
          (yargs) => {
            return localOptions(
              yargs.positional('line', { describe: 'Line code (e.g. VM, P8)', type: 'string' })
            )
              .option('json', { describe: 'Output raw JSON', type: 'boolean' });
          },
          (argv) => {
            if (argv.getYargsCompletions) return;
            if (!argv.line) {
              console.error('Usage: al-factory lines show <line>');
              console.error('Run "al-factory lines list" to see available lines.');
              console.error('For live bin state, use "al-factory lines status <line>".');
              process.exit(1);
            }
            return withSeparator(showLineHandler)(argv);
          },
        )
        .command(
          'status [line]',
          'Snapshot of live bin state (reads temp/stations/). No arg = per-line summary.',
          (yargs) => {
            return localOptions(
              yargs.positional('line', { describe: 'Line code to drill into (omit for cross-line summary)', type: 'string' })
            )
              .option('json', { describe: 'Output raw JSON', type: 'boolean' })
              .option('watch', { alias: 'w', describe: 'Re-render on an interval (clear-screen between frames). Mutually exclusive with --json.', type: 'boolean' })
              .option('interval', { describe: 'Watch refresh interval in seconds (default 1)', type: 'number' });
          },
          withSeparator(statusLineHandler),
        )
        .command(
          'empty-bins [line]',
          'Wipe selected bin directories across every station in a line (destructive)',
          (yargs) => {
            return withBinSelectorFlags(
              yargs.positional('line', { describe: 'Line code (e.g. IG, HI)', type: 'string' })
            );
          },
          (argv) => {
            if (argv.getYargsCompletions) return;
            if (!argv.line) {
              console.error('Usage: al-factory lines empty-bins <line> [--all | --input | --doing | --output | --failed | --done] [--yes]');
              console.error('Run "al-factory lines status <line>" to preview bin contents first.');
              process.exit(1);
            }
            return withSeparator(emptyBinsLineHandler)(argv);
          },
        )
        .demandCommand(1, 'Specify an action: list, show, status, empty-bins');
    })
    .command('stations', 'Inspect local station run-state (temp/stations/)', (yargs) =>
      buildStationSubcommands(yargs),
    )
    .command('steps', 'Work with step handlers', (yargs) => {
      return yargs
        .usage('$0 steps <action> [options]')
        .command('list', 'List available steps', {}, withSeparator(listStepsHandler))
        .command(
          'run [slug]',
          'Run a step locally',
          (yargs) => {
            return localOptions(
              yargs.positional('slug', {
                describe: 'Step slug (e.g. IN1_01_count)',
                type: 'string',
              })
            )
              .option('station', {
                describe: 'Use config from this station',
                type: 'string',
              })
              .option('scenario', {
                alias: 's',
                describe: 'Use config from this scenario',
                type: 'string',
              })
              .option('empty', {
                alias: 'e',
                describe: 'Use empty config (no picker)',
                type: 'boolean',
              });
          },
          (argv) => {
            if (argv.getYargsCompletions) return;

            if (!argv.slug) {
              console.error('Usage: al-factory steps run <slug>');
              console.error('Run "al-factory steps list" to see available steps');
              process.exit(1);
            }
            return withSeparator(runStepHandler)(argv);
          }
        )
        .demandCommand(1, 'Specify an action: list, run');
    })
    .command('workpieces', 'Inspect workpieces on the filesystem (temp/stations/)', (yargs) => {
      return yargs
        .usage('$0 workpieces <action> [options]')
        .command(
          'list',
          'Snapshot dashboard of workpieces on disk',
          (yargs) => localOptions(yargs)
            .option('line', { describe: 'Scope to a single line (e.g. VM)', type: 'string' })
            .option('bin', { describe: 'Scope to a specific bin (STATION/BIN, e.g. VM3/failed)', type: 'string' })
            .option('match', { describe: 'Substring filter on workpiece id', type: 'string' })
            .option('json', { describe: 'Output raw JSON', type: 'boolean' }),
          withSeparator(listWorkpiecesHandler),
        )
        .command(
          'show [id]',
          'Deep view of one workpiece (substring matching >1 promotes to dashboard)',
          (yargs) => {
            return localOptions(
              yargs.positional('id', { describe: 'Workpiece id (exact or substring)', type: 'string' })
            )
              .option('json', { describe: 'Output raw JSON', type: 'boolean' });
          },
          (argv) => {
            if (argv.getYargsCompletions) return;
            if (!argv.id) {
              console.error('Usage: al-factory workpieces show <id-or-substring>');
              console.error('Run "al-factory workpieces list" to see workpieces on disk.');
              console.error('For live tail, use "al-factory workpieces watch <id>".');
              process.exit(1);
            }
            return withSeparator(showWorkpieceHandler)(argv);
          },
        )
        .command(
          'watch [id]',
          'Live tail: bin transitions and new log events as they happen',
          (yargs) => {
            return localOptions(
              yargs.positional('id', { describe: 'Workpiece id (exact or substring)', type: 'string' })
            )
              .option('line', { describe: 'Scope to a single line (mutually exclusive with --bin/--match)', type: 'string' })
              .option('bin', { describe: 'Scope to a specific bin (STATION/BIN)', type: 'string' })
              .option('match', { describe: 'Substring filter on workpiece id', type: 'string' })
              .option('interval', { describe: 'Poll interval in seconds (default 2)', type: 'number' });
          },
          withSeparator(watchHandler),
        )
        .demandCommand(1, 'Specify an action: list, show, watch');
    })
    .command('procs', 'Manage factory sessions on this machine (pm2)', (yargs) => {
      return yargs
        .usage('$0 procs <action>')
        .command(
          'list',
          'List factory sessions running on this machine',
          (yargs) => localOptions(yargs).option('json', { describe: 'Output raw JSON', type: 'boolean' }),
          withSeparator(listSessionsHandler),
        )
        .command(
          'start [target]',
          'Start a factory session under pm2',
          (yargs) => yargs.positional('target', { describe: 'Path to the factory repo (default: cwd)', type: 'string' }),
          withSeparator(startSessionHandler),
        )
        .command(
          'stop [target]',
          'Stop a pm2-managed factory session',
          (yargs) => yargs.positional('target', { describe: 'pm2 name or factory repo dirname (default: cwd)', type: 'string' }),
          withSeparator(stopSessionHandler),
        )
        .command(
          'restart [target]',
          'Restart a pm2-managed factory session',
          (yargs) => yargs.positional('target', { describe: 'pm2 name or factory repo dirname (default: cwd)', type: 'string' }),
          withSeparator(restartSessionHandler),
        )
        .command(
          'logs [target]',
          'Tail logs for a pm2-managed factory session',
          (yargs) => yargs.positional('target', { describe: 'pm2 name or factory repo dirname (default: cwd)', type: 'string' }),
          logsSessionHandler,
        )
        .command('monit', 'Interactive pm2 process monitor (CPU/RAM)', {}, monitSessionsHandler)
        .demandCommand(1, 'Specify an action: list, start, stop, restart, logs, monit');
    })
    .command('config', 'Show CLI configuration', (yargs) => {
      return yargs
        .usage('$0 config <action>')
        .command('show', 'Show resolved paths and environment variables', {}, withSeparator(showConfigHandler))
        .demandCommand(1, 'Specify an action: show');
    })
    .completion('completion', 'Generate shell completion script', function (current, argv) {
      // Actions available under each resource. Kept as data so every level
      // filters through the same path.
      const ACTIONS = {
        lines: ['list', 'show', 'status', 'empty-bins'],
        stations: ['status', 'empty-bins', 'update-step-metadata'],
        steps: ['list', 'run'],
        workpieces: ['list', 'show', 'watch'],
        procs: ['list', 'start', 'stop', 'restart', 'logs', 'monit'],
        config: ['show'],
      };
      const RESOURCES = Object.keys(ACTIONS);

      // argv._ includes the script name first, and — when the user is midway
      // through a word — the partial word last. `current` is that partial.
      // Drop it so `args` holds only *completed* words: without this,
      // `al-factory li<TAB>` yields args=['li'], which matches no level and
      // returns nothing (bare `<TAB>` worked only because '' was filtered out).
      const words = argv._.slice(1).filter((a) => a !== '');
      const args = current && words[words.length - 1] === current ? words.slice(0, -1) : words;

      const startsWithCurrent = (list) => (current ? list.filter((c) => c.startsWith(current)) : list);

      // Resource level (al-factory <tab>)
      if (args.length === 0) {
        return startsWithCurrent(RESOURCES);
      }

      // Action level (al-factory <resource> <tab>)
      if (args.length === 1) {
        return startsWithCurrent(ACTIONS[args[0]] ?? []);
      }

      // Step slugs (al-factory steps run <tab>) — the one dynamic source.
      if (args[0] === 'steps' && args[1] === 'run' && args.length === 2) {
        return getStepSlugs().then(startsWithCurrent);
      }

      return [];
    })
    .demandCommand(1, 'Specify a resource: lines, stations, steps, workpieces, procs, config')
    .strictCommands()
    .epilogue(`Docs: ${DOCS_URL}\nAbout: ${LANDING_URL}`)
    .help()
    .version(version)
    .alias('h', 'help')
    .alias('v', 'version')
    // Global options (inherited by every command) render under their own
    // heading; each command's own options stay under "Options:", shown first
    // via localOptions() in the command builders.
    .group(['help', 'version'], 'Global Options:')
    // Wrap to the terminal width so long descriptions hang-indent under the
    // description column instead of overflowing back to column 0.
    .wrap(process.stdout.columns || 100)
    .fail((msg, err, yargs) => {
      if (err) {
        console.error(`Error: ${err.message}`);
        if (process.env.DEBUG) console.error(err.stack);
      } else {
        console.error(msg);
        console.error('');
        yargs.showHelp();
      }
      process.exit(1);
    });

  cli.parse();
}
