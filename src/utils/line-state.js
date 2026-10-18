/**
 * Line state — operational view of the assembly-line filesystem.
 *
 * Line topology is sourced from `.orchestrator/stations/*.json` (the `line` field
 * on each station is the authoritative line membership). Bin contents are read
 * from `temp/stations/{STATION}/{BIN}/...` by walking the tree for `pointer.json`
 * marker files — see `scanBinWorkpieces`.
 *
 * This module answers:
 *   - which lines exist (the distinct `line` values across local station JSONs)
 *   - how many workpieces sit in each bin of each station
 *   - where a given workpiece is right now (most-advanced live bin)
 *   - what events fired on its journey (parsed from log.jsonl)
 *
 * Mental model (see fde-handbook/patterns/structural/assembly-line-processing.md):
 *   - Live bins (workpiece's current location): input | doing | output | failed
 *   - Archive bin (receipt of a successful forward move): done — NOT a position
 *   - Position rule: walk stations terminal → source; at each, check
 *     output > doing > input > failed; first match wins. done ignored.
 *
 * Sub-bins: a workpiece is any directory containing `pointer.json`, at any depth
 * up to MAX_BIN_DEPTH. Splitters and classifiers can organise children under
 * typed sub-bins (e.g. `output/invoices/`, `output/PO/`, `output/MSA/`); the
 * scanner walks past those organisational directories until it hits the
 * pointer.json marker.
 */

import fs from 'node:fs';
import path from 'node:path';

import { listLocalStations } from './station-files.js';

const ALL_BINS = ['input', 'doing', 'output', 'failed', 'done'];
const LIVE_BINS = ['input', 'doing', 'output', 'failed'];
const LIVE_PRIORITY = ['output', 'doing', 'input', 'failed']; // most-advanced first
const MAX_BIN_DEPTH = 4; // depth limit for sub-bin walks (output/invoices/hi-1/ = depth 2)

export { ALL_BINS, LIVE_BINS, LIVE_PRIORITY, MAX_BIN_DEPTH };

/**
 * @typedef {object} LineState
 * @property {string} code - 2-letter line code (e.g. 'VM')
 * @property {string[]} stations - Station codes sorted by numeric suffix
 * @property {string} terminal - Highest-numbered station code
 * @property {Object<string, Object<string, Map<string, string>|null>>} bins -
 *   bins[station][bin] is a Map of workpiece_id → path relative to the bin
 *   (e.g. 'hi-1' for flat, 'invoices/hi-1__NT-...' for a sub-bin), or null
 *   if the bin directory does not exist on disk.
 */

/**
 * @typedef {object} Position
 * @property {string} line
 * @property {string} station
 * @property {string} bin
 * @property {string} subpath - path relative to the bin (= workpiece_id for
 *   flat layouts, prefixed with sub-bin segments for nested layouts)
 * @property {boolean} terminal - true if station is the line's terminal
 * @property {boolean} [anomaly] - true when only present in done (not live)
 */

/**
 * Walk a bin directory and find every workpiece — any directory containing a
 * `pointer.json` marker. The marker is canonical (see
 * `fde-handbook/patterns/structural/workpiece-anatomy.md`): a workpiece is
 * uniquely identified by the directory carrying its pointer.json.
 *
 * Walks past organisational sub-bins (`output/invoices/`, `output/PO/`, etc.)
 * — those directories do not carry a pointer.json themselves — until it
 * reaches the workpiece marker. Bounded to MAX_BIN_DEPTH to keep pathological
 * inputs cheap.
 *
 * @param {string} bin_dir - absolute path to the bin (e.g. temp/stations/HI3/output)
 * @returns {Map<string, string>} workpiece_id → path relative to bin_dir
 *   (the basename equals the id; deeper paths preserve sub-bin segments)
 */
export function scanBinWorkpieces(bin_dir) {
  /** @type {Map<string, string>} */
  const found = new Map();
  if (!fs.existsSync(bin_dir)) return found;

  /**
   * @param {string} dir
   * @param {number} depth
   * @param {string} relpath - path relative to bin_dir; '' at the bin itself
   */
  function walk(dir, depth, relpath) {
    if (depth >= MAX_BIN_DEPTH) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;

      const child_dir = path.join(dir, entry.name);
      const child_rel = relpath ? `${relpath}/${entry.name}` : entry.name;

      if (fs.existsSync(path.join(child_dir, 'pointer.json'))) {
        // Workpiece — record and don't descend further (workpieces don't nest).
        found.set(entry.name, child_rel);
      } else {
        // Organisational sub-bin — descend.
        walk(child_dir, depth + 1, child_rel);
      }
    }
  }

  walk(bin_dir, 0, '');
  return found;
}

