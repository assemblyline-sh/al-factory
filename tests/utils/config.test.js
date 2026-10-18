import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { loadConfig, ensureTempDir, getRelevantEnvVars } from '../../src/utils/config.js';

// ============================================================================
// loadConfig
// ============================================================================

describe('loadConfig()', () => {
  it('should return stepsDir relative to cwd', () => {
    // Arrange
    const cwd = process.cwd();

    // Act
    const config = loadConfig();

    // Assert
    expect(config.stepsDir).toBe(path.resolve(cwd, './src/steps'));
  });

  it('should return tempDir relative to cwd', () => {
    // Arrange
    const cwd = process.cwd();

    // Act
    const config = loadConfig();

    // Assert
    expect(config.tempDir).toBe(path.resolve(cwd, './temp'));
  });

  it('should return an object with exactly stepsDir and tempDir', () => {
    // Act
    const config = loadConfig();

    // Assert
    expect(Object.keys(config).sort()).toEqual(['stepsDir', 'tempDir'].sort());
  });
});

// ============================================================================
// ensureTempDir
// ============================================================================

describe('ensureTempDir()', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `fob-test-ensure-${Date.now()}`);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create the directory if it does not exist', () => {
    // Arrange — dir does not exist yet

    // Act
    ensureTempDir(tempDir);

    // Assert
    expect(fs.existsSync(tempDir)).toBe(true);
  });

  it('should not throw if the directory already exists', () => {
    // Arrange
    fs.mkdirSync(tempDir);

    // Act & Assert
    expect(() => ensureTempDir(tempDir)).not.toThrow();
  });
});

// ============================================================================
// getRelevantEnvVars
// ============================================================================

describe('getRelevantEnvVars()', () => {
  let original;

  beforeEach(() => {
    original = {
      ORCHESTRATOR_URL: process.env.ORCHESTRATOR_URL,
      FACTORY_LOCATION: process.env.FACTORY_LOCATION,
      ORCHESTRATOR_API_KEY: process.env.ORCHESTRATOR_API_KEY,
      ORCHESTRATOR_API_SECRET: process.env.ORCHESTRATOR_API_SECRET,
    };
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(original)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('should return ORCHESTRATOR_URL as-is when set', () => {
    // Arrange
    process.env.ORCHESTRATOR_URL = 'https://api.example.com';

    // Act
    const result = getRelevantEnvVars();

    // Assert
    expect(result.ORCHESTRATOR_URL).toBe('https://api.example.com');
  });

  it('should return FACTORY_LOCATION as-is when set', () => {
    // Arrange
    process.env.FACTORY_LOCATION = 'acme';

    // Act
    const result = getRelevantEnvVars();

    // Assert
    expect(result.FACTORY_LOCATION).toBe('acme');
  });

  it('should reveal no characters of a long ORCHESTRATOR_API_KEY', () => {
    // Arrange
    process.env.ORCHESTRATOR_API_KEY = 'abcdefghij12345678901234567890';

    // Act
    const result = getRelevantEnvVars();

    // Assert
    expect(result.ORCHESTRATOR_API_KEY).toBe('*** (set)');
  });

  it('should reveal no characters of ORCHESTRATOR_API_SECRET', () => {
    // Arrange
    process.env.ORCHESTRATOR_API_SECRET = 'super-secret-value-0123456789';

    // Act
    const result = getRelevantEnvVars();

    // Assert
    expect(result.ORCHESTRATOR_API_SECRET).toBe('*** (set)');
  });

  it('should return undefined for unset vars', () => {
    // Arrange
    delete process.env.ORCHESTRATOR_URL;
    delete process.env.FACTORY_LOCATION;
    delete process.env.ORCHESTRATOR_API_KEY;
    delete process.env.ORCHESTRATOR_API_SECRET;

    // Act
    const result = getRelevantEnvVars();

    // Assert
    expect(result.ORCHESTRATOR_URL).toBeUndefined();
    expect(result.FACTORY_LOCATION).toBeUndefined();
    expect(result.ORCHESTRATOR_API_KEY).toBeUndefined();
    expect(result.ORCHESTRATOR_API_SECRET).toBeUndefined();
  });
});
