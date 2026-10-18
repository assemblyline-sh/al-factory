import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  loadLineState,
  resolvePosition,
  findWorkpieceMatches,
  collectIdsForBin,
  readWorkpieceLog,
  workpieceDir,
  workpieceLink,
  summarizeLine,
  scanBinWorkpieces,
} from '../../src/utils/line-state.js';
import { makeWorkpiece, makeBinDir, writeStationDefs } from '../fixtures/stations.js';

// ============================================================================
// Helpers — build a synthetic stations tree on disk
// ============================================================================

/**
 * Load line state the way the CLI does: from the factory repo root (the
 * parent of stations_root), with station files describing the topology.
 */
function load(stations_root) {
  if (fs.existsSync(stations_root)) writeStationDefs(stations_root, path.dirname(stations_root));
  process.chdir(path.dirname(stations_root));
  return loadLineState({ stations_root });
}

const original_cwd = process.cwd();
afterEach(() => process.chdir(original_cwd));

// ============================================================================
// Pure helpers (no fs)
// ============================================================================

describe('workpieceLink()', () => {
  it('should URL-encode spaces while preserving slashes', () => {
    // Arrange
    const dir = '/tmp/stations/VM3/failed/20260605 192535';

    // Act
    const link = workpieceLink(dir);

    // Assert
    expect(link).toBe('file:///tmp/stations/VM3/failed/20260605%20192535');
  });
});

describe('collectIdsForBin()', () => {
  const lines = {
    VM: {
      code: 'VM',
      stations: ['VM3'],
      terminal: 'VM3',
      bins: { VM3: { failed: new Set(['a', 'b']), input: null, doing: null, output: null, done: null } },
    },
  };

  it('should return ids when the bin spec is valid and the bin has contents', () => {
    // Act
    const result = collectIdsForBin('VM3/failed', lines);

    // Assert
    expect(result).toEqual({ ok: true, ids: expect.arrayContaining(['a', 'b']) });
    expect(result.ids).toHaveLength(2);
  });

  it('should return empty ids when the bin exists but is missing on disk', () => {
    // Act
    const result = collectIdsForBin('VM3/input', lines);

    // Assert
    expect(result).toEqual({ ok: true, ids: [] });
  });

  it('should return an error for a malformed bin spec', () => {
    // Act
    const result = collectIdsForBin('not-a-spec', lines);

    // Assert
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid bin spec/);
  });

  it('should return an error when the station does not exist on the line', () => {
    // Act
    const result = collectIdsForBin('VM9/failed', lines);

    // Assert
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Station "VM9" not found/);
  });
});

// ============================================================================
// fs-dependent — synthetic stations tree
// ============================================================================

