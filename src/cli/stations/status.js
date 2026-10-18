import { formatHeader } from '../../utils/format.js';
import { loadLineState, LIVE_BINS } from '../../utils/line-state.js';
import { watchRender, DEFAULT_WATCH_INTERVAL_SECS } from '../../utils/watch-render.js';

/**
 * `al-factory stations status <code>` — single-station operational drilldown: per-bin
 * workpiece ids read from temp/stations/.
 *
 * Resolves the argument directly against on-disk station short_codes — no
 * orchestrator call. Pass the station short_code (e.g. VM3).
 *
 * `--watch [--interval=N]` re-renders on an interval (clear-screen between
 * frames). Mutually exclusive with `--json` (a one-shot snapshot format).
 */
export async function statusStationHandler(argv) {
  const { id, json, watch, interval } = argv;
  if (!id) {
    console.error('Usage: al-factory stations status <short_code>');
    process.exit(1);
  }
  if (watch && json) {
    console.error('--watch and --json are mutually exclusive (watch is a TTY redraw; json is a one-shot snapshot).');
    process.exit(1);
  }
  const interval_secs = typeof interval === 'number' ? interval : DEFAULT_WATCH_INTERVAL_SECS;

  const renderOnce = () => {
    const lines = loadLineState();
    let stationLine = null;
    for (const ls of Object.values(lines)) {
      if (ls.stations.includes(id)) { stationLine = ls; break; }
    }
    if (!stationLine) {
      // In watch mode the station may appear later, so don't exit — surface and retry.
      if (watch) {
        console.log(`No station "${id}" on disk under temp/stations/.`);
        return;
      }
      console.error(`No station "${id}" on disk under temp/stations/.`);
      console.error('Pass the station short_code (e.g. VM3). Run `al-factory lines status` to see active lines.');
      process.exit(1);
    }

    const bins = stationLine.bins[id];

    if (json) {
      const out = { station: id, line: stationLine.code, terminal: id === stationLine.terminal, bins: {} };
      for (const bin of [...LIVE_BINS, 'done']) {
        const map = bins[bin];
        out.bins[bin] = map ? [...map.keys()].sort() : null;
      }
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    console.log(formatHeader('Station', id));
    console.log(`Line:     ${stationLine.code}${id === stationLine.terminal ? '  (terminal)' : ''}`);
    console.log('');

    for (const bin of [...LIVE_BINS, 'done']) {
      const map = bins[bin];
      const label = bin === 'done' ? '(done)' : bin;
      if (map === null) {
        console.log(`${label.padEnd(8)} —`);
        continue;
      }
      const sorted = [...map.keys()].sort();
      console.log(`${label.padEnd(8)} (${sorted.length})`);
      // Show sub-bin path when a workpiece lives under one (e.g. invoices/hi-1__...).
      for (const wpId of sorted) {
        const sub = map.get(wpId);
        const display = sub && sub !== wpId ? `${wpId}  (in ${sub.slice(0, sub.lastIndexOf('/'))}/)` : wpId;
        console.log(`         ${display}`);
      }
      if (sorted.length === 0) console.log('         —');
      console.log('');
    }
  };

  if (watch) {
    await watchRender({ render: renderOnce, interval_secs });
    return;
  }
  renderOnce();
}
