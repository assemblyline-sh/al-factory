import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const mockExecSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockReadlinkSync = jest.fn();

jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync,
}));

jest.unstable_mockModule('fs', () => ({
  readFileSync: mockReadFileSync,
  readlinkSync: mockReadlinkSync,
}));

const { listRunningSessions, getFactoryPackageInfo, resolveRunningSession, isPm2Available } =
  await import('../../src/utils/factory-processes.js');

// Column padding here is deliberate and must be preserved: `ps` right-aligns
// the pid/ppid columns, and an earlier regex bug meant real (padded) output
// never matched while unpadded fixtures still passed.
const PS_SNAPSHOT = [
  '    100       1 Wed Jul 16 12:00:00 2026 01:00:00 node src/index.js',
  '    200       1 Wed Jul 16 12:00:00 2026 01:00:00 node node_modules/jest/bin/jest.js',
  '    300       1 Wed Jul 16 12:00:00 2026 01:00:00 node --watch src/index.js',
  '    400  917511 Wed Jul 16 12:00:00 2026    11:44 npm run start',
].join('\n');

const PM2_JLIST = JSON.stringify([
  { pid: 400, name: 'factory-c', pm2_env: { pm_cwd: '/factories/factory-c', status: 'online' } },
]);

const PACKAGE_JSON = {
  '/factories/factory-a/package.json': { main: 'src/index.js', dependencies: { '@assemblyline/lib-factory': '*' } },
  '/factories/factory-b/package.json': { main: 'src/index.js', dependencies: { '@assemblyline/lib-factory': '*' } },
  '/factories/factory-c/package.json': { main: 'src/index.js', dependencies: { '@assemblyline/lib-factory': '*' } },
};

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(value) {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

function setUpHappyPathMocks() {
  mockExecSync.mockImplementation((cmd) => {
    if (cmd.startsWith('ps -A -o')) return PS_SNAPSHOT;
    if (cmd === 'pm2 jlist') return PM2_JLIST;
    if (cmd.startsWith('lsof -p 100')) return 'p100\nfcwd\nn/factories/factory-a';
    if (cmd.startsWith('lsof -p 200')) return 'p200\nfcwd\nn/factories/factory-a';
    if (cmd.startsWith('lsof -p 300')) return 'p300\nfcwd\nn/factories/factory-b';
    return '';
  });

  mockReadFileSync.mockImplementation((filePath) => {
    const pkg = PACKAGE_JSON[filePath];
    if (!pkg) throw new Error('ENOENT');
    return JSON.stringify(pkg);
  });
}

describe('listRunningSessions()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPlatform('darwin');
  });

  afterEach(() => {
    setPlatform(ORIGINAL_PLATFORM);
  });

  it('should return an empty array on an unsupported platform', () => {
    // Arrange
    setPlatform('win32');

    // Act
    const rows = listRunningSessions();

    // Assert
    expect(rows).toEqual([]);
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('should detect a pm2-managed factory via pm2 jlist pm_cwd, not ps command text', () => {
    // Arrange
    setUpHappyPathMocks();

    // Act
    const rows = listRunningSessions();

    // Assert
    const pm2Row = rows.find((r) => r.factory === 'factory-c');
    expect(pm2Row).toEqual(expect.objectContaining({ pid: '400', mode: 'pm2', pm2: 'factory-c', cwd: '/factories/factory-c' }));
  });

  it('should detect a direct-mode factory via cwd + package.json main match', () => {
    // Arrange
    setUpHappyPathMocks();

    // Act
    const rows = listRunningSessions();

    // Assert
    const directRow = rows.find((r) => r.factory === 'factory-a');
    expect(directRow).toEqual(expect.objectContaining({ pid: '100', mode: 'direct', pm2: '-', cwd: '/factories/factory-a' }));
  });

  it('should exclude a non-factory node process sharing a factory session\'s cwd (e.g. jest)', () => {
    // Arrange
    setUpHappyPathMocks();

    // Act
    const rows = listRunningSessions();

    // Assert — pid 200 (jest) must not appear anywhere
    expect(rows.some((r) => r.pid === '200')).toBe(false);
  });

  it('should exclude a `node --watch <main>` supervisor process', () => {
    // Arrange
    setUpHappyPathMocks();

    // Act
    const rows = listRunningSessions();

    // Assert — factory-b only has the --watch supervisor (pid 300), no real child in this fixture
    expect(rows.some((r) => r.factory === 'factory-b')).toBe(false);
  });

  it('should not double-count an npm-wrapped pm2 factory\'s grandchild as a separate direct row', () => {
    // Arrange
    setUpHappyPathMocks();

    // Act
    const rows = listRunningSessions();

    // Assert — only one row for factory-c, not two
    expect(rows.filter((r) => r.factory === 'factory-c')).toHaveLength(1);
  });

  it('should parse space-padded ps columns into uptime/started', () => {
    // Arrange
    setUpHappyPathMocks();

    // Act
    const rows = listRunningSessions();

    // Assert — regression: padded pid columns once broke the ps regex,
    // silently blanking these fields for every row.
    expect(rows.find((r) => r.factory === 'factory-a')).toEqual(
      expect.objectContaining({ uptime: '01:00:00', started: 'Wed Jul 16 12:00:00 2026' })
    );
    expect(rows.find((r) => r.factory === 'factory-c')).toEqual(
      expect.objectContaining({ uptime: '11:44' })
    );
  });

  it('should sort rows by factory name then pid', () => {
    // Arrange
    setUpHappyPathMocks();

    // Act
    const rows = listRunningSessions();

    // Assert
    expect(rows.map((r) => r.factory)).toEqual(['factory-a', 'factory-c']);
  });
});

