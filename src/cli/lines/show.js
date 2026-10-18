import { listLocalStations, listLocalLines } from '../../utils/station-files.js';
import {
  topoSortStations,
  codeOf,
  dependencyRef,
  resolveStationRef,
  indexStationsByRef,
} from '../../utils/line-state.js';
import { formatHeader, formatField, formatTable, formatSection } from '../../utils/format.js';

/**
 * `al-factory lines show <line>` — definitional view of a line: stations in dependency
 * order, plus conveyor topology. Derived from local station JSON files.
 *
 * For the operational view (live bin counts), use `al-factory lines status <line>`.
 */
export async function showLineHandler(argv) {
  const { line: lineArg, json } = argv;
  const stations = listLocalStations();
  const line_def = listLocalLines()[lineArg] || null;

  const members = stations.filter(s => s.line === lineArg);
  if (members.length === 0 && !line_def) {
    console.error(`Line not found locally: ${lineArg}`);
    console.error('Run "al-factory lines list" to see available lines.');
    process.exit(1);
  }

  // Topological sort by dependencies (shared with lines list / lines status).
  // Sort before the json branch so --json and the table show the same order.
  const ordered = topoSortStations(members);

  if (json) {
    console.log(JSON.stringify({ line: line_def, stations: ordered.map(m => m.data) }, null, 2));
    return;
  }

  console.log(formatHeader('Line', lineArg));
  if (line_def?.name && line_def.name !== lineArg) console.log(formatField('Name', line_def.name, 12));
  console.log(formatField('Location', line_def?.location ?? '(no line file — run "al-orc lines pull --all")', 12));
  if (line_def?.description) console.log(formatField('Description', line_def.description, 12));
  console.log(formatField('Stations', String(members.length), 12));
  console.log('');

  // Resolve dependency refs against every local station, not just this line's
  // members — a cross-line edge should still render as a short_code.
  const byRef = indexStationsByRef(stations);

  const rows = ordered.map(m => {
    const code = codeOf(m);
    const name = m.data.name || '—';
    const stepCount = Array.isArray(m.data.steps) ? m.data.steps.length : 0;
    const deps = (m.data.dependencies || [])
      .map(d => resolveStationRef(dependencyRef(d), byRef))
      .join(', ') || '—';
    const enabled = m.data.is_enabled === false ? 'no' : 'yes';
    return [code, name, String(stepCount), deps, enabled];
  });

  console.log(formatTable(['STATION', 'NAME', 'STEPS', 'DEPENDS ON', 'ENABLED'], rows));

  // Surface conveyor topology hint (move_files steps tell us source→target bin flow)
  const conveyors = [];
  for (const m of ordered) {
    for (const step of m.data.steps || []) {
      if (step.slug === 'lib-factory:move_files' && step.config) {
        conveyors.push({
          station: codeOf(m),
          from: step.config.source_bin,
          to: step.config.target_bin,
          mode: step.config.mode,
        });
      }
    }
  }
  if (conveyors.length > 0) {
    console.log(formatSection('Conveyors'));
    console.log(formatTable(
      ['AT STATION', 'FROM BIN', 'TO BIN', 'MODE'],
      conveyors.map(c => [c.station, c.from || '—', c.to || '—', c.mode || '—']),
    ));
  }

  console.log('');
  console.log(`Run \`al-factory lines status ${lineArg}\` for live bin counts.`);
}
