import { execFileSync } from 'child_process';
import path from 'path';

import { listRunningSessions, getFactoryPackageInfo, isPm2Available } from '../../utils/factory-processes.js';

export async function startSessionHandler(argv) {
  const { target } = argv || {};
  const dir = path.resolve(target || process.cwd());

  const info = getFactoryPackageInfo(dir);
  if (!info) {
    console.error(`"${dir}" doesn't look like a factory repo (missing @assemblyline/lib-factory dependency or package.json "main" field).`);
    process.exit(1);
  }

  const name = path.basename(dir);

  const existing = listRunningSessions().find((r) => r.cwd === dir);
  if (existing) {
    console.error(`Factory session "${name}" is already running (pid ${existing.pid}, mode ${existing.mode}).`);
    console.error('Use "al-factory procs stop" first, or "al-factory procs restart".');
    process.exit(1);
  }

  if (!isPm2Available()) {
    console.error('pm2 not found — install with `npm i -g pm2`');
    process.exit(1);
  }

  execFileSync('pm2', ['start', info.main, '--name', name], { cwd: dir, stdio: 'inherit' });
}
