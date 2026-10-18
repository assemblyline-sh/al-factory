import { listRunningSessions } from '../../utils/factory-processes.js';
import { formatTable } from '../../utils/format.js';

export async function listSessionsHandler(argv) {
  const { json } = argv || {};
  const rows = listRunningSessions();

  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (rows.length === 0) {
    console.log('No running factory sessions found.');
    return;
  }

  const headers = ['PID', 'FACTORY', 'MODE', 'PM2', 'PORT', 'UPTIME', 'STARTED'];
  const table = rows.map((r) => [r.pid, r.factory, r.mode, r.pm2, r.port, r.uptime, r.started]);
  console.log(formatTable(headers, table));
}
