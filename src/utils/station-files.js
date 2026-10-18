/**
 * Local station and scenario file management
 *
 * Station files live in: .orchestrator/stations/<short_code>__<name>.json
 * Line files live in:    .orchestrator/lines/<CODE>.json  ({ id, code, name, description, location })
 *
 * Line membership is encoded by the `line` field (a line code) inside each
 * station JSON, not by folder hierarchy — this avoids the redundant-data drift
 * risk of nesting by line. The line file is where the location lives.
 *
 * Scenarios: .orchestrator/scenarios/<slug>/
 */

import fs from 'fs';
import path from 'path';

const STATIONS_DIR = '.orchestrator/stations';
const LINES_DIR = '.orchestrator/lines';
const SCENARIOS_DIR = '.orchestrator/scenarios';

/**
 * Get all station JSON file paths from `.orchestrator/stations/`.
 * @returns {string[]} Array of relative file paths
 */
function getAllStationFilePaths() {
  if (!fs.existsSync(STATIONS_DIR)) return [];
  const paths = [];
  for (const f of fs.readdirSync(STATIONS_DIR)) {
    if (f.endsWith('.json')) paths.push(path.join(STATIONS_DIR, f));
  }
  return paths;
}

/**
 * Convert a station name to snake_case for filenames
 * "Update Rules" -> "update_rules"
 * @param {string} name
 * @returns {string}
 */
function nameToSnakeCase(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Build a filename for a station.
 * Uses short_code as prefix when available, otherwise falls back to id.
 * @param {object} station - Station with id, name, and optionally short_code
 * @returns {string} Filename like "P1__discover_pending_msas.json" or "0flNNmVLV5Dg__update_rules.json"
 */
function buildFilename(station) {
  const snakeName = nameToSnakeCase(station.name || 'unnamed');
  const prefix = station.short_code || station.id;
  return `${prefix}__${snakeName}.json`;
}

/**
 * Find a station file by ID or short_code (handles name changes and prefix migration).
 * @param {string} identifier - Station ID or short_code
 * @returns {string|null} Full filepath or null if not found
 */
export function findStationFile(identifier) {
  const all = getAllStationFilePaths();

  // Try filename prefix match (works for both ID-prefixed and short_code-prefixed files)
  for (const p of all) {
    const filename = path.basename(p);
    if (filename.startsWith(`${identifier}__`)) return p;
  }

  // Fall back to JSON `id` field match (when file is short_code-prefixed and caller passed an id)
  for (const p of all) {
    try {
      const content = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (content.id === identifier) return p;
    } catch {
      // skip malformed files
    }
  }

  return null;
}

/**
 * Save a station to a local file under .orchestrator/stations/.
 * Removes any existing file for this station before writing.
 * @param {object} station - Station definition with id, name, and optionally short_code + line
 * @returns {string} Saved filepath
 */
export function saveStation(station) {
  // Remove any existing files for this station (handles id/short_code prefix forms)
  const toRemove = new Set();
  const existingById = findStationFile(station.id);
  if (existingById) toRemove.add(existingById);
  if (station.short_code) {
    const existingByCode = findStationFile(station.short_code);
    if (existingByCode) toRemove.add(existingByCode);
  }
  for (const f of toRemove) {
    fs.unlinkSync(f);
  }

  if (!fs.existsSync(STATIONS_DIR)) {
    fs.mkdirSync(STATIONS_DIR, { recursive: true });
  }

  const filename = buildFilename(station);
  const filepath = path.join(STATIONS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(station, null, 2));
  return filepath;
}

/**
 * Load a station from a local file by ID or short_code.
 * @param {string} identifier - Station ID or short_code
 * @returns {object|null} Station definition or null if not found
 */
export function loadStation(identifier) {
  const filepath = findStationFile(identifier);

  if (!filepath) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

/**
 * List all station JSON files in `.orchestrator/stations/`.
 * @returns {string[]} Array of relative paths
 */
export function listAllStationFiles() {
  return getAllStationFilePaths();
}

/**
 * List all locally saved station IDs (files whose JSON contains an `id` field).
 * @returns {string[]} Array of station IDs
 */
export function listLocalStationIds() {
  const ids = [];
  for (const p of getAllStationFilePaths()) {
    try {
      const content = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (content.id) ids.push(content.id);
    } catch {
      // skip malformed files
    }
  }
  return ids;
}

/**
 * Load every local station JSON, returning the parsed objects with their source paths.
 * Used by `al-factory stations` / `al-factory lines` to derive line topology from local files.
 * @returns {Array<{filepath: string, dir: string, line: string|null, data: object}>}
 */
export function listLocalStations() {
  const stations = [];
  for (const filepath of getAllStationFilePaths()) {
    try {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      stations.push({
        filepath,
        dir: path.dirname(filepath),
        line: data.line ?? null,
        data,
      });
    } catch {
      // skip malformed files
    }
  }
  return stations;
}

/**
 * Load every local line JSON (`.orchestrator/lines/*.json`), keyed by code.
 * A line owns the `location`; stations inherit it through their `line` code.
 * @returns {Object<string, {id?: string, code: string, name?: string, description?: string|null, location: string}>}
 */
export function listLocalLines() {
  const lines = {};
  if (!fs.existsSync(LINES_DIR)) return lines;
  for (const f of fs.readdirSync(LINES_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(LINES_DIR, f), 'utf8'));
      if (data.code) lines[data.code] = data;
    } catch {
      // skip malformed files
    }
  }
  return lines;
}

