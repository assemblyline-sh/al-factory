# CLI Design Style Guide

Design principles and conventions for `@fob/cli-fob`. Consult this when adding new commands.

> The orchestrator API and database still use the term "process". The CLI's user-facing vocabulary is "station". URL paths and JSON field names keep the old wording — everything the user types or reads says "station".

## Core Pattern

```
fob <resource> <action> [target] [options]
```

Every command follows this shape. No exceptions.

## Resources

Resources are top-level nouns representing the thing you're working with.

```bash
fob steps ...
fob stations ...
fob lines ...
fob workpieces ...
fob work-records ...
fob items ...
fob supporting-docs ...
fob tags ...
fob config ...
fob orchestrator ...
fob factory sessions ...
```

Typing `fob <resource>` shows all available actions for that resource.

## Actions

Actions are verbs that operate on a resource. Standard actions:

| Action | Purpose | Example |
|--------|---------|---------|
| `list` | List all instances | `al-orc stations list` |
| `show` | Show one instance in detail (definitional) | `al-orc stations show <id>` |
| `status` | Snapshot of live operational state | `al-factory lines status VM` |
| `watch` | Live tail; append-style streaming | `al-factory workpieces watch <id>` |
| `create` | Create a new instance | `fob tags create <name>` |
| `edit` | Modify an existing instance | `al-orc stations edit <id> --add-tag x` |
| `delete` | Remove an instance | `fob tags delete <id>` |
| `pull` | Download from orchestrator to local | `al-orc stations pull <id>` |
| `push` | Upload from local to orchestrator | `al-orc stations push <id>` |
| `run` | Execute (locally or remote) | `al-factory steps run <slug>`, `al-orc stations run <id>` |

Not every resource needs every action. Only add what's useful.

### Definitional vs operational verbs

For resources that have both a *configured shape* (JSON in `.orchestrator/`) and a *runtime state* (filesystem under `temp/stations/`), use separate verbs rather than flags:

- `show` answers "what is this configured to do?" — reads the config.
- `status` answers "what is it doing right now?" — reads live disk.
- `watch` answers "tell me as things change" — same data source as `status`, but streamed.

Precedent: `gh run watch`, `kubectl get --watch`, `systemctl status`, `git status`, `brew outdated`. Avoid bolting an operational view onto `show` with a flag — different question, different verb.

### Reserved verbs

- **`monit`** — reserved for an interactive TUI (pm2-style). Do not use for one-shot snapshots; that's what `status` is for. Implemented on `fob factory sessions monit` (execs `pm2 monit` directly).

## Explicit Actions — No Inference

Always require the action. Never infer it from arguments.

```bash
# Correct
fob steps list
al-factory steps run acme/fetch_data

# Wrong — no default action
fob steps                        # shows help, does NOT default to list
al-factory steps acme/fetch_data        # error, does NOT infer "run"
```

This eliminates ambiguity and makes scripts self-documenting.

## Relationships: Flags on `edit`, Not Nested Actions

When an entity has relationships to other entities (tags, assignments, etc.), manage them as **flags on `edit`** — not as standalone actions or sub-resources.

```bash
# Correct — follows gh CLI pattern
fob stations edit <id> --add-tag high-priority
fob stations edit <id> --remove-tag monthly
fob stations edit <id> --add-tag urgent --remove-tag low-priority

# Wrong — creates a new action just for the relationship
fob stations tag <id> high-priority
fob stations untag <id> monthly

# Wrong — puts target before action, breaks resource-action order
fob stations <id> tag high-priority

# Wrong — overloads unrelated resource with filtering
fob tags list --station <id>
```

**Why flags on `edit`?**

1. **Stays flat** — Keeps the `resource action target options` shape. No nested sub-commands.
2. **Scales** — Future editable fields (name, description, is_enabled) are more flags on the same command.
3. **Composable** — Can add a tag and remove another in a single call.
4. **Precedent** — GitHub CLI uses this exact pattern: `gh issue edit 23 --add-label bug --remove-label stale`.

