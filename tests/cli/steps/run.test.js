import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'path';
import { captureOutput, ExitError } from '../helpers.js';

const mockLoadConfig = jest.fn();
const mockEnsureTempDir = jest.fn();
const mockLoadLibFactory = jest.fn();
const mockInitTemplates = jest.fn();
const mockResolveConfig = jest.fn();
const mockLoadSteps = jest.fn();
const mockGetHandler = jest.fn();
const mockSaveStepOutput = jest.fn();
const mockLoadAllStepOutputs = jest.fn();
const mockLoadStation = jest.fn();
const mockGetStepConfigFromStation = jest.fn();
const mockFindStationsWithStep = jest.fn();
const mockListScenarios = jest.fn();
const mockLoadScenario = jest.fn();
const mockInteractivePicker = jest.fn();

jest.unstable_mockModule('../../../src/utils/config.js', () => ({
  loadConfig: mockLoadConfig,
  ensureTempDir: mockEnsureTempDir,
}));

jest.unstable_mockModule('../../../src/utils/lib-factory-loader.js', () => ({
  loadLibFactory: mockLoadLibFactory,
}));

jest.unstable_mockModule('../../../src/utils/steps-loader.js', () => ({
  loadSteps: mockLoadSteps,
  getHandler: mockGetHandler,
}));

jest.unstable_mockModule('../../../src/utils/output.js', () => ({
  saveStepOutput: mockSaveStepOutput,
  loadAllStepOutputs: mockLoadAllStepOutputs,
}));

jest.unstable_mockModule('../../../src/utils/station-files.js', () => ({
  loadStation: mockLoadStation,
  getStepConfigFromStation: mockGetStepConfigFromStation,
  findStationsWithStep: mockFindStationsWithStep,
  listScenarios: mockListScenarios,
  loadScenario: mockLoadScenario,
}));

jest.unstable_mockModule('../../../src/utils/picker.js', () => ({
  interactivePicker: mockInteractivePicker,
}));

const { runStepHandler } = await import('../../../src/cli/steps/run.js');

describe('runStepHandler()', () => {
  let out;
  const mockStepHandler = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    out = captureOutput();
    mockLoadConfig.mockReturnValue({
      stepsDir: path.join(process.cwd(), 'src/steps'),
      tempDir: path.join(process.cwd(), 'temp'),
    });
    mockLoadLibFactory.mockResolvedValue({
      initTemplates: mockInitTemplates,
      resolveConfig: mockResolveConfig,
    });
    mockLoadAllStepOutputs.mockReturnValue({});
    mockLoadSteps.mockResolvedValue({ 'acme/fetch_data': {} });
    mockGetHandler.mockReturnValue(mockStepHandler);
    mockStepHandler.mockResolvedValue({ status: 'ok' });
    mockSaveStepOutput.mockReturnValue(path.join(process.cwd(), 'temp/acme__fetch_data.json'));
    mockResolveConfig.mockImplementation(config => config);
  });

  afterEach(() => {
    out.restore();
  });

  it('should exit 1 when the step slug is not found in the registry', async () => {
    // Arrange
    mockGetHandler.mockReturnValue(null);

    // Act & Assert
    await expect(
      runStepHandler({ slug: 'acme/unknown', station: undefined, scenario: undefined, empty: false })
    ).rejects.toThrow(ExitError);
    expect(out.stderr).toContain('Unknown step: acme/unknown');
  });

  it('should run with an empty config when --empty is passed', async () => {
    // Act
    await runStepHandler({ slug: 'acme/fetch_data', station: undefined, scenario: undefined, empty: true });

    // Assert
    expect(mockStepHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        step: expect.objectContaining({ slug: 'acme/fetch_data', config: {} }),
      })
    );
    expect(out.stdout).toContain('Config: empty (--empty flag)');
  });

  it('should run with config from a station when --station is passed', async () => {
    // Arrange
    const stepConfig = { account_id: '123' };
    mockLoadStation.mockReturnValue({ id: 'st-1', name: 'Billing', steps: [] });
    mockGetStepConfigFromStation.mockReturnValue(stepConfig);

    // Act
    await runStepHandler({ slug: 'acme/fetch_data', station: 'st-1', scenario: undefined, empty: false });

    // Assert
    expect(mockResolveConfig).toHaveBeenCalledWith(stepConfig, {});
    expect(out.stdout).toContain('Config: station: Billing (st-1)');
  });

  it('should exit 1 when the station is not found locally', async () => {
    // Arrange
    mockLoadStation.mockReturnValue(null);

    // Act & Assert
    await expect(
      runStepHandler({ slug: 'acme/fetch_data', station: 'st-missing', scenario: undefined, empty: false })
    ).rejects.toThrow(ExitError);
    expect(out.stderr).toContain('Station not found locally: st-missing');
  });

  it('should exit 1 when the step is not found in the specified station', async () => {
    // Arrange
    mockLoadStation.mockReturnValue({ id: 'st-1', name: 'Billing', steps: [{ slug: 'acme/other' }] });
    mockGetStepConfigFromStation.mockReturnValue(null);

    // Act & Assert
    await expect(
      runStepHandler({ slug: 'acme/fetch_data', station: 'st-1', scenario: undefined, empty: false })
    ).rejects.toThrow(ExitError);
    expect(out.stderr).toContain('Step "acme/fetch_data" not found in station "st-1"');
  });

  it('should run with config from a scenario when --scenario is passed', async () => {
    // Arrange
    const scenarioConfig = { account_id: 'test-account' };
    mockLoadScenario.mockReturnValue(scenarioConfig);

    // Act
    await runStepHandler({ slug: 'acme/fetch_data', station: undefined, scenario: 'test-case', empty: false });

    // Assert
    expect(mockResolveConfig).toHaveBeenCalledWith(scenarioConfig, {});
    expect(out.stdout).toContain('Config: scenario: test-case');
  });

  it('should exit 1 when the specified scenario is not found', async () => {
    // Arrange
    mockLoadScenario.mockReturnValue(null);
    mockListScenarios.mockReturnValue(['other-scenario']);

    // Act & Assert
    await expect(
      runStepHandler({ slug: 'acme/fetch_data', station: undefined, scenario: 'missing', empty: false })
    ).rejects.toThrow(ExitError);
    expect(out.stderr).toContain('Scenario not found: missing');
  });

  it('should save step output and print it after running', async () => {
    // Act
    await runStepHandler({ slug: 'acme/fetch_data', station: undefined, scenario: undefined, empty: true });

    // Assert
    expect(mockSaveStepOutput).toHaveBeenCalledWith(
      expect.any(String),
      'acme/fetch_data',
      { status: 'ok' }
    );
    expect(out.stdout).toContain('"status": "ok"');
    expect(out.stdout).toContain('Output saved:');
    expect(out.stdout).toContain('Step completed successfully');
  });
});
