import { formatTable, formatHeader, formatField, formatSection } from '../../utils/format.js';
import { loadLineState, summarizeLine, LIVE_BINS } from '../../utils/line-state.js';
import { watchRender, DEFAULT_WATCH_INTERVAL_SECS } from '../../utils/watch-render.js';

/**
 * `al-factory lines status [code]` — operational snapshot of live bin state.
 *
 * With no argument: per-line summary across every line found under
 * temp/stations/, with IN-FLIGHT / STUCK / FINISHED / HEALTH columns.
 *
 * With a code: station × live-bin table for that one line; the `done`
 * bin is shown in parens and excluded from live totals (it's a receipt
 * of a successful forward move, not a current position).
 *
 * `--watch [--interval=N]` re-renders on an interval (clear-screen between
 * frames). Mutually exclusive with `--json` (a one-shot snapshot format).
 */
export async function statusLineHandler(argv) {
  const { line: lineArg, json, watch, interval } = argv || {};
  if (watch && json) {
    console.error('--watch and --json are mutually exclusive (watch is a TTY redraw; json is a one-shot snapshot).');
    process.exit(1);
  }
  const interval_secs = typeof interval === 'number' ? interval : DEFAULT_WATCH_INTERVAL_SECS;

  const renderOnce = () => {
    const lines = loadLineState();

    if (Object.keys(lines).length === 0) {
      if (json) console.log(JSON.stringify({}, null, 2));
      else console.log('No lines found in .orchestrator/stations/. Run "al-orc stations pull --all" to fetch station files.');
      return;
    }

    if (!lineArg) {
      renderLineSummary(lines, json);
      return;
    }

    const ls = lines[lineArg];
    if (!ls) {
      // In watch mode the line may appear later, so don't exit — surface and retry.
      if (watch) {
        console.log(`Line "${lineArg}" not found. Available: ${Object.keys(lines).sort().join(', ') || '(none)'}`);
        return;
      }
      console.error(`Line "${lineArg}" not found. Available: ${Object.keys(lines).sort().join(', ')}`);
      process.exit(1);
    }
    renderLineDrilldown(ls, json);
  };

  if (watch) {
    await watchRender({ render: renderOnce, interval_secs });
    return;
  }
  renderOnce();
}

function renderLineSummary(lines, json) {
  const summaries = {};
  for (const ls of Object.values(lines)) summaries[ls.code] = summarizeLine(ls);

  if (json) {
    console.log(JSON.stringify(summaries, null, 2));
    return;
  }

  const rows = [];
  for (const code of Object.keys(summaries).sort()) {
    const s = summaries[code];
    let health;
    if (s.stuck > 0) health = `⚠ ${s.stuck_locations.join(', ')}`;
    else if (s.in_flight === 0 && s.finished === 0) health = 'idle';
    else if (s.in_flight === 0) health = `${s.finished} finished, drained`;
    else health = `flowing, biggest at ${s.biggest_flow.at}`;

    rows.push([code, String(s.in_flight), String(s.stuck), String(s.finished), health]);
  }
  console.log(formatTable(
    ['LINE', 'IN-FLIGHT', 'STUCK', 'FINISHED', 'HEALTH'],
    rows,
  ));
}

function renderLineDrilldown(ls, json) {
  if (json) {
    const out = { code: ls.code, terminal: ls.terminal, stations: {} };
    for (const station of ls.stations) {
      out.stations[station] = {};
      for (const bin of [...LIVE_BINS, 'done']) {
        const map = ls.bins[station][bin];
        out.stations[station][bin] = map ? [...map.keys()].sort() : null;
      }
    }
    out.summary = summarizeLine(ls);
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  console.log(formatHeader('Line', ls.code));
  console.log(formatField('Stations', ls.stations.join(' → '), 12));
  console.log(formatField('Terminal', ls.terminal, 12));
  console.log('');

  const cell = (map) => (map === null ? '—' : String(map.size));
  const rows = ls.stations.map((station) => {
    const b = ls.bins[station];
    return [
      station,
      cell(b.input),
      cell(b.doing),
      cell(b.output),
      cell(b.failed),
      b.done === null ? '—' : `(${b.done.size})`,
    ];
  });

  const totals = { input: 0, doing: 0, output: 0, failed: 0 };
  for (const station of ls.stations) {
    for (const bin of LIVE_BINS) {
      const map = ls.bins[station][bin];
      if (map) totals[bin] += map.size;
    }
  }
  rows.push([
    'live',
    String(totals.input),
    String(totals.doing),
    String(totals.output),
    String(totals.failed),
    '',
  ]);

  console.log(formatTable(
    ['STATION', 'INPUT', 'DOING', 'OUTPUT', 'FAILED', '(DONE)'],
    rows,
  ));
  console.log('');
  console.log('`(done)` shown in parens for audit; excluded from live totals.');
  console.log('Run `al-factory workpieces list --line ' + ls.code + '` for per-workpiece positions.');
}
