import {
  loadLineState,
  resolvePosition,
  findWorkpieceMatches,
  workpieceDir,
  workpieceLink,
  readWorkpieceLog,
} from '../../utils/line-state.js';
import { formatDate, localTzLabel } from '../../utils/format.js';
import { listWorkpiecesHandler } from './list.js';

/**
 * `al-factory workpieces show <id-or-substring>` — single-workpiece depth view.
 *
 * Renders: position label, journey from log.jsonl with computed durations,
 * and a Cmd-clickable file:// folder link to the workpiece dir.
 *
 * Substring resolving to >1 id auto-promotes to the dashboard via
 * `al-factory workpieces list --match <substring>`. To force the single view,
 * pass the full id.
 */
export async function showWorkpieceHandler(argv) {
  const { id: query, json } = argv;
  if (!query) {
    console.error('Usage: al-factory workpieces show <id-or-substring>');
    process.exit(1);
  }

  const lines = loadLineState();
  const resolved = resolveQueryToId(query, lines);

  if (resolved.multi) {
    // Auto-promote to dashboard via the list handler.
    return listWorkpiecesHandler({ ...argv, match: query });
  }

  if (!resolved.id) {
    console.error(`No workpiece matches "${query}".`);
    process.exit(1);
  }

  const pos = resolvePosition(resolved.id, lines);
  if (!pos) {
    console.error(`Workpiece "${resolved.id}" exists but has no resolvable position.`);
    process.exit(1);
  }

  if (json) {
    const wp_dir = workpieceDir(pos, resolved.id);
    console.log(JSON.stringify({
      id: resolved.id,
      position: pos,
      journey: readWorkpieceLog(wp_dir),
      folder: workpieceLink(wp_dir),
    }, null, 2));
    return;
  }

  renderWorkpiece(resolved.id, pos);
  console.log(`\nRun \`al-factory workpieces watch ${resolved.id}\` to tail this workpiece live.`);
}

function resolveQueryToId(query, lines) {
  const matches = findWorkpieceMatches(query, lines);
  // Prefer exact match if present.
  if (matches.has(query)) return { id: query, multi: false };
  if (matches.size === 0) return { id: null, multi: false };
  if (matches.size === 1) return { id: [...matches.keys()][0], multi: false };
  return { id: null, multi: true, matches };
}

function renderWorkpiece(id, pos) {
  const wp_dir = workpieceDir(pos, id);
  console.log(`Workpiece: ${id}`);
  console.log(`Position:  ${positionLabel(pos)}`);
  console.log('');
  renderJourney(readWorkpieceLog(wp_dir));
  console.log('');
  console.log(`Folder: ${workpieceLink(wp_dir)}`);
}

function positionLabel(pos) {
  let label = `${pos.station}/${pos.bin}`;
  if (pos.anomaly) label += '  (anomaly — only in done, no live presence)';
  else if (pos.bin === 'failed') label += '  (stuck)';
  else if (pos.bin === 'output' && pos.terminal) label += '  (finished — terminal output)';
  else if (pos.bin === 'doing') label += '  (in progress)';
  return label;
}

function renderJourney(events) {
  const heading = `Journey (${localTzLabel()})`;
  console.log(heading);
  console.log('-'.repeat(heading.length));
  if (events.length === 0) {
    console.log('  (no log.jsonl found at current position)');
    return;
  }
  const started_at = {}; // station → ts of last station_started
  for (const e of events) {
    let extra = '';
    if (e.event === 'station_started') {
      started_at[e.station] = e.ts;
    } else if (e.event === 'station_complete' || e.event === 'station_failed') {
      const start = started_at[e.station];
      if (start) {
        const ms = new Date(e.ts).getTime() - new Date(start).getTime();
        if (!Number.isNaN(ms) && ms >= 0) extra = `       (${formatDuration(ms)})`;
        delete started_at[e.station];
      }
    }
    console.log(`${formatDate(e.ts)}  ${e.station.padEnd(3)}  ${e.event}${extra}`);
  }
}

function formatDuration(ms) {
  const secs = ms / 1000;
  if (secs < 1) return `${ms}ms`;
  if (secs < 60) return `${secs.toFixed(secs < 10 ? 1 : 0)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}
