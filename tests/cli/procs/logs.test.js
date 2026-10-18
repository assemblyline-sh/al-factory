import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { captureOutput, ExitError } from '../helpers.js';

const mockResolveRunningSession = jest.fn();
const mockExecFileSync = jest.fn();

jest.unstable_mockModule('../../../src/utils/factory-processes.js', () => ({
  resolveRunningSession: mockResolveRunningSession,
}));

jest.unstable_mockModule('child_process', () => ({
  execFileSync: mockExecFileSync,
}));

const { logsSessionHandler } = await import('../../../src/cli/procs/logs.js');

describe('logsSessionHandler()', () => {
  let out;

  beforeEach(() => {
    jest.clearAllMocks();
    out = captureOutput();
  });

  afterEach(() => {
    out.restore();
  });

  it('should call pm2 logs with the resolved pm2 name', async () => {
    // Arrange
    mockResolveRunningSession.mockReturnValue({ factory: 'factory-alex', pid: '123', mode: 'pm2', pm2: 'factory-alex' });

    // Act
    await logsSessionHandler({});

    // Assert
    expect(mockExecFileSync).toHaveBeenCalledWith('pm2', ['logs', 'factory-alex'], expect.objectContaining({ stdio: 'inherit' }));
  });

  it('should exit 1 with a friendly message when pm2 is not on PATH', async () => {
    // Arrange
    mockResolveRunningSession.mockReturnValue({ factory: 'factory-alex', pid: '123', mode: 'pm2', pm2: 'factory-alex' });
    const enoent = new Error('not found');
    enoent.code = 'ENOENT';
    mockExecFileSync.mockImplementation(() => { throw enoent; });

    // Act & Assert
    await expect(logsSessionHandler({})).rejects.toThrow(ExitError);
    expect(out.stderr).toContain('pm2 not found');
  });

  it('should swallow a non-ENOENT error (e.g. Ctrl-C / SIGINT exit)', async () => {
    // Arrange
    mockResolveRunningSession.mockReturnValue({ factory: 'factory-alex', pid: '123', mode: 'pm2', pm2: 'factory-alex' });
    mockExecFileSync.mockImplementation(() => { throw new Error('SIGINT'); });

    // Act & Assert — should NOT throw
    await expect(logsSessionHandler({})).resolves.toBeUndefined();
  });
});
