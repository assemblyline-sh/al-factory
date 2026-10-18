import fs from 'node:fs';
import path from 'node:path';

import { confirm } from '@inquirer/prompts';

import { ALL_BINS, defaultStationsRoot } from '../../utils/line-state.js';
import { formatHeader, formatTable } from '../../utils/format.js';

/**
 * Shared core for `al-factory stations empty-bins` and `al-factory lines empty-bins`.
 *
 * The Y axis (which stations) is the caller's responsibility — it's a station
 * code for the station handler, every station in a line for the line handler.
 * The X axis (which bins) is parsed from argv flags here so both handlers stay
 * consistent.
 */

/**
 * Resolve bin selector flags into the concrete bin list:
 *   --all       → all 5 bins (the caller also enables intake-registry wipe)
 *   --all-bins  → all 5 bins, registry untouched
 *   --input / --doing / --output / --failed / --done → individual, combinable
 *
 * Returns an empty array if no bin flag was passed — the caller decides
 * whether that's an error (passing only --intake-registry is valid).
 */
export function selectBins(argv) {
  if (argv.all || argv.allBins) return [...ALL_BINS];
  return ALL_BINS.filter((b) => argv[b]);
}

/**
 * Should we also wipe the intake-registry? True when --all (the full nuclear
 * reset) or --intake-registry (explicit) was passed. Plain --all-bins keeps
 * the registry intact.
 */
export function shouldWipeIntakeRegistry(argv) {
  return Boolean(argv.all || argv.intakeRegistry);
}

/**
 * Build wipe targets from already-loaded line state.
 *
 * Two kinds:
 *   - kind: 'bin'  — a bin directory under temp/stations/<STATION>/<BIN>/
 *   - kind: 'file' — a sibling file like intake-registry.jsonl
 *
 * Bins/files that don't exist on disk surface with `exists: false` so the
 * preview can show "—" rather than "0" — matches the `al-factory stations status`
 * rendering and avoids implying we'd create-then-delete.
 *
 * @param {object} opts
 * @param {string[]} opts.stations
 * @param {string[]} opts.bins
 * @param {boolean} [opts.intake_registry] - include intake-registry.jsonl per station
 * @param {object} opts.line_state
 * @param {string} [opts.stations_root]
 */
export function buildTargets({ stations, bins, intake_registry = false, line_state, stations_root = defaultStationsRoot() }) {
  const targets = [];
  for (const station of stations) {
    const station_bins = line_state.bins[station];
    for (const bin of bins) {
      const map = station_bins?.[bin];
      const count = map ? map.size : 0;
      const exists = map !== null && map !== undefined;
      targets.push({
        kind: 'bin',
        station,
        bin,
        count,
        exists,
        path: path.join(stations_root, station, bin),
      });
    }
    if (intake_registry) {
      const registry_path = path.join(stations_root, station, 'intake-registry.jsonl');
      const exists = fs.existsSync(registry_path);
      let count = 0;
      if (exists) {
        try {
          count = fs.readFileSync(registry_path, 'utf8').split('\n').filter(Boolean).length;
        } catch { /* unreadable — leave count at 0, exists still true so we attempt removal */ }
      }
      targets.push({
        kind: 'file',
        station,
        bin: 'intake-registry',
        count,
        exists,
        path: registry_path,
      });
    }
  }
  return targets;
}

/**
 * Render the preview table. Bins not on disk show "—"; on-disk bins show the
 * workpiece (or registry-entry) count about to be wiped.
 */
export function renderPreview(scope_label, scope_value, targets) {
  console.log(formatHeader(scope_label, scope_value));
  console.log('');
  const rows = targets.map((t) => [
    t.station,
    t.bin,
    t.exists ? String(t.count) : '—',
  ]);
  console.log(formatTable(['STATION', 'BIN', 'COUNT'], rows));
  const bin_dirs = targets.filter((t) => t.kind === 'bin' && t.exists).length;
  const files = targets.filter((t) => t.kind === 'file' && t.exists).length;
  const total = targets.reduce((sum, t) => sum + t.count, 0);
  const parts = [];
  if (bin_dirs > 0) parts.push(`${bin_dirs} bin director${bin_dirs === 1 ? 'y' : 'ies'}`);
  if (files > 0) parts.push(`${files} registry file${files === 1 ? '' : 's'}`);
  const what = parts.length > 0 ? parts.join(' + ') : '0 items';
  console.log('');
  console.log(`Will remove ${what} (${total} entr${total === 1 ? 'y' : 'ies'} total).`);
}

/**
 * Wipe every targeted bin directory and/or registry file. Targets that don't
 * exist are skipped quietly ("there was nothing there anyway"). `rmSync` with
 * `recursive: true, force: true` handles both directories and files.
 *
 * Steps recreate bin directories on demand via the framework's `bin()`
 * helper, so we deliberately do NOT recreate empty dirs here.
 */
export function wipeTargets(targets) {
  let removed = 0;
  for (const t of targets) {
    if (!t.exists) continue;
    fs.rmSync(t.path, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

/**
 * Confirm via @inquirer/prompts unless --yes/-y was passed. Returns true if the
 * user confirmed (or skipped the prompt), false on cancel. Mirrors the
 * cancellation behaviour of `delete.js` (Ctrl-C lands as ExitPromptError up the
 * stack, so we don't need to handle it here).
 */
export async function confirmWipe(argv, message) {
  if (argv.yes) return true;
  return confirm({ message, default: false });
}
