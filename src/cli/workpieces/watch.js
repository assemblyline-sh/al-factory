import {
  loadLineState,
  resolvePosition,
  findWorkpieceMatches,
  collectIdsForBin,
  workpieceDir,
  workpieceLink,
  readWorkpieceLog,
  ALL_BINS,
} from '../../utils/line-state.js';
import { formatTime } from '../../utils/format.js';
import { listWorkpiecesHandler } from './list.js';
import { showWorkpieceHandler } from './show.js';

/**
 * Append-style watch — the live operational view.
 *
 * Append-style means: print only new events / position changes as they happen.
 * Friendly to scrollback and `>` redirection. Initial snapshot is rendered
 * by the existing list/show handlers; the watch loop picks up from there.
 *
 * `al-factory workpieces watch <id>` → tail one workpiece
 * `al-factory workpieces watch --bin VM3/failed` → tail every workpiece in that bin
 * `al-factory workpieces watch --line VM` → tail every workpiece on a line
 * `al-factory workpieces watch --match <substring>` → tail by substring filter
 */

const DEFAULT_INTERVAL_SECS = 2;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function installSigintExit() {
  process.on('SIGINT', () => { console.log('\nStopped.'); process.exit(0); });
}

/**
 * Watch a single workpiece. Caller has already rendered the initial deep view.
 *
 * @param {string} workpiece_id
 * @param {object} [opts]
 * @param {number} [opts.interval_secs=2]
 */
export async function watchSingle(workpiece_id, { interval_secs = DEFAULT_INTERVAL_SECS } = {}) {
  installSigintExit();
  console.log(`\n--- watching ${workpiece_id} (interval ${interval_secs}s, Ctrl-C to stop) ---`);

  // Initialize state from current snapshot.
  let lines = loadLineState();
  let pos = resolvePosition(workpiece_id, lines);
  if (!pos) {
    console.log(`${formatTime(new Date())}  ${workpiece_id}  not on disk`);
    return;
  }
  let last_pos_key = `${pos.station}/${pos.bin}`;
  let last_log_count = readWorkpieceLog(workpieceDir(pos, workpiece_id)).length;

  while (true) {
    await sleep(interval_secs * 1000);
    lines = loadLineState();
    pos = resolvePosition(workpiece_id, lines);
    if (!pos) {
      console.log(`${formatTime(new Date())}  ${workpiece_id}  no longer on disk`);
      return;
    }
    const wp_dir = workpieceDir(pos, workpiece_id);
    const pos_key = `${pos.station}/${pos.bin}`;

    if (pos_key !== last_pos_key) {
      console.log(`${formatTime(new Date())}  → moved from ${last_pos_key} to ${pos_key}`);
      console.log(`Folder: ${workpieceLink(wp_dir)}`);
      last_pos_key = pos_key;
      last_log_count = readWorkpieceLog(wp_dir).length;
      continue;
    }

    const events = readWorkpieceLog(wp_dir);
    if (events.length > last_log_count) {
      for (const e of events.slice(last_log_count)) {
        console.log(`${formatTime(e.ts)}  ${e.station.padEnd(3)}  ${e.event}`);
      }
      last_log_count = events.length;
    }
  }
}

/**
 * Watch a fixed set of workpieces. Caller has already rendered the initial
 * dashboard. Notices are tagged with the workpiece id so a streaming reader
 * can attribute each event.
 *
 * Workpieces that reach terminal output emit a one-time `✓ finished` notice
 * and stop being polled for the remainder of the watch session.
 *
 * @param {string[]} ids - workpieces to follow (fixed set, no auto-discovery)
 * @param {object} [opts]
 * @param {number} [opts.interval_secs=2]
 */
/**
 * Top-level handler for `al-factory workpieces watch [id|--line|--bin|--match]`.
 *
 * Decides single vs multi based on flags / positional id, renders the
 * matching snapshot (delegated to show/list), then enters the watch loop.
 */
