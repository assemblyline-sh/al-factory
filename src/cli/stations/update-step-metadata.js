import path from 'path';
import { loadConfig } from '../../utils/config.js';
import { loadSteps } from '../../utils/steps-loader.js';
import { listLocalStationIds, loadStation, saveStation, getStationsDir } from '../../utils/station-files.js';

export async function updateStepMetadataHandler() {
  const config = loadConfig();

  console.log(`Steps: ${path.relative(process.cwd(), config.stepsDir)}/`);
  console.log(`Stations: ${getStationsDir()}/`);
  console.log('');

  try {
    // Load step definitions
    const steps = await loadSteps(config.stepsDir);
    const stepMetadata = {};

    for (const [slug, step] of Object.entries(steps)) {
      if (step && step.name) {
        stepMetadata[slug] = {
          name: step.name,
          description: step.description || '',
        };
      }
    }

    console.log(`Loaded ${Object.keys(stepMetadata).length} step definitions`);
    console.log('');

    // Update each local station
    const localIds = listLocalStationIds();

    if (localIds.length === 0) {
      console.log('No local stations found');
      console.log('Run "al-orc stations pull" first');
      return;
    }

    let totalUpdated = 0;

    for (const stationId of localIds) {
      const station = loadStation(stationId);
      let updated = false;

      if (station.steps && Array.isArray(station.steps)) {
        for (const step of station.steps) {
          const meta = stepMetadata[step.slug];
          if (meta) {
            if (step.name !== meta.name || step.description !== meta.description) {
              step.name = meta.name;
              step.description = meta.description;
              updated = true;
            }
          }
        }
      }

      if (updated) {
        saveStation(station);
        console.log(`Updated: ${station.name} (${station.short_code || stationId})`);
        totalUpdated++;
      }
    }

    console.log('');
    console.log(`Updated ${totalUpdated} of ${localIds.length} stations`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