describe('loadLineState()', () => {
  let tempDir;
  let stations_root;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fob-line-state-'));
    stations_root = path.join(tempDir, 'stations');
    fs.mkdirSync(stations_root);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return an empty object when stations_root does not exist', () => {
    // Act
    process.chdir(tempDir);
    const lines = loadLineState({ stations_root: path.join(tempDir, 'missing') });

    // Assert
    expect(lines).toEqual({});
  });

  it('should group stations by the line in their station files', () => {
    // Arrange
    makeBinDir(stations_root, 'VM0', 'output');
    makeBinDir(stations_root, 'VM2', 'input');
    makeBinDir(stations_root, 'ZP1', 'input');

    // Act
    const lines = load(stations_root);

    // Assert
    expect(Object.keys(lines).sort()).toEqual(['VM', 'ZP']);
    expect(lines.VM.stations).toEqual(['VM0', 'VM2']);
    expect(lines.ZP.stations).toEqual(['ZP1']);
  });

  it('should order stations by dependencies and pick the last as terminal', () => {
    // Arrange
    makeBinDir(stations_root, 'VM10', 'output');
    makeBinDir(stations_root, 'VM2', 'output');
    makeBinDir(stations_root, 'VM0', 'output');

    // Act
    const lines = load(stations_root);

    // Assert
    expect(lines.VM.stations).toEqual(['VM0', 'VM2', 'VM10']);
    expect(lines.VM.terminal).toBe('VM10');
  });

  it('should ignore station directories with no station file (e.g. "VM5 old")', () => {
    // Arrange
    makeBinDir(stations_root, 'VM5', 'output');
    fs.mkdirSync(path.join(stations_root, 'VM5 old', 'done'), { recursive: true });

    // Act
    const lines = load(stations_root);

    // Assert
    expect(lines.VM.stations).toEqual(['VM5']);
  });

  it('should record null for bins that do not exist on disk', () => {
    // Arrange — VM0 only has output (line-head pattern)
    makeBinDir(stations_root, 'VM0', 'output');

    // Act
    const lines = load(stations_root);

    // Assert
    expect(lines.VM.bins.VM0.output).toBeInstanceOf(Map);
    expect(lines.VM.bins.VM0.input).toBeNull();
    expect(lines.VM.bins.VM0.failed).toBeNull();
  });

  it('should populate bins with workpiece ids', () => {
    // Arrange
    makeWorkpiece(stations_root, 'VM3', 'failed', 'wp1');
    makeWorkpiece(stations_root, 'VM3', 'failed', 'wp2');

    // Act
    const lines = load(stations_root);

    // Assert
    expect([...lines.VM.bins.VM3.failed.keys()].sort()).toEqual(['wp1', 'wp2']);
  });
});

describe('resolvePosition()', () => {
  let tempDir;
  let stations_root;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fob-line-state-'));
    stations_root = path.join(tempDir, 'stations');
    fs.mkdirSync(stations_root);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return null when the workpiece is nowhere on disk', () => {
    // Arrange
    makeBinDir(stations_root, 'VM0', 'output');
    const lines = load(stations_root);

    // Act
    const pos = resolvePosition('ghost', lines);

    // Assert
    expect(pos).toBeNull();
  });

  it('should report the most-advanced live bin when a workpiece appears in multiple', () => {
    // Arrange — workpiece exists in VM3/done (receipt) AND VM4/input (live).
    // VM5 exists so VM4 is not the terminal station for this test.
    makeBinDir(stations_root, 'VM5', 'output');
    makeWorkpiece(stations_root, 'VM3', 'done', 'wp');
    makeWorkpiece(stations_root, 'VM4', 'input', 'wp');
    const lines = load(stations_root);

    // Act
    const pos = resolvePosition('wp', lines);

    // Assert — VM4/input wins; VM3/done is just an archive
    expect(pos).toEqual({ line: 'VM', station: 'VM4', bin: 'input', subpath: 'wp', terminal: false });
  });

  it('should report terminal when the workpiece is at the highest-numbered station output', () => {
    // Arrange
    makeWorkpiece(stations_root, 'VM2', 'output', 'wp_other'); // ensure VM2 exists
    makeWorkpiece(stations_root, 'VM5', 'output', 'wp');
    const lines = load(stations_root);

    // Act
    const pos = resolvePosition('wp', lines);

    // Assert
    expect(pos.station).toBe('VM5');
    expect(pos.bin).toBe('output');
    expect(pos.terminal).toBe(true);
  });

  it('should mark anomaly when a workpiece is only in done and no live bin', () => {
    // Arrange — workpiece only in VM3/done, nowhere else
    makeWorkpiece(stations_root, 'VM3', 'done', 'orphan');
    const lines = load(stations_root);

    // Act
    const pos = resolvePosition('orphan', lines);

    // Assert
    expect(pos).toMatchObject({ line: 'VM', station: 'VM3', bin: 'done', anomaly: true });
  });

  it('should prefer output over input/doing/failed at the same station', () => {
    // Arrange — workpiece in BOTH VM3/failed and VM3/output (edge case)
    makeWorkpiece(stations_root, 'VM3', 'output', 'wp');
    makeWorkpiece(stations_root, 'VM3', 'failed', 'wp');
    const lines = load(stations_root);

    // Act
    const pos = resolvePosition('wp', lines);

    // Assert — output wins (most-advanced live bin priority)
    expect(pos.bin).toBe('output');
  });
});

