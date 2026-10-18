# lib-factory Resolution

How the CLI accesses `@assemblyline/lib-factory` without declaring it as a dependency.

## Context

The CLI needs `initTemplates`, `resolveConfig`, `discoverSteps` and `createHandler` from `@assemblyline/lib-factory`. It previously declared `@assemblyline/lib-factory` as a bundled dependency in `package.json`.

This caused a **dual module instance bug**: Node.js loaded two separate copies of `@assemblyline/lib-factory` (one from the CLI's `node_modules/`, one from the factory's). Module-level state set by the CLI's copy (via `initTemplates`) was invisible to step handlers running from the factory's copy (via `renderTemplate`), causing "Templates not initialized" errors.

See `docs/wip/fix-dual-module-instance-bug.md` for the full history.

## Decision

The CLI dynamically imports `@assemblyline/lib-factory` from the **factory's** `node_modules/` at runtime. This guarantees a single module instance shared between CLI code and step handlers.

`@assemblyline/lib-factory` is **not** listed in the CLI's `package.json`.

## How It Works

`src/utils/lib-factory-loader.js` provides two functions:

```javascript
// Async — first call resolves and caches the module
const { initTemplates, resolveConfig } = await loadLibFactory();

// Sync — returns cached module (throws if not yet loaded)
const { createHandler } = getLibFactory();
```

Resolution path: `{process.cwd()}/node_modules/@assemblyline/lib-factory/src/index.js`

The module is cached after the first `loadLibFactory()` call. `getLibFactory()` returns the cache synchronously for use in sync functions like `getHandler()`.

## Why This Works

The CLI always runs from inside a factory repo directory. It cannot function without one — it requires `src/steps/`, `.orchestrator/`, `.env`, etc. Since a factory session always has `@assemblyline/lib-factory` installed, the module is guaranteed to be available.

## Trade-offs

| Aspect | Before (bundled) | After (runtime resolution) |
|--------|-------------------|---------------------------|
| Module instances | Two — CLI's copy + factory's copy | One — factory's copy only |
| Version alignment | CLI could lag behind factory | Always matches factory |
| Static analysis | Import errors caught at parse time | Import errors caught at runtime |
| Factory repo requirement | CLI could theoretically run standalone | CLI must run inside a factory repo |

The "factory requirement" trade-off is not a new limitation — the CLI already required a factory repo for all commands.

## Related Notes

- [Template Resolution](/docs/architecture/template-resolution.md)
- [Steps Loading](/docs/architecture/steps-loading.md)
- [Module Structure](/docs/architecture/module-structure.md)
