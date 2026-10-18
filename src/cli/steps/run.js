import path from 'path';
import { loadConfig, ensureTempDir } from '../../utils/config.js';
import { loadLibFactory } from '../../utils/lib-factory-loader.js';
import { loadSteps, getHandler } from '../../utils/steps-loader.js';
import { saveStepOutput, loadAllStepOutputs } from '../../utils/output.js';
import { loadStation, getStepConfigFromStation, findStationsWithStep, listScenarios, loadScenario } from '../../utils/station-files.js';
import { interactivePicker } from '../../utils/picker.js';

export async function runStepHandler(argv) {
  const { slug, station: stationId, scenario: scenarioName, empty: useEmpty } = argv;

  const config = loadConfig();
  ensureTempDir(config.tempDir);

  // Load lib-factory from the factory's node_modules (not the CLI's)
  const { initTemplates, resolveConfig } = await loadLibFactory();

  // Initialize templates relative to the factory's src directory
  const factorySrcDir = path.dirname(config.stepsDir);
  const factoryEntryUrl = 'file://' + path.resolve(factorySrcDir, 'index.js');
  initTemplates(factoryEntryUrl);

  const steps = await loadSteps(config.stepsDir);
  const handler = getHandler(steps, slug);

  if (!handler) {
    console.error(`Unknown step: ${slug}`);
    console.error('Run "al-factory steps list" to see available steps');
    process.exit(1);
  }

  // Load all step outputs from temp directory
  const step_outputs = loadAllStepOutputs(config.tempDir);

  // Determine config source
  let stepConfig = {};
  let configSource = null;

  if (useEmpty) {
    // Explicit empty config
    stepConfig = {};
    configSource = 'empty (--empty flag)';
  } else if (stationId) {
    // Explicit station
    const station = loadStation(stationId);
    if (!station) {
      console.error(`Station not found locally: ${stationId}`);
      console.error(`Run "al-orc stations pull ${stationId}" first`);
      process.exit(1);
    }

    const stationStepConfig = getStepConfigFromStation(station, slug);
    if (stationStepConfig === null) {
      console.error(`Step "${slug}" not found in station "${stationId}"`);
      console.error(`Available steps: ${station.steps?.map(s => s.slug).join(', ') || '(none)'}`);
      process.exit(1);
    }

    stepConfig = resolveConfig(stationStepConfig, step_outputs);
    configSource = `station: ${station.name} (${station.short_code || station.id})`;
  } else if (scenarioName) {
    // Explicit scenario
    const scenarioConfig = loadScenario(slug, scenarioName);
    if (!scenarioConfig) {
      console.error(`Scenario not found: ${scenarioName}`);
      console.error(`Available scenarios: ${listScenarios(slug).join(', ') || '(none)'}`);
      process.exit(1);
    }

    stepConfig = resolveConfig(scenarioConfig, step_outputs);
    configSource = `scenario: ${scenarioName}`;
  } else {
    // Interactive: build options and let user pick
    const pickerOptions = [];

    // Add stations that contain this step
    const stationsWithStep = findStationsWithStep(slug);
    for (const station of stationsWithStep) {
      pickerOptions.push({
        label: `Station: ${station.name} (${station.short_code || station.id})`,
        value: station.id,
        type: 'station',
      });
    }

    // Add scenarios for this step
    const scenarios = listScenarios(slug);
    for (const scenario of scenarios) {
      pickerOptions.push({
        label: `Scenario: ${scenario}`,
        value: scenario,
        type: 'scenario',
      });
    }

    // Always add empty config option
    pickerOptions.push({
      label: 'No config (empty)',
      value: 'empty',
      type: 'empty',
    });

    // Show picker if multiple options, otherwise use the only one
    const selected = await interactivePicker(`Select config for ${slug}:`, pickerOptions);

    if (!selected) {
      console.log('Cancelled');
      process.exit(0);
    }

    // Load the selected config
    if (selected.type === 'station') {
      const station = loadStation(selected.value);
      const stationStepConfig = getStepConfigFromStation(station, slug);
      stepConfig = resolveConfig(stationStepConfig || {}, step_outputs);
      configSource = `station: ${station.name} (${station.short_code || station.id})`;
    } else if (selected.type === 'scenario') {
      const scenarioConfig = loadScenario(slug, selected.value);
      stepConfig = resolveConfig(scenarioConfig, step_outputs);
      configSource = `scenario: ${selected.value}`;
    } else {
      stepConfig = {};
      configSource = 'empty';
    }
  }

  // Display run info
  console.log(`Step: ${slug}`);
  console.log(`Config: ${configSource}`);
  console.log(`Steps: ${path.relative(process.cwd(), config.stepsDir)}/`);
  console.log(`Temp: ${path.relative(process.cwd(), config.tempDir)}`);

  const step_output_slugs = Object.keys(step_outputs);
  if (step_output_slugs.length > 0) {
    console.log(`\n   Loaded step_outputs: ${step_output_slugs.join(', ')}`);
  } else {
    console.log(`\n   No previous step outputs found in temp/`);
  }

  // Construct task matching orchestrator structure
  const task = {
    step_queue_id: `local-${Date.now()}`,
    step: {
      slug: slug,
      config: stepConfig,
    },
    work_record: {
      id: `local-wr-${Date.now()}`,
      step_outputs: step_outputs,
    },
    org_id: 'local',
  };

  console.log('\n' + '-'.repeat(60));
  console.log('Running step...');
  console.log('-'.repeat(60));

  const output = await handler(task);

  console.log('\n' + '-'.repeat(60));
  console.log('Output:');
  console.log('-'.repeat(60));
  console.log(JSON.stringify(output, null, 2));

  const savedPath = saveStepOutput(config.tempDir, slug, output);
  console.log(`\n   Output saved: ${path.relative(process.cwd(), savedPath)}`);

  console.log('Step completed successfully');
}