Repeatable flags for multiple values:

```bash
fob stations edit <id> --add-tag a --add-tag b --remove-tag c
```

## Standalone Resource CRUD vs. Relationship Management

There are two separate concerns:

**1. CRUD on the resource itself** — standalone commands:
```bash
fob tags list                                    # List all tags
fob tags create high-priority --color '#ef4444'  # Create a tag
fob tags delete <id>                             # Delete a tag
```

**2. Linking a resource to an entity** — flags on the entity's `edit`:
```bash
fob stations edit <id> --add-tag high-priority   # Link tag to station
```

These are separate because they do different things. `fob tags create` creates the tag definition. `al-orc stations edit --add-tag` creates the association.

## Options

Options use double-dash convention with short aliases where useful:

```bash
--help, -h          # Show help
--all               # Apply to all (e.g., fob stations pull --all)
--color '#hex'      # Tag color
--description '...' # Description text
--add-tag <name>    # Add a tag (repeatable)
--remove-tag <name> # Remove a tag (repeatable)
--limit <n>         # Pagination limit
--status <s>        # Filter by status
--station <id>      # Filter by station
```

**Boolean flags** — no value needed: `--all`, `--empty`
**Value flags** — require a value: `--color '#ef4444'`, `--limit 10`
**Repeatable flags** — can appear multiple times: `--add-tag a --add-tag b`

## Help at Every Level

Every level of the command hierarchy shows contextual help:

```bash
fob                        # Shows all resources
fob stations               # Shows all actions for stations
fob stations edit          # Shows usage and flags for edit
```

## Naming Conventions

- **Resources**: plural nouns, kebab-case (`work-records`, not `workRecords`)
- **Actions**: singular verbs (`list`, `show`, `create`, `edit`, `delete`)
- **Targets**: the ID or slug of the entity being acted on
- **Options**: kebab-case with `--` prefix (`--add-tag`, not `--addTag`)

## Industry Precedent

| CLI | Pattern | Example |
|-----|---------|---------|
| gh (GitHub) | `<resource> <action>` | `gh issue edit 23 --add-label bug` |
| docker | `<resource> <action>` | `docker container ls` |
| gcloud | `<resource> <action>` | `gcloud compute instances list` |
| aws | `<service> <action>` | `aws s3 ls` |
| kubectl | `<action> <resource>` | `kubectl get pods` (opposite order) |

We follow the `<resource> <action>` order like `gh`, `docker`, and `gcloud`.

## Current Command Map