/**
 * Get the lines directory path.
 * @returns {string}
 */
export function getLinesDir() {
  return LINES_DIR;
}

/**
 * Load a station from a filename or relative path.
 * Accepts either a bare filename (resolved against `.orchestrator/stations/`)
 * or a relative path (treated as a direct path).
 * @param {string} arg - Bare filename (e.g. 'P1__foo.json') or path (e.g. '.orchestrator/stations/foo.json')
 * @returns {object|null} Station definition or null if not found
 */
export function loadStationByFilename(arg) {
  // Path form — use directly
  if (arg.includes(path.sep) || arg.includes('/')) {
    if (!fs.existsSync(arg)) return null;
    return JSON.parse(fs.readFileSync(arg, 'utf8'));
  }

  // Bare filename — resolve against the stations directory
  for (const filepath of getAllStationFilePaths()) {
    if (path.basename(filepath) === arg) {
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    }
  }
  return null;
}

/**
 * Write the server-assigned ID back into a new station file and rename it
 * to the standard naming format. New files always land in `.orchestrator/stations/`.
 * @param {string} originalArg - Original bare filename or relative path
 * @param {object} station - Station with id, name, and optionally short_code (as returned by server)
 * @returns {string} New filepath
 */
export function finalizeNewStationFile(originalArg, station) {
  // Locate the original file — accept either a path or a bare filename
  let originalPath;
  if (originalArg.includes(path.sep) || originalArg.includes('/')) {
    originalPath = originalArg;
  } else {
    originalPath = getAllStationFilePaths().find(p => path.basename(p) === originalArg)
      || path.join(STATIONS_DIR, originalArg);
  }

  // Remove the original file
  if (fs.existsSync(originalPath)) {
    fs.unlinkSync(originalPath);
  }

  if (!fs.existsSync(STATIONS_DIR)) {
    fs.mkdirSync(STATIONS_DIR, { recursive: true });
  }

  const newFilename = buildFilename(station);
  const newPath = path.join(STATIONS_DIR, newFilename);
  fs.writeFileSync(newPath, JSON.stringify(station, null, 2));
  return newPath;
}

/**
 * Get step config from a station definition.
 * @param {object} station - Station definition
 * @param {string} stepSlug - Step slug to find
 * @returns {object|null} Step config or null if step not found
 */
export function getStepConfigFromStation(station, stepSlug) {
  const step = station.steps?.find(s => s.slug === stepSlug);
  return step?.config || null;
}

/**
 * Get the stations directory path.
 * @returns {string}
 */
export function getStationsDir() {
  return STATIONS_DIR;
}

/**
 * Get the scenarios directory path.
 * @returns {string}
 */
