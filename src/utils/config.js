/**
 * Configuration
 *
 * Convention-based paths resolved relative to cwd.
 * No config file — all factory repos follow the same structure.
 */

import fs from 'fs';
import path from 'path';

/**
 * Resolve convention-based paths for the current factory repo
 * @returns {{ stepsDir: string, tempDir: string }}
 */
export function loadConfig() {
  const cwd = process.cwd();
  return {
    stepsDir: path.resolve(cwd, './src/steps'),
    tempDir: path.resolve(cwd, './temp'),
  };
}

/**
 * Ensure temp directory exists
 * @param {string} tempDir
 */
export function ensureTempDir(tempDir) {
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
}

/** Never show any part of a credential: only whether it is set. */
function maskSecret(value) {
  if (!value) return undefined;
  return '*** (set)';
}

/**
 * Get relevant environment variables for display
 */
export function getRelevantEnvVars() {
  return {
    ORCHESTRATOR_URL: process.env.ORCHESTRATOR_URL,
    FACTORY_LOCATION: process.env.FACTORY_LOCATION,
    ORCHESTRATOR_API_KEY: maskSecret(process.env.ORCHESTRATOR_API_KEY),
    ORCHESTRATOR_API_SECRET: maskSecret(process.env.ORCHESTRATOR_API_SECRET),
  };
}