describe('findWorkpieceMatches()', () => {
  let tempDir;
  let stations_root;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fob-line-state-'));
    stations_root = path.join(tempDir, 'stations');
    fs.mkdirSync(stations_root);
    makeWorkpiece(stations_root, 'VM3', 'failed', '20260605 a');
    makeWorkpiece(stations_root, 'VM3', 'failed', '20260605 b');
    makeWorkpiece(stations_root, 'VM5', 'output', '20260604 c');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return every distinct id whose name contains the query', () => {
    // Arrange
    const lines = load(stations_root);

    // Act
    const matches = findWorkpieceMatches('20260605', lines);

    // Assert
    expect([...matches.keys()].sort()).toEqual(['20260605 a', '20260605 b']);
  });

  it('should resolve each match to its live position, not the first-walked bin', () => {
    // Arrange — add a workpiece that appears at VM3/done AND VM4/input
    makeWorkpiece(stations_root, 'VM3', 'done', 'twin');
    makeWorkpiece(stations_root, 'VM4', 'input', 'twin');
    const lines = load(stations_root);

    // Act
    const matches = findWorkpieceMatches('twin', lines);

    // Assert
    expect(matches.get('twin')).toEqual({
      line: 'VM', station: 'VM4', bin: 'input', subpath: 'twin', terminal: false,
    });
  });

  it('should return an empty map when no id matches', () => {
    // Arrange
    const lines = load(stations_root);

    // Act
    const matches = findWorkpieceMatches('xxxx', lines);

    // Assert
    expect(matches.size).toBe(0);
  });
});

describe('readWorkpieceLog()', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fob-line-state-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return an empty array when log.jsonl is missing', () => {
    // Arrange
    fs.mkdirSync(path.join(tempDir, 'wp'));

    // Act
    const events = readWorkpieceLog(path.join(tempDir, 'wp'));

    // Assert
    expect(events).toEqual([]);
  });

  it('should parse a multi-line log and skip blank lines', () => {
    // Arrange
    const dir = path.join(tempDir, 'wp');
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, 'log.jsonl'),
      [
        JSON.stringify({ ts: '2026-06-05T20:07:08.918Z', station: 'VM0', event: 'workpiece_created' }),
        '',
        JSON.stringify({ ts: '2026-06-06T08:31:20.007Z', station: 'VM2', event: 'station_started' }),
        '',
      ].join('\n'),
    );

    // Act
    const events = readWorkpieceLog(dir);

    // Assert
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ station: 'VM0', event: 'workpiece_created' });
    expect(events[1]).toMatchObject({ station: 'VM2', event: 'station_started' });
  });

  it('should silently drop malformed lines without throwing', () => {
    // Arrange
    const dir = path.join(tempDir, 'wp');
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, 'log.jsonl'),
      [
        JSON.stringify({ ts: '2026-06-05T20:07:08.918Z', station: 'VM0', event: 'ok' }),
        '{not valid json',
        JSON.stringify({ ts: '2026-06-06T08:31:20.007Z', station: 'VM2', event: 'ok2' }),
      ].join('\n'),
    );

    // Act
    const events = readWorkpieceLog(dir);

    // Assert
    expect(events.map((e) => e.event)).toEqual(['ok', 'ok2']);
  });
});

