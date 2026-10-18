import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeWorkpiece, writeStationDefs } from '../../fixtures/stations.js';
import { captureOutput, ExitError } from '../helpers.js';
import { watchHandler } from '../../../src/cli/workpieces/watch.js';


// These tests exercise the routing logic of `al-factory workpieces watch` —
// specifically: scope validation, error paths, and what happens before
// the watch loop starts. The loop itself runs forever, so we don't
// exercise it here (tested manually + via line-state.test.js).

describe('watchHandler() — routing', () => {
  let tempDir;
  let originalCwd;
  let out;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fob-watch-route-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    const stations_root = path.join(tempDir, 'temp', 'stations');
    fs.mkdirSync(stations_root, { recursive: true });
    makeWorkpiece(stations_root, 'VM3', 'failed', 'stuck-a');
    writeStationDefs(path.join(tempDir, 'temp', 'stations'), tempDir);
    out = captureOutput();
  });

  afterEach(() => {
    out.restore();
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should exit with a usage message when no scope flag and no id is provided', async () => {
    // Act + Assert
    await expect(watchHandler({})).rejects.toBeInstanceOf(ExitError);
    expect(out.stderr).toMatch(/Usage: al-factory workpieces watch/);
  });

  it('should exit when the workpiece id matches nothing', async () => {
    // Act + Assert
    await expect(watchHandler({ id: 'ghost' })).rejects.toBeInstanceOf(ExitError);
    expect(out.stderr).toMatch(/No workpiece matches "ghost"/);
  });

  it('should exit when the --bin spec is invalid', async () => {
    // Act + Assert
    await expect(watchHandler({ bin: 'not-a-spec' })).rejects.toBeInstanceOf(ExitError);
    expect(out.stderr).toMatch(/Invalid bin spec/);
  });

  it('should exit when --line points at a missing line', async () => {
    // Act + Assert
    await expect(watchHandler({ line: 'ZZ' })).rejects.toBeInstanceOf(ExitError);
    expect(out.stderr).toMatch(/Line "ZZ" not found/);
  });

  it('should print "No workpieces in scope" and exit cleanly when scope is empty', async () => {
    // Arrange — VM3/input exists but is empty
    fs.mkdirSync(path.join(tempDir, 'temp', 'stations', 'VM3', 'input'), { recursive: true });

    // Act
    await watchHandler({ bin: 'VM3/input' });

    // Assert — no error, no infinite loop entered
    expect(out.stdout).toMatch(/No workpieces in scope/);
  });
});