/**
 * Default stations_root: `temp/stations/` relative to cwd. The CLI runs from
 * a factory repo's root; that's where `temp/stations/` lives.
 */
export function defaultStationsRoot() {
  return path.resolve(process.cwd(), 'temp', 'stations');
}

/**
 * Build per-line operational state.
 *
 * Topology (line membership, station ordering, terminal) is derived from
 * `.orchestrator/stations/*.json` — the `line` field is the authoritative
 * grouping, and dependency edges drive topo ordering. Bin contents come from
 * `temp/stations/{station}/{bin}/`. Stations defined in JSON but with no on-disk
 * bin dirs render as `null` bins (— in the table); on-disk station dirs with no
 * matching JSON are ignored (they're orphans of a renamed/deleted station).
 *
 * @param {object} [opts]
 * @param {string} [opts.stations_root] - Override the default temp/stations path.
 * @returns {Object<string, LineState>} Lines keyed by the JSON `line` value.
 */
export function loadLineState({ stations_root = defaultStationsRoot() } = {}) {
  const station_defs = listLocalStations();

  /** @type {Map<string, Array>} */
  const grouped = new Map();
  for (const def of station_defs) {
    if (!def.line) continue; // station not assigned to any line — skip
    if (!grouped.has(def.line)) grouped.set(def.line, []);
    grouped.get(def.line).push(def);
  }

  /** @type {Object<string, LineState>} */
  const lines = {};
  for (const [line_code, members] of grouped) {
    const ordered = topoSortStations(members);
    const station_codes = ordered.map(codeOf);
    const terminal = computeTerminal(ordered);

    const bins = {};
    for (const station of station_codes) {
      bins[station] = {};
      for (const bin of ALL_BINS) {
        const dir = path.join(stations_root, station, bin);
        if (!fs.existsSync(dir)) { bins[station][bin] = null; continue; }
        bins[station][bin] = scanBinWorkpieces(dir);
      }
    }

    lines[line_code] = { code: line_code, stations: station_codes, terminal, bins };
  }
  return lines;
}

/**
 * Stable code accessor for a station def — prefers short_code, falls back to id.
 * Exported so callers ordering station defs (lines/list, lines/show) agree on
 * what a station's "code" is.
 */
export const codeOf = (s) => s.data.short_code || s.data.id;

/**
 * Index station defs by every reference form they answer to — short_code, id,
 * and the resolved `codeOf` — so a dependency edge written either way finds its
 * peer. Shared by `topoSortStations` and `resolveStationRef`.
 *
 * @param {Array<{data: object}>} members
 * @returns {Map<string, {data: object}>}
 */
export function indexStationsByRef(members) {
  const byRef = new Map();
  for (const s of members) {
    byRef.set(codeOf(s), s);
    if (s.data.id) byRef.set(s.data.id, s);
    if (s.data.short_code) byRef.set(s.data.short_code, s);
  }
  return byRef;
}

/**
 * Normalise one entry of a `dependencies` array to a reference string.
 * Entries are usually bare id strings (that's what the orchestrator stores),
 * but may also be objects carrying short_code and/or id.
 *
 * @param {string|{short_code?: string, id?: string}} dep
 * @returns {string|undefined}
 */
export function dependencyRef(dep) {
  return typeof dep === 'string' ? dep : dep?.short_code || dep?.id;
}

/**
 * Resolve a station reference (short_code OR orchestrator id) to its display
 * code — the peer's short_code when it has one.
 *
 * `dependencies` stores bare orchestrator ids, so displaying an edge verbatim
 * prints an opaque id like `6VlLAOtS4MZy` where the reader expects `EM0`. Any
 * command rendering dependency edges should route them through this.
 *
 * @param {string} ref - short_code or id
 * @param {Map<string, {data: object}>|Array<{data: object}>} stations - ref index
 *   (from `indexStationsByRef`) or the raw member list to index on the fly.
 * @returns {string} The peer's display code, or `ref` unchanged when the peer
 *   isn't among the given stations (cross-line or not pulled locally).
 */
export function resolveStationRef(ref, stations) {
  const byRef = stations instanceof Map ? stations : indexStationsByRef(stations);
  const match = byRef.get(ref);
  return match ? codeOf(match) : ref;
}

