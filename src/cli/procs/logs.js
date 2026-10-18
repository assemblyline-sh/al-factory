import { execFileSync } from 'child_process';

import { requirePm2Target } from './stop.js';

export async function logsSessionHandler(argv) {
  const match = requirePm2Target(argv);

  try {
    execFileSync('pm2', ['logs', match.pm2], { stdio: 'inherit' });
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('pm2 not found — install with `npm i -g pm2`');
      process.exit(1);
    }
    // pm2 logs runs until Ctrl-C (SIGINT) — that's a normal exit, not a real error.
  }
}
