import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { captureOutput } from '../helpers.js';

const mockListRunningSessions = jest.fn();

jest.unstable_mockModule('../../../src/utils/factory-processes.js', () => ({
  listRunningSessions: mockListRunningSessions,
}));

const { listSessionsHandler } = await import('../../../src/cli/procs/list.js');

describe('listSessionsHandler()', () => {
  let out;

  beforeEach(() => {
    jest.clearAllMocks();
    out = captureOutput();
  });

  afterEach(() => {
    out.restore();
  });

  it('should print "No running factory sessions found." when there are none', async () => {
    // Arrange
    mockListRunningSessions.mockReturnValue([]);

    // Act
    await listSessionsHandler({});

    // Assert
    expect(out.stdout).toContain('No running factory sessions found.');
  });

  it('should print a table of running factory sessions', async () => {
    // Arrange
    mockListRunningSessions.mockReturnValue([
      {
        pid: '123',
        factory: 'factory-alex',
        mode: 'direct',
        pm2: '-',
        cwd: '/factories/factory-alex',
        port: '-',
        uptime: '1h',
        started: 'Wed Jul 16 2026',
      },
    ]);

    // Act
    await listSessionsHandler({});

    // Assert
    expect(out.stdout).toContain('FACTORY');
    expect(out.stdout).toContain('factory-alex');
    expect(out.stdout).toContain('direct');
    expect(out.stdout).toContain('123');
  });

  it('should print raw JSON when --json is passed', async () => {
    // Arrange
    const rows = [{ pid: '123', factory: 'factory-alex', mode: 'direct', pm2: '-', cwd: '/w', port: '-', uptime: '1h', started: 'x' }];
    mockListRunningSessions.mockReturnValue(rows);

    // Act
    await listSessionsHandler({ json: true });

    // Assert
    expect(JSON.parse(out.stdout)).toEqual(rows);
  });
});
