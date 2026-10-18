import { loadLineState } from '../../utils/line-state.js';
import {
  selectBins,
  shouldWipeIntakeRegistry,
  buildTargets,
  renderPreview,
  wipeTargets,
  confirmWipe,
} from '../shared/empty-bins.js';

const USAGE = 'Usage: al-factory stations empty-bins <short_code> [--all | --all-bins | --input | --doing | --output | --failed | --done | --intake-registry] [--yes]';

/**
 * `al-factory stations empty-bins <short_code>` — wipe selected bin dirs (and
 * optionally the intake-registry.jsonl) under temp/stations/<STATION>/.
 *
 * Resolves the station against the loaded line state so we share the same
 * topology source as `al-factory stations status`.
 */
export async function emptyBinsStationHandler(argv) {
  const { id } = argv;

  if (!id) {
    console.error(USAGE);
    process.exit(1);
  }

  const bins = selectBins(argv);
  const intake_registry = shouldWipeIntakeRegistry(argv);
  if (bins.length === 0 && !intake_registry) {
    console.error(USAGE);
    console.error('Specify --all, --all-bins, --intake-registry, or one of: --input --doing --output --failed --done');
    process.exit(1);
  }

  const lines = loadLineState();
  let line_state = null;
  for (const ls of Object.values(lines)) {
    if (ls.stations.includes(id)) { line_state = ls; break; }
  }
  if (!line_state) {
    console.error(`No station "${id}" on disk under temp/stations/.`);
    console.error('Pass the station short_code (e.g. IG0). Run `al-factory lines status` to see active lines.');
    process.exit(1);
  }

  const targets = buildTargets({ stations: [id], bins, intake_registry, line_state });
  renderPreview('Station', id, targets);

  if (targets.every((t) => !t.exists)) {
    console.log('\nNothing to remove.');
    return;
  }

  try {
    const ok = await confirmWipe(argv, `Wipe selected state on ${id}?`);
    if (!ok) {
      console.log('Cancelled.');
      return;
    }
  } catch (error) {
    if (error.name === 'ExitPromptError') {
      console.log('Cancelled.');
      return;
    }
    throw error;
  }

  const removed = wipeTargets(targets);
  console.log(`\nRemoved ${removed} item${removed === 1 ? '' : 's'} on ${id}.`);
}
