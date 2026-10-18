/**
 * Steps registry loader
 *
 * Discovers steps by scanning the factory's steps directory.
 * Uses lib-factory's discoverSteps() for filesystem-based discovery.
 */

import fs from 'fs';
import { loadLibFactory, getLibFactory } from './lib-factory-loader.js';
import { loadConfig } from './config.js';

/**
 * Load steps registry by discovering step files in the steps directory
 * @param {string} stepsDir - Absolute path to steps directory
 * @returns {Promise<object>} Steps registry object (slug → StepDefinition)
 */
export async function loadSteps(stepsDir) {
  if (!fs.existsSync(stepsDir)) {
    throw new Error(`Steps directory not found: ${stepsDir}`);
  }

  const libFactory = await loadLibFactory();
  return libFactory.discoverSteps(stepsDir);
}

/**
 * Load steps with file path mappings
 * @param {string} stepsDir - Absolute path to steps directory
 * @returns {Promise<{steps: object, files: object}>}
 */
export async function loadStepsWithFiles(stepsDir) {
  const steps = await loadSteps(stepsDir);
  return { steps, files: {} };
}

/**
 * Get handler for a step slug.
 * @param {object} steps - Steps registry
 * @param {string} slug - Step slug (e.g., 'acme/fetch_account_freshness')
 * @returns {Function|null} Step handler function
 */
export function getHandler(steps, slug) {
  const step = steps[slug];
  if (!step) return null;

  const { createHandler } = getLibFactory();
  return createHandler(step);
}

/**
 * Get step slugs for shell completion
 * @returns {Promise<string[]>} Array of step slugs
 */
export async function getStepSlugs() {
  // Step discovery logs "[Factory] Discovered N steps…" to stdout from inside
  // lib-factory. During completion, stdout *is* the candidate list — bash splits
  // it on whitespace, so that one line adds 6 bogus candidates ("[Factory]",
  // "Discovered", "44", …). Silence stdout for the duration of the load; stderr
  // is untouched, so real errors still surface.
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    const config = loadConfig();
    const steps = await loadSteps(config.stepsDir);
    return Object.keys(steps);
  } catch {
    return [];
  } finally {
    process.stdout.write = write;
  }
}

/**
 * Find previous step in registry (by discovery order)
 * @param {object} steps - Steps registry
 * @param {string} currentSlug - Current step slug
 * @returns {string|null} Previous step slug
 */
export function findPreviousStep(steps, currentSlug) {
  const slugs = Object.keys(steps);
  const currentIndex = slugs.indexOf(currentSlug);

  if (currentIndex <= 0) return null;
  return slugs[currentIndex - 1];
}
