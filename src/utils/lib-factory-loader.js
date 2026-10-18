/**
 * lib-factory Loader
 *
 * Dynamically imports @assemblyline/lib-factory from the factory's node_modules
 * (not the CLI's own copy). This ensures a single module instance is
 * shared between CLI code and step handlers, avoiding dual-instance
 * state bugs (e.g. initTemplates setting state on one copy while
 * renderTemplate reads from another).
 *
 * Usage:
 *   // Async — first call loads and caches the module
 *   const libFactory = await loadLibFactory();
 *   const { initTemplates, resolveConfig } = libFactory;
 *
 *   // Sync — returns cached module (throws if not yet loaded)
 *   const { createHandler } = getLibFactory();
 */

import path from 'path';
import { pathToFileURL } from 'url';

let cached = null;

/**
 * Load @assemblyline/lib-factory from the factory's node_modules.
 * Caches the module — subsequent calls return the same instance.
 *
 * @returns {Promise<object>} The lib-factory module exports
 */
export async function loadLibFactory() {
  if (cached) return cached;

  const factoryRoot = process.cwd();
  const libFactoryEntry = path.join(factoryRoot, 'node_modules', '@assemblyline', 'lib-factory', 'src', 'index.js');
  const libFactoryUrl = pathToFileURL(libFactoryEntry).href;

  try {
    cached = await import(libFactoryUrl);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'ENOENT') {
      console.error('@assemblyline/lib-factory not found in this factory repo.');
      console.error(`Expected: ${libFactoryEntry}`);
      console.error('Run "npm install" in your factory repo first.');
      process.exit(1);
    }
    throw err;
  }

  return cached;
}

/**
 * Get the cached lib-factory module synchronously.
 * Must call loadLibFactory() first.
 *
 * @returns {object} The lib-factory module exports
 */
export function getLibFactory() {
  if (!cached) {
    throw new Error('lib-factory not loaded yet. Call loadLibFactory() first.');
  }
  return cached;
}