describe('summarizeLine()', () => {
  let tempDir;
  let stations_root;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fob-line-state-'));
    stations_root = path.join(tempDir, 'stations');
    fs.mkdirSync(stations_root);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should count stuck workpieces in failed, in-flight in non-terminal live bins, finished at terminal output', () => {
    // Arrange — 7 stuck at VM3/failed, 8 finished at VM5/output
    for (let i = 0; i < 7; i++) makeWorkpiece(stations_root, 'VM3', 'failed', `stuck${i}`);
    for (let i = 0; i < 8; i++) makeWorkpiece(stations_root, 'VM5', 'output', `done${i}`);
    makeBinDir(stations_root, 'VM0', 'output');
    makeBinDir(stations_root, 'VM2', 'output');
    makeBinDir(stations_root, 'VM4', 'output');
    const lines = load(stations_root);

    // Act
    const summary = summarizeLine(lines.VM);

    // Assert
    expect(summary.in_flight).toBe(0);
    expect(summary.stuck).toBe(7);
    expect(summary.finished).toBe(8);
    expect(summary.stuck_locations).toEqual(['7 at VM3/failed']);
  });

  it('should exclude done from all totals', () => {
    // Arrange — only done bin populated
    for (let i = 0; i < 15; i++) makeWorkpiece(stations_root, 'VM2', 'done', `archive${i}`);
    makeBinDir(stations_root, 'VM5', 'output');
    const lines = load(stations_root);

    // Act
    const summary = summarizeLine(lines.VM);

    // Assert
    expect(summary.in_flight).toBe(0);
    expect(summary.stuck).toBe(0);
    expect(summary.finished).toBe(0);
  });

  it('should identify the biggest in-flight pile-up location', () => {
    // Arrange
    for (let i = 0; i < 3; i++) makeWorkpiece(stations_root, 'VM2', 'input', `a${i}`);
    for (let i = 0; i < 10; i++) makeWorkpiece(stations_root, 'VM3', 'input', `b${i}`);
    makeBinDir(stations_root, 'VM5', 'output');
    const lines = load(stations_root);

    // Act
    const summary = summarizeLine(lines.VM);

    // Assert
    expect(summary.in_flight).toBe(13);
    expect(summary.biggest_flow).toEqual({ count: 10, at: 'VM3/input' });
  });
});

describe('workpieceDir()', () => {
  it('should join stations_root/station/bin/id when pos.subpath is missing', () => {
    // Arrange
    const pos = { line: 'VM', station: 'VM3', bin: 'failed', terminal: false };

    // Act
    const dir = workpieceDir(pos, 'wp1', '/tmp/stations');

    // Assert
    expect(dir).toBe('/tmp/stations/VM3/failed/wp1');
  });

  it('should use pos.subpath when set (sub-bin layout)', () => {
    // Arrange — workpiece at HI3/output/invoices/hi-1__NT-...
    const pos = {
      line: 'HI', station: 'HI3', bin: 'output', terminal: false,
      subpath: 'invoices/hi-1__NT-00001-2025-26',
    };

    // Act
    const dir = workpieceDir(pos, 'hi-1__NT-00001-2025-26', '/tmp/stations');

    // Assert — sub-bin segment preserved
    expect(dir).toBe('/tmp/stations/HI3/output/invoices/hi-1__NT-00001-2025-26');
  });
});

// ============================================================================
// scanBinWorkpieces — pointer.json marker scanner with sub-bin walk
// ============================================================================

