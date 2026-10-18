import { formatTable, formatSection, formatTime, localTzLabel } from '../../utils/format.js';
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

/**
 * `al-factory workpieces list [--line] [--bin] [--match]` — operational dashboard
 * over workpieces sitting on disk under temp/stations/.
 *
 * Scope (all are optional; layered when combined):
 *   --line VM            scope to all workpieces on the VM line
 *   --bin STATION/BIN    scope to a specific bin, e.g. VM3/failed
 *   --match <substring>  scope by workpiece-id substring
 *
 * Output:
 *   - Table of (workpiece, position, last event)
 *   - `Open` section underneath with Cmd-clickable file:// folder links
 */
export async function listWorkpiecesHandler(argv) {
  const { line: lineArg, bin: binArg, match: matchArg, json } = argv || {};
  const lines = loadLineState();

  if (Object.keys(lines).length === 0) {
    if (json) {
      console.log(JSON.stringify({ header: 'Workpieces', workpieces: [] }, null, 2));
      return;
    }
    console.log('No lines found in .orchestrator/stations/. Run "al-orc stations pull --all" to fetch station files.');
    return;
  }

  // Resolve the working set of workpiece ids based on the provided scope flags.
  let ids = [];
  let header = 'Workpieces';

  if (binArg) {
    const result = collectIdsForBin(binArg, lines);
    if (!result.ok) {
      console.error(result.error);
      process.exit(1);
    }
    ids = result.ids;
    header = `Workpieces in ${binArg}`;
  } else if (matchArg) {
    const matches = findWorkpieceMatches(matchArg, lines);
    ids = [...matches.keys()];
    header = `Workpieces matching "${matchArg}"`;
  } else if (lineArg) {
    const ls = lines[lineArg];
    if (!ls) {
      console.error(`Line "${lineArg}" not found on disk. Available: ${Object.keys(lines).join(', ') || '(none)'}`);
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
    header = `Workpieces on line ${lineArg}`;
  } else {
    // No scope flags: every workpiece anywhere on disk.
    const set = new Set();
    for (const ls of Object.values(lines)) {
      for (const station of ls.stations) {
        for (const bin of ALL_BINS) {
          const map = ls.bins[station][bin];
          if (map) for (const id of map.keys()) set.add(id);
        }
      }
    }
    ids = [...set];
  }

  // Optional --line filter when combined with --bin or --match.
  if (lineArg && (binArg || matchArg)) {
    const ls = lines[lineArg];
    if (!ls) {
      console.error(`Line "${lineArg}" not found on disk.`);
      process.exit(1);
    }
    const lineIds = new Set();
    for (const station of ls.stations) {
      for (const bin of ALL_BINS) {
        const map = ls.bins[station][bin];
        if (map) for (const id of map.keys()) lineIds.add(id);
      }
    }
    ids = ids.filter((id) => lineIds.has(id));
  }

  ids.sort((a, b) => a.localeCompare(b));

  // Resolve position + read last log event for each.
  const rows = ids.map((id) => {
    const pos = resolvePosition(id, lines);
    if (!pos) return { id, position: '(not on disk)', last_event: '—', link: '—' };
    const wp_dir = workpieceDir(pos, id);
    const events = readWorkpieceLog(wp_dir);
    return {
      id,
      position: positionShort(pos),
      last_event: formatLastEventCompact(events),
      link: workpieceLink(wp_dir),
    };
  });

  if (json) {
    console.log(JSON.stringify({ header, workpieces: rows }, null, 2));
    return;
  }

  if (rows.length === 0) {
    console.log(`${header}: 0 workpieces.`);
    return;
  }

  console.log(`${header} — ${rows.length} workpiece${rows.length === 1 ? '' : 's'}`);
  console.log('');
  console.log(formatTable(
    ['WORKPIECE', 'POSITION', `LAST EVENT (${localTzLabel()})`],
    rows.map((r) => [r.id, r.position, r.last_event]),
  ));

  console.log(formatSection('Open'));
  const idW = Math.max(...rows.map((r) => r.id.length));
  for (const r of rows) console.log(`  ${r.id.padEnd(idW)}  ${r.link}`);
}

function positionShort(pos) {
  // Show the sub-bin segment when the workpiece lives under one
  // (e.g. HI3/output/invoices). The id itself is the last segment of
  // pos.subpath and is already shown as the row's WORKPIECE column.
  const sub = pos.subpath && pos.subpath.includes('/')
    ? '/' + pos.subpath.slice(0, pos.subpath.lastIndexOf('/'))
    : '';
  if (pos.anomaly) return `${pos.station}/done${sub} (anomaly)`;
  let suffix = '';
  if (pos.bin === 'failed') suffix = ' (stuck)';
  else if (pos.bin === 'output' && pos.terminal) suffix = ' (finished)';
  else if (pos.bin === 'doing') suffix = ' (active)';
  return `${pos.station}/${pos.bin}${sub}${suffix}`;
}

function formatLastEventCompact(events) {
  if (events.length === 0) return '—';
  const e = events[events.length - 1];
  const ts = formatTime(e.ts).slice(0, 5); // HH:MM, local
  let extra = '';
  if (e.event === 'station_complete' || e.event === 'station_failed') {
    for (let i = events.length - 2; i >= 0; i--) {
      if (events[i].station === e.station && events[i].event === 'station_started') {
        const ms = new Date(e.ts).getTime() - new Date(events[i].ts).getTime();
        if (!Number.isNaN(ms) && ms >= 0) extra = ` (${formatDuration(ms)})`;
        break;
      }
    }
  }
  return `${ts}  ${e.station}  ${e.event}${extra}`;
}

function formatDuration(ms) {
  const secs = ms / 1000;
  if (secs < 1) return `${ms}ms`;
  if (secs < 60) return `${secs.toFixed(secs < 10 ? 1 : 0)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}
