import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'path';
import { captureOutput } from '../helpers.js';

const mockLoadConfig = jest.fn();
const mockGetRelevantEnvVars = jest.fn();

jest.unstable_mockModule('../../../src/utils/config.js', () => ({
  loadConfig: mockLoadConfig,
  getRelevantEnvVars: mockGetRelevantEnvVars,
  ensureTempDir: jest.fn(),
}));

const { showConfigHandler } = await import('../../../src/cli/config/show.js');

// ============================================================================
// showConfigHandler()
// ============================================================================

describe('showConfigHandler()', () => {
  let out;

  beforeEach(() => {
    jest.clearAllMocks();
    out = captureOutput();
    mockLoadConfig.mockReturnValue({
      stepsDir: path.join(process.cwd(), 'src/steps'),
      tempDir: path.join(process.cwd(), 'temp'),
    });
  });

  afterEach(() => {
    out.restore();
  });

  it('should print the header and resolved paths', () => {
    // Arrange
    mockGetRelevantEnvVars.mockReturnValue({});

    // Act
    showConfigHandler();

    // Assert
    expect(out.stdout).toContain('stepsDir');
    expect(out.stdout).toContain('src/steps/');
    expect(out.stdout).toContain('tempDir');
    expect(out.stdout).toContain('temp');
  });

  it('should print environment variables when set', () => {
    // Arrange
    mockGetRelevantEnvVars.mockReturnValue({
      ORCHESTRATOR_URL: 'https://orchestrator.example.com',
      ORCHESTRATOR_API_KEY: '***',
      FACTORY_LOCATION: 'acme',
    });

    // Act
    showConfigHandler();

    // Assert
    expect(out.stdout).toContain('Environment Variables');
    expect(out.stdout).toContain('ORCHESTRATOR_URL');
    expect(out.stdout).toContain('https://orchestrator.example.com');
    expect(out.stdout).toContain('ORCHESTRATOR_API_KEY');
    expect(out.stdout).toContain('***');
  });

  it('should skip the environment variables section when all vars are undefined', () => {
    // Arrange
    mockGetRelevantEnvVars.mockReturnValue({
      ORCHESTRATOR_URL: undefined,
      ORCHESTRATOR_API_KEY: undefined,
      FACTORY_LOCATION: undefined,
    });

    // Act
    showConfigHandler();

    // Assert
    expect(out.stdout).not.toContain('Environment Variables');
  });
});
