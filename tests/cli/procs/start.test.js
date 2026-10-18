import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { captureOutput, ExitError } from '../helpers.js';

const mockListRunningSessions = jest.fn();
const mockGetFactoryPackageInfo = jest.fn();
const mockIsPm2Available = jest.fn();
const mockExecFileSync = jest.fn();

jest.unstable_mockModule('../../../src/utils/factory-processes.js', () => ({
  listRunningSessions: mockListRunningSessions,
  getFactoryPackageInfo: mockGetFactoryPackageInfo,
  isPm2Available: mockIsPm2Available,
}));

jest.unstable_mockModule('child_process', () => ({
  execFileSync: mockExecFileSync,
}));

const { startSessionHandler } = await import('../../../src/cli/procs/start.js');

describe('startSessionHandler()', () => {
  let out;

  beforeEach(() => {
    jest.clearAllMocks();
    out = captureOutput();
    mockListRunningSessions.mockReturnValue([]);
    mockIsPm2Available.mockReturnValue(true);
  });

  afterEach(() => {
    out.restore();
  });

  it('should exit 1 when the target is not a factory repo', async () => {
    // Arrange
    mockGetFactoryPackageInfo.mockReturnValue(null);

    // Act & Assert
    await expect(startSessionHandler({ target: '/some/random/dir' })).rejects.toThrow(ExitError);
    expect(out.stderr).toContain("doesn't look like a factory repo");
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('should exit 1 when the factory session is already running', async () => {
    // Arrange
    mockGetFactoryPackageInfo.mockReturnValue({ main: 'src/index.js' });
    mockListRunningSessions.mockReturnValue([
      { pid: '999', factory: 'factory-alex', mode: 'pm2', cwd: '/factories/factory-alex' },
    ]);

    // Act & Assert
    await expect(startSessionHandler({ target: '/factories/factory-alex' })).rejects.toThrow(ExitError);
    expect(out.stderr).toContain('already running (pid 999, mode pm2)');
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('should exit 1 with a friendly message when pm2 is not installed', async () => {
    // Arrange
    mockGetFactoryPackageInfo.mockReturnValue({ main: 'src/index.js' });
    mockIsPm2Available.mockReturnValue(false);

    // Act & Assert
    await expect(startSessionHandler({ target: '/factories/factory-alex' })).rejects.toThrow(ExitError);
    expect(out.stderr).toContain('pm2 not found');
  });

  it('should start the factory session under pm2 with the directory basename as name and cwd', async () => {
    // Arrange
    mockGetFactoryPackageInfo.mockReturnValue({ main: 'src/index.js' });

    // Act
    await startSessionHandler({ target: '/factories/factory-alex' });

    // Assert
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'pm2',
      ['start', 'src/index.js', '--name', 'factory-alex'],
      expect.objectContaining({ cwd: '/factories/factory-alex' }),
    );
  });
});