export async function watchHandler(argv) {
  const { id, line: lineArg, bin: binArg, match: matchArg, interval } = argv || {};
  const lines = loadLineState();
  const interval_secs = typeof interval === 'number' ? interval : DEFAULT_INTERVAL_SECS;

  // Single-workpiece path: positional id resolving to exactly one workpiece.
  if (id) {
    const matches = findWorkpieceMatches(id, lines);
    if (matches.size === 0) {
      console.error(`No workpiece matches "${id}".`);
      process.exit(1);
    }
    if (matches.size === 1 || matches.has(id)) {
      const resolvedId = matches.has(id) ? id : [...matches.keys()][0];
      const pos = resolvePosition(resolvedId, lines);
      if (!pos) {
        console.error(`Workpiece "${resolvedId}" exists but has no resolvable position.`);
        process.exit(1);
      }
      // Initial snapshot via show handler.
      await showWorkpieceHandler({ id: resolvedId });
      await watchSingle(resolvedId, { interval_secs });
      return;
    }
    // Ambiguous substring → multi
    const ids = [...matches.keys()];
    await listWorkpiecesHandler({ match: id });
    await watchMulti(ids, { interval_secs });
    return;
  }

  // Multi path: scope flags determine the fixed set of ids to follow.
  let ids;
  if (binArg) {
    const result = collectIdsForBin(binArg, lines);
    if (!result.ok) { console.error(result.error); process.exit(1); }
    ids = result.ids;
  } else if (matchArg) {
    ids = [...findWorkpieceMatches(matchArg, lines).keys()];
  } else if (lineArg) {
    const ls = lines[lineArg];
    if (!ls) {
      console.error(`Line "${lineArg}" not found on disk. Available: ${Object.keys(lines).sort().join(', ') || '(none)'}`);
      process.exit(1);
    }
    const set = new Set();
    for (const station of ls.stations) {
      for (const bin of ALL_BINS) {
        const map = ls.bins[station][bin];
        if (map) for (const id of map.keys()) set.add(id);
      }
    }
    ids = [...set];
  } else {
    console.error('Usage: al-factory workpieces watch <id> | --line <code> | --bin STATION/BIN | --match <substring>');
    console.error('Run "al-factory workpieces list" to see workpieces on disk.');
    process.exit(1);
  }

  if (ids.length === 0) {
    console.log('No workpieces in scope.');
    return;
  }

  // Initial snapshot via list handler (using the same scope flags).
  await listWorkpiecesHandler({ line: lineArg, bin: binArg, match: matchArg });
  await watchMulti(ids, { interval_secs });
}

export async function watchMulti(ids, { interval_secs = DEFAULT_INTERVAL_SECS } = {}) {
  installSigintExit();
  console.log(`\n--- watching ${ids.length} workpiece${ids.length === 1 ? '' : 's'} (interval ${interval_secs}s, Ctrl-C to stop) ---`);

  // Per-workpiece tracking state, seeded from current snapshot.
  let lines = loadLineState();
  const state = new Map();
  for (const id of ids) {
    const pos = resolvePosition(id, lines);
    if (!pos) continue;
    const wp_dir = workpieceDir(pos, id);
    state.set(id, {
      pos_key: `${pos.station}/${pos.bin}`,
      log_count: readWorkpieceLog(wp_dir).length,
      finished: pos.bin === 'output' && pos.terminal,
    });
  }

  while (true) {
    await sleep(interval_secs * 1000);
    lines = loadLineState();

    for (const id of ids) {
      const prev = state.get(id);
      if (!prev || prev.finished) continue;

      const pos = resolvePosition(id, lines);
      if (!pos) {
        console.log(`${formatTime(new Date())}  ${id}  no longer on disk`);
        state.delete(id);
        continue;
      }
      const wp_dir = workpieceDir(pos, id);
      const pos_key = `${pos.station}/${pos.bin}`;

      if (pos_key !== prev.pos_key) {
        console.log(`${formatTime(new Date())}  ${id}  → moved from ${prev.pos_key} to ${pos_key}`);
        console.log(`                          ${workpieceLink(wp_dir)}`);
        prev.pos_key = pos_key;
        prev.log_count = readWorkpieceLog(wp_dir).length;
      } else {
        const events = readWorkpieceLog(wp_dir);
        if (events.length > prev.log_count) {
          for (const e of events.slice(prev.log_count)) {
            console.log(`${formatTime(e.ts)}  ${id}  ${e.station}  ${e.event}`);
          }
          prev.log_count = events.length;
        }
      }

      if (pos.bin === 'output' && pos.terminal && !prev.finished) {
        console.log(`${formatTime(new Date())}  ${id}  ✓ finished (terminal output)`);
        prev.finished = true;
      }
    }
  }
}
