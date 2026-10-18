import { loadLineState } from '../../utils/line-state.js';
import {
  selectBins,
  shouldWipeIntakeRegistry,
  buildTargets,
  renderPreview,
  wipeTargets,
  confirmWipe,
} from '../shared/empty-bins.js';

const USAGE = 'Usage: al-factory lines empty-bins <line> [--all | --all-bins | --input | --doing | --output | --failed | --done | --intake-registry] [--yes]';

/**
 * `al-factory lines empty-bins <LINE>` — wipe selected bin dirs (and optionally
 * intake-registry.jsonl) across every station in the line. Same primitives
 * as the station handler — just a wider Y axis.
 */
export async function emptyBinsLineHandler(argv) {
  const { line: line_arg } = argv;

  if (!line_arg) {
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
  const line_state = lines[line_arg];
  if (!line_state) {
    const available = Object.keys(lines).sort().join(', ') || '(none)';
    console.error(`Line "${line_arg}" not found. Available: ${available}`);
    process.exit(1);
  }

  const targets = buildTargets({
    stations: line_state.stations,
    bins,
    intake_registry,
    line_state,
  });
  renderPreview('Line', line_arg, targets);

  if (targets.every((t) => !t.exists)) {
    console.log('\nNothing to remove.');
    return;
  }

  try {
    const ok = await confirmWipe(argv, `Wipe selected state across line ${line_arg}?`);
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
  console.log(`\nRemoved ${removed} item${removed === 1 ? '' : 's'} across line ${line_arg}.`);
}
