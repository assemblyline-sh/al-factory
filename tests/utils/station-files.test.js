import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  getStepConfigFromStation,
  getStationsDir,
  getScenariosDir,
  saveStation,
  loadStation,
  listLocalStationIds,
  findStationsWithStep,
  listScenarios,
  loadScenario,
  saveScenario,
} from '../../src/utils/station-files.js';

// ============================================================================
// Pure logic (no fs)
// ============================================================================

describe('getStationsDir()', () => {
  it('should return the stations directory path', () => {
    expect(getStationsDir()).toBe('.orchestrator/stations');
  });
});

describe('getScenariosDir()', () => {
  it('should return the scenarios directory path', () => {
    expect(getScenariosDir()).toBe('.orchestrator/scenarios');
  });
});

describe('getStepConfigFromStation()', () => {
  const station = {
    id: 'st1',
    name: 'My Station',
    steps: [
      { slug: 'org/step_a', config: { key: 'val_a' } },
      { slug: 'org/step_b', config: { key: 'val_b' } },
    ],
  };

  it('should return the config for a matching step slug', () => {
    // Act
    const result = getStepConfigFromStation(station, 'org/step_a');

    // Assert
    expect(result).toEqual({ key: 'val_a' });
  });

  it('should return null when the step slug is not found', () => {
    // Act
    const result = getStepConfigFromStation(station, 'org/missing');

    // Assert
    expect(result).toBeNull();
  });

  it('should return null when the station has no steps', () => {
    // Arrange
    const emptyStation = { id: 'p2', name: 'Empty', steps: [] };

    // Act
    const result = getStepConfigFromStation(emptyStation, 'org/step_a');

    // Assert
    expect(result).toBeNull();
  });

  it('should return null when steps is undefined', () => {
    // Arrange
    const noSteps = { id: 'p3', name: 'No Steps' };

    // Act
    const result = getStepConfigFromStation(noSteps, 'org/step_a');

    // Assert
    expect(result).toBeNull();
  });
});

// ============================================================================
// fs-dependent — use real temp dir, chdir into it
// ============================================================================

describe('saveStation() + loadStation() + listLocalStationIds()', () => {
  let tempDir;
  let originalCwd;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fob-station-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should save and reload a station by id', () => {
    // Arrange
    const station = { id: 'abc123', name: 'Test Station', steps: [] };

    // Act
    saveStation(station);
    const loaded = loadStation('abc123');

    // Assert
    expect(loaded).toEqual(station);
  });

  it('should return null for a station that was never saved', () => {
    // Act
    const result = loadStation('nonexistent');

    // Assert
    expect(result).toBeNull();
  });

  it('should list saved station ids', () => {
    // Arrange
    saveStation({ id: 'id1', name: 'Station One', steps: [] });
    saveStation({ id: 'id2', name: 'Station Two', steps: [] });

    // Act
    const ids = listLocalStationIds();

    // Assert
    expect(ids).toContain('id1');
    expect(ids).toContain('id2');
  });

  it('should return empty array when no stations saved', () => {
    // Act
    const ids = listLocalStationIds();

    // Assert
    expect(ids).toEqual([]);
  });

  it('should replace old file when station name changes', () => {
    // Arrange
    const station = { id: 'rename1', name: 'Old Name', steps: [] };
    saveStation(station);

    // Act
    saveStation({ ...station, name: 'New Name' });
    const loaded = loadStation('rename1');

    // Assert
    expect(loaded.name).toBe('New Name');

    // Only one file should exist for this id
    const files = fs.readdirSync('.orchestrator/stations');
    const forId = files.filter(f => f.startsWith('rename1__'));
    expect(forId).toHaveLength(1);
  });

  it('should not read stations from the legacy .orchestrator/processes/ directory', () => {
    // Arrange — a factory repo that pulled before the rename should re-pull,
    // not get silent reads from the legacy location.
    fs.mkdirSync('.orchestrator/processes', { recursive: true });
    fs.writeFileSync(
      '.orchestrator/processes/legacy1__legacy_station.json',
      JSON.stringify({ id: 'legacy1', name: 'Legacy', steps: [] }, null, 2),
    );

    // Act
    const loaded = loadStation('legacy1');

    // Assert
    expect(loaded).toBeNull();
  });
});

describe('findStationsWithStep()', () => {
  let tempDir;
  let originalCwd;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fob-station-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return stations that contain the step slug', () => {
    // Arrange
    saveStation({ id: 'p1', name: 'Has Step', steps: [{ slug: 'org/my_step', config: {} }] });
    saveStation({ id: 'p2', name: 'No Step', steps: [{ slug: 'org/other_step', config: {} }] });

    // Act
    const result = findStationsWithStep('org/my_step');

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
  });

  it('should return empty array when no station contains the step', () => {
    // Arrange
    saveStation({ id: 'p1', name: 'Station', steps: [{ slug: 'org/other', config: {} }] });

    // Act
    const result = findStationsWithStep('org/missing');

    // Assert
    expect(result).toEqual([]);
  });
});

// ============================================================================
// Scenario management
// ============================================================================

describe('saveScenario() + loadScenario() + listScenarios()', () => {
  let tempDir;
  let originalCwd;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fob-scenario-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should save and reload a scenario', () => {
    // Arrange
    const config = { to: 'test@example.com', subject: 'Hello' };

    // Act
    saveScenario('org/send_email', 'happy-path', config);
    const loaded = loadScenario('org/send_email', 'happy-path');

    // Assert
    expect(loaded).toEqual(config);
  });

  it('should return null for a missing scenario', () => {
    // Act
    const result = loadScenario('org/send_email', 'nonexistent');

    // Assert
    expect(result).toBeNull();
  });

  it('should list saved scenario names without extension', () => {
    // Arrange
    saveScenario('org/send_email', 'happy-path', {});
    saveScenario('org/send_email', 'error-case', {});

    // Act
    const names = listScenarios('org/send_email');

    // Assert
    expect(names).toContain('happy-path');
    expect(names).toContain('error-case');
  });

  it('should return empty array when no scenarios exist', () => {
    // Act
    const result = listScenarios('org/no_scenarios');

    // Assert
    expect(result).toEqual([]);
  });
});

// ============================================================================
// Line files
// ============================================================================

describe('listLocalLines()', () => {
  let tmp_dir;
  let original_cwd;

  beforeEach(() => {
    tmp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fob-lines-'));
    original_cwd = process.cwd();
    process.chdir(tmp_dir);
  });

  afterEach(() => {
    process.chdir(original_cwd);
    fs.rmSync(tmp_dir, { recursive: true, force: true });
  });

  it('returns an empty map when .orchestrator/lines/ does not exist', async () => {
    const { listLocalLines } = await import('../../src/utils/station-files.js');
    expect(listLocalLines()).toEqual({});
  });

  it('keys line files by code and skips malformed ones', async () => {
    const { listLocalLines, getLinesDir } = await import('../../src/utils/station-files.js');
    fs.mkdirSync(getLinesDir(), { recursive: true });
    fs.writeFileSync(path.join(getLinesDir(), 'VM.json'), JSON.stringify({ id: 'l1', code: 'VM', name: 'Voice memos', location: 'alex-laptop1' }));
    fs.writeFileSync(path.join(getLinesDir(), 'bad.json'), '{ not json');

    const lines = listLocalLines();
    expect(Object.keys(lines)).toEqual(['VM']);
    expect(lines.VM.location).toBe('alex-laptop1');
  });
});