describe('scanBinWorkpieces()', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fob-scan-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** Make a workpiece directory at `bin_dir/{subpath}/` with a pointer.json marker. */
  function makeWp(bin_dir, subpath) {
    const wp = path.join(bin_dir, subpath);
    fs.mkdirSync(wp, { recursive: true });
    fs.writeFileSync(path.join(wp, 'pointer.json'), '{}');
    return wp;
  }

  it('should return an empty map when the bin directory does not exist', () => {
    // Act
    const result = scanBinWorkpieces(path.join(tempDir, 'missing'));

    // Assert
    expect(result.size).toBe(0);
  });

  it('should find flat workpieces (depth 1)', () => {
    // Arrange — output/car-1/pointer.json, output/car-2/pointer.json
    const bin_dir = path.join(tempDir, 'output');
    makeWp(bin_dir, 'car-1');
    makeWp(bin_dir, 'car-2');

    // Act
    const result = scanBinWorkpieces(bin_dir);

    // Assert
    expect([...result.keys()].sort()).toEqual(['car-1', 'car-2']);
    expect(result.get('car-1')).toBe('car-1');
    expect(result.get('car-2')).toBe('car-2');
  });

  it('should walk past organisational sub-bins to find workpieces (depth 2)', () => {
    // Arrange — output/invoices/hi-1__NT-001/pointer.json (HI3 splitter pattern)
    const bin_dir = path.join(tempDir, 'output');
    makeWp(bin_dir, 'invoices/hi-1__NT-001');
    makeWp(bin_dir, 'invoices/hi-1__NT-002');

    // Act
    const result = scanBinWorkpieces(bin_dir);

    // Assert
    expect([...result.keys()].sort()).toEqual(['hi-1__NT-001', 'hi-1__NT-002']);
    expect(result.get('hi-1__NT-001')).toBe('invoices/hi-1__NT-001');
  });

  it('should mix flat and sub-bin workpieces in the same bin', () => {
    // Arrange — output/hi-1/ (bundle audit) AND output/invoices/hi-1__NT-001/
    const bin_dir = path.join(tempDir, 'output');
    makeWp(bin_dir, 'hi-1');
    makeWp(bin_dir, 'invoices/hi-1__NT-001');

    // Act
    const result = scanBinWorkpieces(bin_dir);

    // Assert — both surface; the sub-bin path is preserved for the child
    expect([...result.keys()].sort()).toEqual(['hi-1', 'hi-1__NT-001']);
    expect(result.get('hi-1')).toBe('hi-1');
    expect(result.get('hi-1__NT-001')).toBe('invoices/hi-1__NT-001');
  });

  it('should support CD2-style classification sub-bins (output/PO, output/MSA)', () => {
    // Arrange
    const bin_dir = path.join(tempDir, 'output');
    makeWp(bin_dir, 'PO/po-7');
    makeWp(bin_dir, 'MSA/msa-3');

    // Act
    const result = scanBinWorkpieces(bin_dir);

    // Assert
    expect([...result.keys()].sort()).toEqual(['msa-3', 'po-7']);
    expect(result.get('po-7')).toBe('PO/po-7');
    expect(result.get('msa-3')).toBe('MSA/msa-3');
  });

  it('should treat a directory containing pointer.json as a workpiece and not descend further', () => {
    // Arrange — workpiece at output/hi-1/ with a nested subfolder pages/
    // that should NOT be treated as a workpiece even if it has stuff in it
    const bin_dir = path.join(tempDir, 'output');
    makeWp(bin_dir, 'hi-1');
    fs.mkdirSync(path.join(bin_dir, 'hi-1', 'pages'), { recursive: true });
    fs.writeFileSync(path.join(bin_dir, 'hi-1', 'pages', 'page0001.pdf'), '');

    // Act
    const result = scanBinWorkpieces(bin_dir);

    // Assert — only hi-1, not pages/
    expect([...result.keys()]).toEqual(['hi-1']);
  });

  it('should ignore directories without pointer.json (organisational only)', () => {
    // Arrange — empty sub-bin
    const bin_dir = path.join(tempDir, 'output');
    fs.mkdirSync(path.join(bin_dir, 'invoices'), { recursive: true });

    // Act
    const result = scanBinWorkpieces(bin_dir);

    // Assert
    expect(result.size).toBe(0);
  });

  it('should ignore dot-prefixed directories at every depth', () => {
    // Arrange
    const bin_dir = path.join(tempDir, 'output');
    makeWp(bin_dir, 'hi-1');
    makeWp(bin_dir, '.hidden');
    makeWp(bin_dir, '.tmp/nested');

    // Act
    const result = scanBinWorkpieces(bin_dir);

    // Assert
    expect([...result.keys()]).toEqual(['hi-1']);
  });
});
