import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const bin = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'al-factory.js');

/** Run `<command> --help` and return the heading lines in the order shown. */
function helpHeadings(args) {
  const out = execFileSync('node', [bin, ...args.split(' '), '--help'], {
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .filter((l) => /^(Positionals:|Options:|Global Options:)$/.test(l));
}

describe('help layout', () => {
  it("shows a command's own options above the inherited global ones", () => {
    // lines show <line>: Positionals (line) → Options (json) → Global Options (help/version)
    expect(helpHeadings('lines show')).toEqual([
      'Positionals:',
      'Options:',
      'Global Options:',
    ]);
  });

  it('keeps positionals first when options are bundled via a field helper', () => {
    // stations empty-bins registers the bin-selector flags after the positional.
    expect(helpHeadings('stations empty-bins')).toEqual([
      'Positionals:',
      'Options:',
      'Global Options:',
    ]);
  });

  it('omits an empty Options group for commands with a positional but no local options', () => {
    expect(helpHeadings('procs start')).toEqual([
      'Positionals:',
      'Global Options:',
    ]);
  });

  it('groups global options under their own heading even without positionals', () => {
    expect(helpHeadings('workpieces list')).toEqual([
      'Options:',
      'Global Options:',
    ]);
  });
});
