import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { captureOutput } from '../helpers.js';

const mockResolveRunningSession = jest.fn();
const mockExecFileSync = jest.fn();

jest.unstable_mockModule('../../../src/utils/factory-processes.js', () => ({
  resolveRunningSession: mockResolveRunningSession,
}));

jest.unstable_mockModule('child_process', () => ({
  execFileSync: mockExecFileSync,
}));

const { restartSessionHandler } = await import('../../../src/cli/procs/restart.js');

describe('restartSessionHandler()', () => {
  let out;

  beforeEach(() => {
    jest.clearAllMocks();
    out = captureOutput();
  });

  afterEach(() => {
    out.restore();
  });

  it('should call pm2 restart with the resolved pm2 name', async () => {
    // Arrange
    mockResolveRunningSession.mockReturnValue({ factory: 'factory-alex', pid: '123', mode: 'pm2', pm2: 'factory-alex' });

    // Act
    await restartSessionHandler({});

    // Assert
    expect(mockExecFileSync).toHaveBeenCalledWith('pm2', ['restart', 'factory-alex'], expect.objectContaining({ stdio: 'inherit' }));
  });
});
