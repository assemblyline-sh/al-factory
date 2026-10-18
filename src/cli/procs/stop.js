import { execFileSync } from 'child_process';

import { resolveRunningSession } from '../../utils/factory-processes.js';

/**
 * Resolve `argv.target` to a pm2-managed factory session, or exit with a clear error.
 * @param {{target?: string}} argv
 * @returns {ReturnType<typeof resolveRunningSession>}
 */
export function requirePm2Target(argv) {
  const { target } = argv || {};
  const key = target || 'the factory session in the current directory';
  const match = resolveRunningSession(target);

  if (!match) {
    console.error(`No running factory session matches ${target ? `"${target}"` : key}. Run "al-factory procs list" to see running sessions.`);
    process.exit(1);
  }

  if (match.mode !== 'pm2') {
    console.error(`Factory session "${match.factory}" (pid ${match.pid}) is running directly, not under pm2 — can't manage it this way.`);
    console.error(`Kill it manually: kill ${match.pid}  (see "al-factory procs list" for details)`);
    process.exit(1);
  }

  return match;
}

export async function stopSessionHandler(argv) {
  const match = requirePm2Target(argv);
  execFileSync('pm2', ['stop', match.pm2], { stdio: 'inherit' });
}
