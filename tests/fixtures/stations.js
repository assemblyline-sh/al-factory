/**
 * Synthetic factory-repo fixtures: station files under `.orchestrator/stations/`
 * and bins under `temp/stations/{station}/{bin}/`.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Make a workpiece dir at {stations_root}/{station}/{bin}/{id}/ with its
 * pointer.json marker. Optionally drop a log.jsonl with the given events.
 */
export function makeWorkpiece(stations_root, station, bin, id, events = null) {
  const dir = path.join(stations_root, station, bin, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'pointer.json'), '{}');
  if (events) {
    fs.writeFileSync(
      path.join(dir, 'log.jsonl'),
      events.map((e) => JSON.stringify(e)).join('\n') + '\n',
    );
  }
  return dir;
}

/**
 * Make an (empty) bin dir without any workpieces.
 */
export function makeBinDir(stations_root, station, bin) {
  fs.mkdirSync(path.join(stations_root, station, bin), { recursive: true });
}

/**
 * Write `{repo_root}/.orchestrator/stations/` files for every station dir under
 * stations_root named like `VM3`: the letters are the line, and each station
 * depends on the previous number, so topology follows the numbering. Dirs that
 * don't match (e.g. "VM5 old") get no station file.
 */
export function writeStationDefs(stations_root, repo_root) {
  const defs_dir = path.join(repo_root, '.orchestrator', 'stations');
  fs.mkdirSync(defs_dir, { recursive: true });
  const by_line = {};
  for (const code of fs.readdirSync(stations_root)) {
    const m = code.match(/^([A-Z]{2})(\d+)$/);
    if (m) (by_line[m[1]] ||= []).push(code);
  }
  for (const [line, codes] of Object.entries(by_line)) {
    codes.sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
    codes.forEach((code, i) => {
      const def = { id: `id-${code}`, short_code: code, name: code, line, dependencies: i ? [codes[i - 1]] : [] };
      fs.writeFileSync(path.join(defs_dir, `${code}__station.json`), JSON.stringify(def));
    });
  }
}
