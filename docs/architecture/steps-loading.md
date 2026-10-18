# Steps Loading

How the CLI discovers and runs step handlers from a factory repo.

## Loading Procedure

`loadSteps(stepsDir)` in `src/utils/steps-loader.js`:

1. Checks that `src/steps/` exists in the current directory
2. Loads `@assemblyline/lib-factory` from the factory's own `node_modules/` (see [lib-factory Resolution](/docs/architecture/lib-factory-resolution.md))
3. Calls lib-factory's `discoverSteps(stepsDir)`, which imports every step file under `src/steps/` and returns a registry of slug → step definition. Each definition carries `_file`, its path relative to `src/steps/`, which `al-factory steps list` shows as FOLDER and FILE

There is no index file: adding a file that default-exports a `defineStep()` is enough.

## StepDefinition Requirement

Steps must be created with `defineStep()` from `@assemblyline/lib-factory`:

```javascript
export default defineStep({
  slug: 'IN1_01_count',
  execute: async (config, context) => { ... },
});
```

`getHandler()` passes the definition to lib-factory's `createHandler()`, which validates it and wraps `execute` with config resolution and the step's schemas.

## Related Notes

- [Module Structure](/docs/architecture/module-structure.md)
- [Task Construction](/docs/architecture/task-construction.md)
- [Run steps locally](https://assemblyline.sh/docs/run-steps)