describe('listRunningSessions() on linux', () => {
  const CWD_BY_PID = {
    '/proc/100/cwd': '/factories/factory-a',
    '/proc/200/cwd': '/factories/factory-a',
    '/proc/300/cwd': '/factories/factory-b',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setPlatform('linux');
    setUpHappyPathMocks();
    mockReadlinkSync.mockImplementation((p) => {
      const cwd = CWD_BY_PID[p];
      if (!cwd) throw new Error('ENOENT');
      return cwd;
    });
  });

  afterEach(() => {
    setPlatform(ORIGINAL_PLATFORM);
  });

  it('should detect factory sessions instead of bailing out early', () => {
    // Act
    const rows = listRunningSessions();

    // Assert
    expect(rows.map((r) => r.factory)).toEqual(['factory-a', 'factory-c']);
  });

  it('should resolve cwd via /proc/<pid>/cwd rather than lsof', () => {
    // Act
    const rows = listRunningSessions();

    // Assert
    expect(rows.find((r) => r.factory === 'factory-a')?.cwd).toBe('/factories/factory-a');
    expect(mockReadlinkSync).toHaveBeenCalledWith('/proc/100/cwd');
    expect(mockExecSync).not.toHaveBeenCalledWith(
      expect.stringContaining('-d cwd'),
      expect.anything()
    );
  });

  it('should skip a pid whose /proc entry is unreadable (another user, or exited)', () => {
    // Arrange — pid 100's cwd link cannot be read
    mockReadlinkSync.mockImplementation((p) => {
      if (p === '/proc/100/cwd') throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      const cwd = CWD_BY_PID[p];
      if (!cwd) throw new Error('ENOENT');
      return cwd;
    });

    // Act
    const rows = listRunningSessions();

    // Assert — factory-a drops out, pm2-managed factory-c is unaffected
    expect(rows.map((r) => r.factory)).toEqual(['factory-c']);
  });

  it('should still use lsof for the listening-port lookup', () => {
    // Act
    listRunningSessions();

    // Assert
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('-sTCP:LISTEN'),
      expect.anything()
    );
  });
});

describe('getFactoryPackageInfo()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return null when @assemblyline/lib-factory is not a dependency', () => {
    // Arrange
    mockReadFileSync.mockReturnValue(JSON.stringify({ main: 'index.js', dependencies: {} }));

    // Act & Assert
    expect(getFactoryPackageInfo('/some/dir')).toBeNull();
  });

  it('should return null when package.json is missing a main field', () => {
    // Arrange
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: { '@assemblyline/lib-factory': '*' } }));

    // Act & Assert
    expect(getFactoryPackageInfo('/some/dir')).toBeNull();
  });

  it('should return { main } when both conditions are met', () => {
    // Arrange
    mockReadFileSync.mockReturnValue(JSON.stringify({ main: 'src/index.js', dependencies: { '@assemblyline/lib-factory': '*' } }));

    // Act & Assert
    expect(getFactoryPackageInfo('/some/dir')).toEqual({ main: 'src/index.js' });
  });
});

describe('resolveRunningSession()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPlatform('darwin');
    setUpHappyPathMocks();
  });

  afterEach(() => {
    setPlatform(ORIGINAL_PLATFORM);
  });

  it('should resolve by factory repo dirname', () => {
    expect(resolveRunningSession('factory-a')).toEqual(expect.objectContaining({ pid: '100' }));
  });

  it('should resolve by pm2 app name', () => {
    expect(resolveRunningSession('factory-c')).toEqual(expect.objectContaining({ pid: '400' }));
  });

  it('should return null when nothing matches', () => {
    expect(resolveRunningSession('does-not-exist')).toBeNull();
  });
});

describe('isPm2Available()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return true when the pm2 binary responds', () => {
    mockExecSync.mockReturnValue('5.3.0');
    expect(isPm2Available()).toBe(true);
  });

  it('should return false when pm2 is not on PATH', () => {
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
    expect(isPm2Available()).toBe(false);
  });
});
