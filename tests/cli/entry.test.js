import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bin = path.join(root, 'bin', 'al-factory.js');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

describe('al-factory entry point', () => {
  let cwd;

  /** Run the CLI from a host project whose own package.json has another version. */
  function run(...args) {
    return spawnSync('node', [bin, ...args], { cwd, encoding: 'utf8' });
  }

  beforeAll(() => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'al-factory-entry-'));
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'host', version: '9.9.9' }));
  });

  afterAll(() => {
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it("should print al-factory's own version, not the host project's", () => {
    const res = run('--version');

    expect(res.stdout.trim()).toBe(pkg.version);
  });

  it('should exit 1 on an unknown command', () => {
    const res = run('bogus');

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Unknown command: bogus');
  });

  it('should exit 1 on an unknown action', () => {
    const res = run('lines', 'bogus');

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Unknown command: bogus');
  });

  it('should link the docs and landing page in --help', () => {
    const res = run('--help');

    expect(res.stdout).toContain('https://assemblyline.sh/docs');
    expect(res.stdout).toContain('https://assemblyline.sh');
  });

  it.each([
    ['lines', 'list'],
    ['lines', 'status'],
    ['workpieces', 'list'],
  ])('should print parseable JSON for %s %s --json with nothing on disk', (resource, action) => {
    const res = run(resource, action, '--json');

    expect(res.status).toBe(0);
    expect(() => JSON.parse(res.stdout)).not.toThrow();
  });

  it('should print parseable JSON for lines list --json with station files', () => {
    const dir = path.join(cwd, '.orchestrator', 'stations');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'VM0__fetch.json'), JSON.stringify({ id: 'a1', short_code: 'VM0', name: 'Fetch', line: 'VM' }));

    const res = run('lines', 'list', '--json');

    fs.rmSync(path.join(cwd, '.orchestrator'), { recursive: true, force: true });
    expect(res.status).toBe(0);
    expect(JSON.parse(res.stdout).VM.stations[0].short_code).toBe('VM0');
  });
});

describe('library entry point', () => {
  it('should import without throwing and expose run()', async () => {
    const lib = await import('../../src/index.js');

    expect(typeof lib.run).toBe('function');
    expect(typeof lib.loadSteps).toBe('function');
  });
});
