# Template Resolution

How `{{env.VAR}}` and `{{org/step.field}}` placeholders in step configs are resolved.

## Delegation to lib-factory

The CLI does not implement template resolution itself. It delegates to `resolveConfig()` and `initTemplates()` from `@assemblyline/lib-factory`, ensuring the same resolution logic used in production factory sessions applies locally.

Both functions are loaded at runtime from the factory's `node_modules/@assemblyline/lib-factory` via `loadLibFactory()` — see [lib-factory Resolution](/docs/architecture/lib-factory-resolution.md) for why.

```javascript
import { loadLibFactory } from '../../utils/lib-factory-loader.js';

const { initTemplates, resolveConfig } = await loadLibFactory();

// Call once before running any steps — sets the base URL for template discovery
initTemplates('file:///path/to/factory/src/index.js');

// Resolve templates in a config object
const resolved = resolveConfig(rawConfig, step_outputs);
```

## Template Syntax

| Pattern | Resolves To |
|---------|------------|
| `{{env.VAR_NAME}}` | `process.env.VAR_NAME` |
| `{{org/step_name.field}}` | `step_outputs['org/step_name'].field` |

## initTemplates

`initTemplates` receives the factory's entry file URL. The base URL is used internally by lib-factory for any path-relative template lookups. In the CLI, it's set to `file://` + the resolved path of the factory's `src/index.js`.

Because the CLI loads `initTemplates` from the same `@assemblyline/lib-factory` module instance that step handlers use for `renderTemplate`, the template directory state is correctly shared.

## Where Templates Appear

Templates appear in step configs inside station definitions:

```json
{
  "to": "{{env.EMAIL_RECIPIENTS}}",
  "subject": "{{acme/generate_email.subject}}",
  "html": "{{acme/generate_email.html}}"
}
```

They are resolved before the step handler receives the config.

## Related Notes

- [Task Construction](/docs/architecture/task-construction.md)
- [Config Resolution](/docs/architecture/config-resolution.md)
- [Station Files Layout](/docs/architecture/station-files-layout.md)
- [Run steps locally](https://assemblyline.sh/docs/run-steps)
