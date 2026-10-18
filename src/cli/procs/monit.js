import { execFileSync } from 'child_process';

export async function monitSessionsHandler() {
  try {
    execFileSync('pm2', ['monit'], { stdio: 'inherit' });
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('pm2 not found — install with `npm i -g pm2`');
      process.exit(1);
    }
  }
}