export function getScenariosDir() {
  return SCENARIOS_DIR;
}

// ============================================================================
// Station Discovery
// ============================================================================

/**
 * Find all local stations that contain a specific step.
 * @param {string} stepSlug - Step slug to search for
 * @returns {Array<{id: string, short_code: string|undefined, name: string}>}
 *   Stations containing the step. `short_code` is undefined for stations that
 *   don't define one — callers displaying it should fall back to `id`.
 */
export function findStationsWithStep(stepSlug) {
  const stationIds = listLocalStationIds();
  const matches = [];

  for (const id of stationIds) {
    const station = loadStation(id);
    if (station?.steps?.some(s => s.slug === stepSlug)) {
      matches.push({ id: station.id, short_code: station.short_code, name: station.name });
    }
  }

  return matches;
}

// ============================================================================
// Scenario Management
// ============================================================================

/**
 * Convert step slug to scenario directory name.
 * acme/send_email -> acme__send_email
 * @param {string} slug
 * @returns {string}
 */
function slugToScenarioDir(slug) {
  return slug.replace(/\//g, '__');
}

/**
 * Get scenario directory path for a step.
 * @param {string} stepSlug
 * @returns {string}
 */
function getScenarioDirForStep(stepSlug) {
  return path.join(SCENARIOS_DIR, slugToScenarioDir(stepSlug));
}

/**
 * List all scenarios for a step.
 * @param {string} stepSlug - Step slug
 * @returns {string[]} Array of scenario names (without .json extension)
 */
export function listScenarios(stepSlug) {
  const scenarioDir = getScenarioDirForStep(stepSlug);

  if (!fs.existsSync(scenarioDir)) {
    return [];
  }

  return fs.readdirSync(scenarioDir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

/**
 * Load a scenario config.
 * @param {string} stepSlug - Step slug
 * @param {string} scenarioName - Scenario name (without .json)
 * @returns {object|null} Scenario config or null if not found
 */
export function loadScenario(stepSlug, scenarioName) {
  const filepath = path.join(getScenarioDirForStep(stepSlug), `${scenarioName}.json`);

  if (!fs.existsSync(filepath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

/**
 * Save a scenario config.
 * @param {string} stepSlug - Step slug
 * @param {string} scenarioName - Scenario name
 * @param {object} config - Config to save
 * @returns {string} Saved filepath
 */
export function saveScenario(stepSlug, scenarioName, config) {
  const scenarioDir = getScenarioDirForStep(stepSlug);

  if (!fs.existsSync(scenarioDir)) {
    fs.mkdirSync(scenarioDir, { recursive: true });
  }

  const filepath = path.join(scenarioDir, `${scenarioName}.json`);
  fs.writeFileSync(filepath, JSON.stringify(config, null, 2));
  return filepath;
}

// ============================================================================
// Station Scenarios
// ============================================================================
//
// Station scenarios are flat key→value JSONs of step-config overrides applied
// to a whole station run via `al-factory stations run <id> --scenario <name>`. They
// live under `.orchestrator/scenarios/stations/<short_code>/<name>.json`, keyed
// by short_code (stable + human-readable). The orchestrator shallow-merges
// every key into every step's config — zod in the factory strips keys a step
// does not declare.

function getScenarioDirForStation(stationShortCode) {
  return path.join(SCENARIOS_DIR, 'stations', stationShortCode);
}

/**
 * List all scenarios for a station.
 * @param {string} stationShortCode
 * @returns {string[]} Scenario names without .json extension
 */
export function listStationScenarios(stationShortCode) {
  const scenarioDir = getScenarioDirForStation(stationShortCode);
  if (!fs.existsSync(scenarioDir)) return [];
  return fs.readdirSync(scenarioDir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}

/**
 * Load a station scenario (flat key→value map).
 * @param {string} stationShortCode
 * @param {string} scenarioName - Without .json
 * @returns {object|null} Scenario object or null if not found
 */
export function loadStationScenario(stationShortCode, scenarioName) {
  const filepath = path.join(getScenarioDirForStation(stationShortCode), `${scenarioName}.json`);
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}
