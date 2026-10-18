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

const { stopSessionHandler, requirePm2Target } = await import('../../../src/cli/procs/stop.js');

describe('requirePm2Target()', () => {
  let out;

  beforeEach(() => {
    jest.clearAllMocks();
    out = captureOutput();
  });

  afterEach(() => {
    out.restore();
  });

  it('should exit 1 when no running factory session matches the target', () => {
    // Arrange
    mockResolveRunningSession.mockReturnValue(null);

    // Act & Assert
    expect(() => requirePm2Target({ target: 'nope' })).toThrow(ExitError);
    expect(out.stderr).toContain('No running factory session matches "nope"');
  });

  it('should exit 1 when the match is running directly, not under pm2', () => {
    // Arrange
    mockResolveRunningSession.mockReturnValue({ factory: 'factory-alex', pid: '123', mode: 'direct' });

    // Act & Assert
    expect(() => requirePm2Target({})).toThrow(ExitError);
    expect(out.stderr).toContain('running directly, not under pm2');
    expect(out.stderr).toContain('kill 123');
  });

  it('should return the match when it is pm2-managed', () => {
    // Arrange
    const match = { factory: 'factory-alex', pid: '123', mode: 'pm2', pm2: 'factory-alex' };
    mockResolveRunningSession.mockReturnValue(match);

    // Act
    const result = requirePm2Target({});

    // Assert
    expect(result).toBe(match);
  });
});

describe('stopSessionHandler()', () => {
  let out;

  beforeEach(() => {
    jest.clearAllMocks();
    out = captureOutput();
  });

  afterEach(() => {
    out.restore();
  });

  it('should call pm2 stop with the resolved pm2 name', async () => {
    // Arrange
    mockResolveRunningSession.mockReturnValue({ factory: 'factory-alex', pid: '123', mode: 'pm2', pm2: 'factory-alex' });

    // Act
    await stopSessionHandler({});

    // Assert
    expect(mockExecFileSync).toHaveBeenCalledWith('pm2', ['stop', 'factory-alex'], expect.objectContaining({ stdio: 'inherit' }));
  });
});
