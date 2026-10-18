import { jest, describe, it, expect } from '@jest/globals';

const mockCreateHandler = jest.fn();

jest.unstable_mockModule('../../src/utils/lib-factory-loader.js', () => ({
  loadLibFactory: jest.fn(),
  getLibFactory: () => ({ createHandler: mockCreateHandler }),
}));

const { findPreviousStep, getHandler } = await import('../../src/utils/steps-loader.js');

// ============================================================================
// findPreviousStep
// ============================================================================

describe('findPreviousStep()', () => {
  const steps = {
    'step_one': {},
    'step_two': {},
    'step_three': {},
    'other_step': {},
  };

  it('should return null when the slug is the first entry', () => {
    const result = findPreviousStep(steps, 'step_one');
    expect(result).toBeNull();
  });

  it('should return the immediately preceding step', () => {
    const result = findPreviousStep(steps, 'step_three');
    expect(result).toBe('step_two');
  });

  it('should return the previous step regardless of naming', () => {
    const result = findPreviousStep(steps, 'other_step');
    expect(result).toBe('step_three');
  });

  it('should return null when the slug is not in the registry', () => {
    const result = findPreviousStep(steps, 'unknown');
    expect(result).toBeNull();
  });
});

// ============================================================================
// getHandler
// ============================================================================

describe('getHandler()', () => {
  it('should return null when the slug is not in the registry', () => {
    const steps = {};
    const result = getHandler(steps, 'missing');
    expect(result).toBeNull();
  });

  it('should build the handler with lib-factory createHandler()', () => {
    const step = { slug: 'acme/fetch' };
    const handler = async () => ({});
    mockCreateHandler.mockReturnValue(handler);

    const result = getHandler({ 'acme/fetch': step }, 'acme/fetch');

    expect(mockCreateHandler).toHaveBeenCalledWith(step);
    expect(result).toBe(handler);
  });
});
