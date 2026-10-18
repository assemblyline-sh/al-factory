# Task Construction

How the CLI builds a local Task object that matches the orchestrator's Task structure.

## Why It Matters

Step handlers receive a `task` argument from the orchestrator in production. To run locally without an orchestrator, the CLI must construct a compatible Task so the handler code runs unchanged.

## Task Structure

```javascript
{
  step_queue_id: `local-${Date.now()}`,   // synthetic
  step: {
    slug: slug,                            // from command arg
    config: stepConfig,                    // resolved from station/scenario/empty
  },
  work_record: {
    id: `local-wr-${Date.now()}`,          // synthetic
    step_outputs: step_outputs,            // loaded from temp/*.json
  },
  org_id: 'local',                         // no org locally
}
```

## step_outputs from temp/

All `*.json` files in `temp/` (excluding `*.config.json`) are loaded and keyed by slug:

```
temp/acme__fetch_data.json  →  step_outputs['acme/fetch_data']
temp/acme__check_balances.json  →  step_outputs['acme/check_balances']
```

Running steps in sequence chains their outputs naturally — each step's output is available to the next.

## stepConfig Sources

| Flag | Config Source |
|------|--------------|
| `--empty` | `{}` |
| `--station <id>` | Extracted from station definition, then template-resolved |
| `--scenario <name>` | Loaded from scenario file, then template-resolved |
| (none) | Interactive picker → then resolved like above |

## Related Notes

- [Steps Loading](/docs/architecture/steps-loading.md)
- [Template Resolution](/docs/architecture/template-resolution.md)
- [Station Files Layout](/docs/architecture/station-files-layout.md)