```
fob
├── steps
│   ├── list                              List available step handlers
│   └── run <slug>                        Run a step locally
│       ├── --station <id>                Use config from station
│       ├── --scenario <name>             Use config from scenario file
│       └── --empty                       Use empty config
├── stations
│   ├── list                              List stations from orchestrator
│   │   ├── --tag <name>                  Filter by tag
│   │   └── --json                        Output raw JSON
│   ├── show <id>                         Show formatted station details
│   │   ├── --work-records                Include recent work records
│   │   ├── --items                       Include linked items
│   │   ├── --all                         Include all linked entities
│   │   └── --json                        Output raw JSON
│   ├── status <short_code>               Snapshot: per-bin workpiece-id drilldown
│   ├── run <id>                          Trigger a remote station execution
│   │   └── --item <id>                   Item to run the station on
│   ├── edit <id>                         Modify a station
│   │   ├── --short-code <code>           Set short code
│   │   ├── --add-tag <name>              Add tag (repeatable)
│   │   └── --remove-tag <name>           Remove tag (repeatable)
│   ├── pull <id>                         Pull station to local file
│   │   └── --all                         Pull all stations
│   ├── push <id>                         Push local file to orchestrator
│   │   ├── --all                         Push all local stations
│   │   └── --force                       Create with the given id (cross-env promotion)
│   └── update-step-metadata              Sync step names from code
├── lines
│   ├── list                              Group local stations by line (definitional)
│   ├── show <line>                       Stations in dependency order + conveyor topology
│   └── status [line]                     Snapshot: bin counts (omit for cross-line summary)
├── workpieces
│   ├── list                              Snapshot of workpieces on disk
│   │   ├── --line <line>                 Scope to one line
│   │   ├── --bin <STATION/BIN>           Scope to one bin
│   │   ├── --match <substring>           Filter by id substring
│   │   └── --json                        Output raw JSON
│   ├── show <id-or-substring>            Deep view of one workpiece (auto-dashboard on >1 match)
│   └── watch [id]                        Live tail
│       ├── --line / --bin / --match      Scope (mutually exclusive)
│       └── --interval <s>                Poll interval (default 2)
├── work-records
│   ├── list                              List recent work records
│   │   ├── --limit <n>                   Max results
│   │   ├── --status <s>                  Filter by status
│   │   ├── --station <id>                Filter by station
│   │   ├── --tag <name>                  Filter by tag
│   │   └── --json                        Output raw JSON
│   ├── show <id>                         Show formatted work record details
│   │   ├── --report                      Include report
│   │   ├── --steps                       Include step outputs
│   │   ├── --supporting-docs             List supporting documents
│   │   ├── --activity                    Include activity log
│   │   ├── --all                         Include all sections
│   │   └── --json                        Output raw JSON
│   ├── edit <id>                         Modify a work record
│   │   ├── --add-tag <name>              Add tag (repeatable)
│   │   └── --remove-tag <name>           Remove tag (repeatable)
│   └── cancel <id>                       Cancel a running/pending work record
├── items
│   ├── list                              List items
│   │   ├── --type <type>                 Filter by item type
│   │   ├── --status <s>                  Filter by status
│   │   ├── --tag <name>                  Filter by tag
│   │   └── --json                        Output raw JSON
│   ├── show <id>                         Show formatted item details
│   │   ├── --stations                    Include configured stations
│   │   ├── --work-records                Include execution history
│   │   ├── --all                         Include all linked entities
│   │   └── --json                        Output raw JSON
│   └── edit <id>                         Modify an item
│       ├── --add-tag <name>              Add tag (repeatable)
│       └── --remove-tag <name>           Remove tag (repeatable)
├── supporting-docs
│   └── show <id>                         Show supporting document content
│       ├── --save <path>                 Download binary file to path
│       └── --json                        Output raw JSON
├── tags
│   ├── list                              List all tags in org
│   ├── create <name>                     Create a tag
│   │   ├── --color '#hex'                Tag color (default: #6b7280)
│   │   └── --description '...'           Tag description
│   ├── edit <id>                         Edit a tag
│   │   ├── --name '...'                  New tag name
│   │   ├── --color '#hex'                Tag color
│   │   └── --description '...'           Tag description
│   └── delete <id>                       Delete a tag
├── config
│   └── show                              Show current configuration
├── orchestrator
│   └── status                            Check orchestrator connection
├── factory sessions
│   ├── list                              List locally running fob factory sessions (this machine)
│   │   └── --json                        Output raw JSON
│   ├── start [target]                    Start a factory session under pm2 (target: path, default cwd)
│   ├── stop [target]                     Stop a pm2-managed factory (target: pm2 name or dirname, default cwd)
│   ├── restart [target]                  Restart a pm2-managed factory (same target resolution)
│   ├── logs [target]                     Tail logs for a pm2-managed factory (execs `pm2 logs`)
│   └── monit                             Interactive pm2 process monitor (execs `pm2 monit`)
└── completion                            Output shell completion script
```

## Related

- [Architecture](/docs/architecture/) — Internal design notes
- [Factory sessions docs](https://assemblyline.sh/docs) — user guides
