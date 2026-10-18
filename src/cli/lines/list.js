import { listLocalStations, listLocalLines } from '../../utils/station-files.js';
import { topoSortStations, codeOf } from '../../utils/line-state.js';
import { formatTable } from '../../utils/format.js';

/**
 * `al-factory lines list` — derive lines from local station JSON files.
 *
 * Definitional view: groups stations by their `line` field and shows the
 * line's name and location (from `.orchestrator/lines/<CODE>.json`), count +
 * member short_codes. For operational/live state, use `al-factory lines status`.
 */
export async function listLinesHandler(argv) {
  const { json } = argv || {};
  const stations = listLocalStations();
  const line_defs = listLocalLines();

  if (stations.length === 0) {
    if (json) {
      console.log(JSON.stringify({}, null, 2));
      return;
    }
    console.log('No local station files found.');
    console.log('Run "al-orc stations pull --all" to fetch from orchestrator.');
    return;
  }

  // Group by line; stations without a line field show up under '(unassigned)'
  const groups = new Map();
  for (const s of stations) {
    const key = s.line ?? '(unassigned)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  // A line file with no stations yet still exists as a definition.
  for (const code of Object.keys(line_defs)) {
    if (!groups.has(code)) groups.set(code, []);
  }

  if (json) {
    const out = {};
    for (const [line, members] of groups) {
      const def = line_defs[line] || null;
      const ordered = topoSortStations(members);
      out[line] = {
        name: def?.name ?? null,
        location: def?.location ?? null,
        stations: ordered.map(m => ({
          short_code: m.data.short_code,
          id: m.data.id,
          name: m.data.name,
        })),
      };
    }
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const rows = [];
  const sortedLines = [...groups.keys()].sort();
  for (const line of sortedLines) {
    const members = groups.get(line);
    const def = line_defs[line];
    const codes = topoSortStations(members).map(codeOf).join(', ');
    rows.push([
      line,
      def?.name && def.name !== line ? def.name : '—',
      def?.location ?? '(no line file)',
      String(members.length),
      codes || '—',
    ]);
  }

  console.log(formatTable(['LINE', 'NAME', 'LOCATION', 'STATIONS', 'MEMBERS'], rows));
  console.log('');
  console.log(`Total: ${groups.size} lines, ${stations.length} stations`);
  if (Object.keys(line_defs).length === 0) {
    console.log('No line files found in .orchestrator/lines/ — run "al-orc lines pull --all".');
  }
  console.log('Run `al-factory lines status` for live bin counts.');
}
