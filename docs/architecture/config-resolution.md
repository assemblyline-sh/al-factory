# Config Resolution

How the CLI resolves its runtime configuration.

## Convention-Based Paths

The CLI uses fixed conventions for the two paths it needs. No config file — all factory repos follow the same structure:

| Path | Convention |
|------|-----------|
| `stepsDir` | `./src/steps` (resolved to absolute path from cwd) |
| `tempDir` | `./temp` (resolved to absolute path from cwd) |

`loadConfig()` in `src/utils/config.js` is a one-liner — it just resolves these paths relative to `process.cwd()`.

## Orchestrator Settings

al-factory never calls the Orchestrator. It loads the factory's `.env` (via dotenv at startup) so steps run locally see the same variables as the factory session process, and `config show` reports which are set:

| Env Var | Purpose |
|---------|---------|
| `ORCHESTRATOR_URL` | API base URL |
| `ORCHESTRATOR_API_KEY` | Org API key |
| `ORCHESTRATOR_API_SECRET` | Org API secret |
| `FACTORY_LOCATION` | Where the factory session runs; shown by `config show` |

These are the same variables required by the production factory process. The `.env` in the factory repo is the single source for both.

## Inspecting Resolved Config

```bash
al-factory config show    # Displays resolved paths and which env vars are set (secrets as `*** (set)`)
```

## Related Notes

- [Module Structure](/docs/architecture/module-structure.md)
- [Configuration](https://assemblyline.sh/docs/configuration)