/**
 * Topologically sort station defs within a single line by their `dependencies`
 * edges. Exported and shared across `lines list`, `lines show`, and `lines
 * status` so all three present the same execution order.
 *
 * Dependencies may reference peers by short_code OR orchestrator id; we index
 * both forms to avoid silently dropping id-based edges (which would fall back
 * to alphabetical luck — fine for AP2..AP6 by accident, wrong for TR1 in AP).
 *
 * @param {Array<{data: object}>} members - Station defs (from listLocalStations)
 *   belonging to one line.
 * @returns {Array<{data: object}>} Same defs, ordered.
 */
export function topoSortStations(members) {
  const byRef = indexStationsByRef(members);

  const depsOf = (s) => (s.data.dependencies || [])
    .map(dependencyRef)
    .map((ref) => byRef.get(ref))
    .filter(Boolean);

  // Alphabetical pre-sort gives stable sibling order when topo has ties.
  const sorted = [...members].sort((a, b) => codeOf(a).localeCompare(codeOf(b)));
  const visited = new Set();
  const result = [];
  const visit = (s) => {
    const code = codeOf(s);
    if (visited.has(code)) return;
    visited.add(code);
    for (const dep of depsOf(s)) visit(dep);
    result.push(s);
  };
  for (const s of sorted) visit(s);
  return result;
}

/**
 * Terminal = station that no in-line peer depends on (sink of the DAG).
 * When the line has multiple sinks (rare — branching that never rejoins),
 * pick the one latest in topo order so summaries pick a stable "last".
 */
function computeTerminal(ordered) {
  if (ordered.length === 0) return '';
  const byRef = indexStationsByRef(ordered);

  const depended_on = new Set();
  for (const s of ordered) {
    for (const d of s.data.dependencies || []) {
      const ref = dependencyRef(d);
      if (byRef.has(ref)) depended_on.add(resolveStationRef(ref, byRef));
    }
  }

  for (let i = ordered.length - 1; i >= 0; i--) {
    const c = codeOf(ordered[i]);
    if (!depended_on.has(c)) return c;
  }
  // Fully cyclic (shouldn't happen in a DAG); fall back to the last in topo order.
  return codeOf(ordered[ordered.length - 1]);
}

/**
 * Resolve a workpiece's live position. Walks every line terminal → source;
 * at each station checks output → doing → input → failed; first match wins.
 * Falls back to a done-only anomaly position if no live bin holds the id.
 *
 * @param {string} workpiece_id
 * @param {Object<string, LineState>} lines
 * @returns {Position|null}
 */
export function resolvePosition(workpiece_id, lines) {
  for (const line of Object.values(lines)) {
    for (let i = line.stations.length - 1; i >= 0; i--) {
      const station = line.stations[i];
      for (const bin of LIVE_PRIORITY) {
        const map = line.bins[station][bin];
        if (map?.has(workpiece_id)) {
          return {
            line: line.code,
            station,
            bin,
            subpath: map.get(workpiece_id),
            terminal: station === line.terminal,
          };
        }
      }
    }
  }
  // Fall back to done: anomaly path.
  for (const line of Object.values(lines)) {
    for (let i = line.stations.length - 1; i >= 0; i--) {
      const station = line.stations[i];
      const map = line.bins[station].done;
      if (map?.has(workpiece_id)) {
        return {
          line: line.code,
          station,
          bin: 'done',
          subpath: map.get(workpiece_id),
          terminal: station === line.terminal,
          anomaly: true,
        };
      }
    }
  }
  return null;
}

/**
 * Find every distinct workpiece id whose name contains the query substring,
 * across every bin of every line. Each match is resolved to its live position.
 *
 * @param {string} query - substring to match against workpiece ids
 * @param {Object<string, LineState>} lines
 * @returns {Map<string, Position>} id → live position
 */
export function findWorkpieceMatches(query, lines) {
  const ids = new Set();
  for (const line of Object.values(lines)) {
    for (const station of line.stations) {
      for (const bin of ALL_BINS) {
        const map = line.bins[station][bin];
        if (!map) continue;
        for (const id of map.keys()) if (id.includes(query)) ids.add(id);
      }
    }
  }
  const matches = new Map();
  for (const id of ids) {
    const pos = resolvePosition(id, lines);
    if (pos) matches.set(id, pos);
  }
  return matches;
}

