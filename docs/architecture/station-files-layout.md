# Station Files Layout

How station definitions and test scenarios are stored in the factory session directory.

> The orchestrator API and database still use the term "process". URL paths and JSON field names keep that wording — only the local directory and file naming use "station".

## Directory Structure

```
.orchestrator/
├── lines/
│   ├── VM.json            { id, code, name, description, location }
│   └── P8.json
├── stations/
│   ├── VM3__transcribe_whisper.json   "line": "VM"
│   ├── P8__verify_statement.json      "line": "P8"
│   └── 0flNNmVLV5Dg__update_rules.json
└── scenarios/
    └── acme__send_email/
        ├── happy-path.json
        └── missing-recipient.json
```

## .gitignore

`.orchestrator/` contains factory-specific local state (pulled from the orchestrator for a specific org). It should be in `.gitignore` and is not committed to the factory repo.

## Line Files

One file per line, named by its code: `.orchestrator/lines/<CODE>.json`. A line owns the `location`; every station names its line by `code` and inherits the location from it. `@assemblyline/lib-factory` refuses to boot without this directory. Pull with `al-orc lines pull --all` (also done by `al-orc stations pull --all`).

## Station File Naming

```
<id>__<name_in_snake_case>.json
```

The double underscore separates the opaque station ID from the human-readable name. `findStationFile()` extracts the ID from the filename prefix to locate files when only an ID is known.

## Scenario Directory Naming

```
.orchestrator/scenarios/<org>__<step_name>/
```

The step slug's `/` separator is replaced with `__` — matching the same convention used for step output files in `temp/`. A scenario directory contains one JSON file per scenario name.

## Station File Content

Full station definition JSON as returned by the orchestrator API, including `id`, `name`, `steps[]`, `created_at`, and `org`. (Wire-format field names use the API contract — e.g. `dependencies` references and IDs are unchanged.) When pushing, `id`, `created_at`, and `org` are stripped from the payload.

## Related Notes

- [Module Structure](/docs/architecture/module-structure.md)
- [Task Construction](/docs/architecture/task-construction.md)
- [Template Resolution](/docs/architecture/template-resolution.md)
- [Scenarios](https://assemblyline.sh/docs/run-steps#scenarios)
