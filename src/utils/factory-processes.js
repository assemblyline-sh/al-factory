/**
 * Detects locally-running factory sessions and resolves whether they're
 * pm2-managed or run directly.
 *
 * A process is considered a factory session if its cwd's package.json depends on
 * `@assemblyline/lib-factory` and the process command matches that package.json's
 * `main` entry — not tied to any fixed folder or entrypoint filename.
 *
 * macOS and Linux only. Both expose `ps -o lstart` and `lsof` in compatible
 * formats; cwd resolution differs (see `cwdOf`).
 */

import { execSync } from 'child_process';
import { readFileSync, readlinkSync } from 'fs';
import path from 'path';

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 10 * 1024 * 1024 });
  } catch {
    return '';
  }
}

function processSnapshot() {
  // Leading `\s*` is load-bearing: `ps` right-aligns the pid/ppid columns and
  // pads them with spaces, so an anchored `^(\d+)` never matches real output.
  const re = /^\s*(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\S+)\s+(.*)$/;
  const procs = new Map();
  for (const line of sh('ps -A -o pid=,ppid=,lstart=,etime=,command=').split('\n')) {
    const m = line.match(re);
    if (!m) continue;
    const [, pid, ppid, lstart, etime, command] = m;
    procs.set(pid, { pid, ppid, lstart, etime, command });
  }
  return procs;
}

function nodeCandidates(procs) {
  return [...procs.values()].filter(
    (p) => path.basename(p.command.split(/\s+/)[0]) === 'node'
  );
}

/**
 * Resolve a pid's working directory.
 *
 * On Linux `/proc/<pid>/cwd` is a symlink to the answer — no subprocess, no
 * dependency on `lsof` being installed (minimal containers often omit it),
 * and far cheaper than spawning `lsof` once per candidate pid. macOS has no
 * `/proc`, so it keeps the `lsof` path.
 *
 * Returns null for processes owned by another user, where the symlink exists
 * but is not readable (EACCES) — same outcome as `lsof` yielding nothing.
 *
 * @param {string} pid
 * @returns {string | null}
 */
function cwdOf(pid) {
  if (process.platform === 'linux') {
    try {
      return readlinkSync(`/proc/${pid}/cwd`);
    } catch {
      return null;
    }
  }
  const line = sh(`lsof -p ${pid} -a -d cwd -Fn`)
    .split('\n')
    .find((l) => l.startsWith('n'));
  return line ? line.slice(1) : null;
}

/**
 * Check whether `cwd` is a factory repo and return its package.json `main` entry.
 * @param {string} cwd
 * @returns {{ main: string } | null}
 */
export function getFactoryPackageInfo(cwd) {
  try {
    const pkg = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (!('@assemblyline/lib-factory' in deps) || !pkg.main) return null;
    return { main: pkg.main };
  } catch {
    return null;
  }
}

function listeningPort(pid) {
  const line = sh(`lsof -nP -a -p ${pid} -iTCP -sTCP:LISTEN`)
    .split('\n')
    .find((l) => l.includes('LISTEN'));
  return line?.match(/:(\d+)\s*\(LISTEN\)/)?.[1] ?? '-';
}

function pm2Apps() {
  try {
    const list = JSON.parse(sh('pm2 jlist'));
    return list.map((p) => ({
      pid: String(p.pid),
      name: p.name,
      cwd: p.pm2_env?.pm_cwd,
      status: p.pm2_env?.status,
    }));
  } catch {
    return [];
  }
}

/**
 * List all locally-running factory sessions on this machine.
 *
 * pm2-managed factory sessions are resolved directly from `pm2 jlist`'s own `pm_cwd`
 * field, NOT by matching `ps`-visible command text — pm2 rewrites the OS
 * process title when it directly forks a `.js` script (for its own
 * `pm2 monit`/`pm2 list` display), which can truncate/corrupt the argv text
 * `ps` reports. Trusting pm2's own bookkeeping instead sidesteps that
 * entirely and is also just more direct: pm2 already knows what it's running.
 *
 * @returns {Array<{pid: string, factory: string, mode: 'direct'|'pm2', pm2: string, cwd: string, port: string, uptime: string, started: string}>}
 */
export function listRunningSessions() {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    console.error(`Warning: "al-factory procs" process detection requires macOS or Linux and is unsupported on ${process.platform}.`);
    return [];
  }

  const procs = processSnapshot();
  const apps = pm2Apps();
  const rows = [];
  const claimedCwds = new Set();

  for (const app of apps) {
    if (app.status !== 'online' || !app.cwd) continue;
    const info = getFactoryPackageInfo(app.cwd);
    if (!info) continue; // some other, non-fob pm2 app

    // A pm2 app that wraps its target (e.g. "npm run start") is tracked under
    // a different pid than the actual `node <main>` grandchild doing the work —
    // claim the *cwd*, not just this pid, so that grandchild isn't also
    // double-counted below as a separate "direct" row.
    claimedCwds.add(app.cwd);
    const proc = procs.get(app.pid);
    rows.push({
      pid: app.pid,
      factory: path.basename(app.cwd),
      mode: 'pm2',
      pm2: app.name,
      cwd: app.cwd,
      port: listeningPort(app.pid),
      uptime: proc?.etime ?? '-',
      started: proc?.lstart ?? '-',
    });
  }

  for (const proc of nodeCandidates(procs)) {
    const cwd = cwdOf(proc.pid);
    if (!cwd || claimedCwds.has(cwd)) continue;

    const info = getFactoryPackageInfo(cwd);
    if (!info || !proc.command.includes(info.main)) continue;
    // `node --watch <main>` is a supervisor that never executes the app itself —
    // it spawns a child (plain `node <main>`, no --watch) that does the real work.
    if (proc.command.includes('--watch')) continue;

    rows.push({
      pid: proc.pid,
      factory: path.basename(cwd),
      mode: 'direct',
      pm2: '-',
      cwd,
      port: listeningPort(proc.pid),
      uptime: proc.etime,
      started: proc.lstart,
    });
  }

  rows.sort((a, b) => a.factory.localeCompare(b.factory) || Number(a.pid) - Number(b.pid));
  return rows;
}

/**
 * Resolve a `target` (pm2 name, factory repo dirname, or omitted = cwd's dirname)
 * to a currently-running factory session row, or null if none matches.
 * @param {string} [target]
 * @returns {ReturnType<typeof listRunningSessions>[number] | null}
 */
export function resolveRunningSession(target) {
  const key = target || path.basename(process.cwd());
  return listRunningSessions().find((r) => r.pm2 === key || r.factory === key) ?? null;
}

/**
 * @returns {boolean} whether the `pm2` binary is available on PATH
 */
export function isPm2Available() {
  try {
    execSync('pm2 --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