/**
 * Collect every workpiece id currently sitting in a specific bin (or sub-bin).
 *
 * Accepts either:
 *   - `STATION/BIN` — e.g. `VM3/failed` — returns every workpiece anywhere
 *     under the bin, including sub-bin layouts (`output/invoices/...`).
 *   - `STATION/BIN/SUBPATH` — e.g. `HI3/output/invoices` — narrows to
 *     workpieces whose path-from-bin starts with the given sub-bin segment.
 *
 * @param {string} bin_spec
 * @param {Object<string, LineState>} lines
 * @returns {{ok: true, ids: string[]} | {ok: false, error: string}}
 */
export function collectIdsForBin(bin_spec, lines) {
  // Station code is whatever short_code shape the JSON uses (AP3b, VO1x, P10,
  // TR1, …). Don't bake assumptions about prefix length or numeric suffix into
  // the regex — defer existence checking to the loaded line state below.
  const m = bin_spec.match(/^([^/]+)\/(input|doing|output|done|failed)(?:\/(.+))?$/);
  if (!m) {
    return {
      ok: false,
      error: `Invalid bin spec "${bin_spec}". Use STATION/BIN or STATION/BIN/SUBPATH (e.g. AP3b/failed, HI3/output/invoices).`,
    };
  }
  const [, station, bin, subpath_filter] = m;
  let line_found = null;
  for (const line of Object.values(lines)) {
    if (line.stations.includes(station)) { line_found = line; break; }
  }
  if (!line_found) {
    return { ok: false, error: `Station "${station}" not found on disk.` };
  }
  const map = line_found.bins[station][bin];
  if (!map) return { ok: true, ids: [] };
  if (!subpath_filter) return { ok: true, ids: [...map.keys()] };
  const filter_prefix = subpath_filter.replace(/\/+$/, '') + '/';
  const ids = [];
  for (const [id, sub] of map) {
    if (sub === subpath_filter || sub.startsWith(filter_prefix)) ids.push(id);
  }
  return { ok: true, ids };
}

/**
 * Read and parse a workpiece's log.jsonl. Blank lines skipped; malformed
 * lines dropped silently (the log is best-effort, not a typed payload).
 *
 * @param {string} workpiece_dir - Path to {STATION}/{BIN}/{workpiece_id}/
 * @returns {Array<{ts: string, station: string, event: string}>}
 */
export function readWorkpieceLog(workpiece_dir) {
  const log_path = path.join(workpiece_dir, 'log.jsonl');
  if (!fs.existsSync(log_path)) return [];
  return fs
    .readFileSync(log_path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

/**
 * Build the absolute path to a workpiece directory given a resolved position.
 * Uses `pos.subpath` (the path relative to the bin) so sub-bin layouts resolve
 * correctly. Falls back to the workpiece_id if subpath is missing — supports
 * callers that hand-roll Position objects without setting subpath.
 *
 * @param {Position} pos
 * @param {string} workpiece_id
 * @param {string} [stations_root]
 * @returns {string}
 */
export function workpieceDir(pos, workpiece_id, stations_root = defaultStationsRoot()) {
  const subpath = pos.subpath || workpiece_id;
  return path.join(stations_root, pos.station, pos.bin, subpath);
}

/**
 * Cmd-clickable file:// URL for a workpiece directory. Spaces in workpiece
 * ids are URL-encoded; `/` preserved.
 */
export function workpieceLink(workpiece_dir_path) {
  return `file://${encodeURI(workpiece_dir_path)}`;
}

/**
 * Per-line operational totals derived from live bins only. `done` ignored.
 *
 * - in_flight = (input + doing + output) across non-terminal stations
 * - stuck     = sum of failed across the line
 * - finished  = terminal-station output count
 *
 * @param {LineState} line
 * @returns {{in_flight: number, stuck: number, finished: number,
 *   stuck_locations: string[], biggest_flow: {count: number, at: string|null}}}
 */
export function summarizeLine(line) {
  let in_flight = 0;
  let stuck = 0;
  let finished = 0;
  const stuck_locations = [];
  let biggest_flow = { count: 0, at: null };

  for (const station of line.stations) {
    const bins = line.bins[station];
    const is_terminal = station === line.terminal;
    for (const bin of LIVE_BINS) {
      const map = bins[bin];
      if (!map) continue;
      const n = map.size;
      if (bin === 'failed') {
        stuck += n;
        if (n > 0) stuck_locations.push(`${n} at ${station}/failed`);
      } else if (is_terminal && bin === 'output') {
        finished += n;
      } else {
        in_flight += n;
        if (n > biggest_flow.count) biggest_flow = { count: n, at: `${station}/${bin}` };
      }
    }
  }
  return { in_flight, stuck, finished, stuck_locations, biggest_flow };
}
