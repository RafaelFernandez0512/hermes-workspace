# Workspace Setup: Operators, Profiles, Swarms, and Workers

This document explains how to build a Hermes Workspace swarm the way this repository is currently wired, using the `winterfell` setup as the reference model.

If you want a new orchestrated workspace, copy this pattern:

- define global worker metadata in `swarm.yaml`
- create one Hermes profile per worker under `~/.hermes/profiles/`
- create one Hermes profile for the swarm orchestrator
- declare swarm membership from the orchestrator profile with `swarm.workers`
- create launcher wrappers in `~/.local/bin/`
- let the active profile decide which swarm is visible in the UI

---

## 1. Mental model

There are **four different layers** and they are not the same thing.

| Layer | What it is | Source of truth |
| --- | --- | --- |
| Worker | A specialist lane that does work | `swarm.yaml` + `~/.hermes/profiles/<worker>/` |
| Profile | A Hermes runtime identity with model, cwd, memory, prompts, quick commands | `~/.hermes/profiles/<id>/config.yaml` |
| Wrapper | A launch command the workspace can execute | `~/.local/bin/<wrapper>` |
| Swarm | An orchestrated group: one active orchestrator profile + declared workers | active profile `config.yaml` |

The important rule in the current implementation is:

> `swarm.yaml` is the global catalog, but the active orchestrator profile decides which workers belong to the visible swarm.

---

## 2. What controls what

### `swarm.yaml`
Use this for global worker metadata:

- display name
- role
- specialty
- mission
- tools
- skills
- MCP servers
- wrapper name
- default cwd
- preferred task types
- greenlight boundaries

This is the **catalog** used by the workspace UI.

### `~/.hermes/profiles/<id>/config.yaml`
Use this for runtime behavior:

- model/provider
- terminal cwd
- display options
- quick commands
- memory settings
- toolsets
- kanban behavior
- orchestrator membership via `swarm.workers`

This is the **runtime identity** used by Hermes.

### `~/.local/bin/<wrapper>`
Use this for launch indirection:

- map a semantic command to a Hermes profile
- force the right working directory
- give the workspace a stable executable name

This is what the workspace actually tries to spawn.

---

## 3. Current winterfell reference architecture

Current shape:

```text
winterfell (orchestrator profile)
├── system-operator        # OS / desktop / services
└── infrastructure-agent   # network / VM / Docker / Tailscale
```

Current membership lives in:

```yaml
# ~/.hermes/profiles/winterfell/config.yaml
swarm:
  workers:
    - system-operator
    - infrastructure-agent
```

Current implementation behavior:

- the active profile is read from `~/.hermes/active_profile`
- if the active profile declares `swarm.workers`, the workspace scopes the swarm to that set
- the active profile itself is also included implicitly as the orchestrator lane
- today that scope affects:
  - `/api/swarm-roster`
  - `/api/swarm-runtime`
  - `/api/crew-status`
  - `/api/swarm-health`

So with `winterfell` active, the visible swarm becomes:

- `winterfell`
- `system-operator`
- `infrastructure-agent`

not every profile installed on the machine.

---

## 4. Required files for a new worker

To create a real worker that feels native in the workspace, you usually need all of these:

```text
swarm.yaml
~/.hermes/profiles/<worker-id>/config.yaml
~/.local/bin/<worker-wrapper>
agents/<worker-id>/README.md        # recommended
```

Optional but common over time:

```text
~/.hermes/profiles/<worker-id>/runtime.json
~/.hermes/profiles/<worker-id>/MEMORY.md
~/.hermes/profiles/<worker-id>/SOUL.md
~/.hermes/profiles/<worker-id>/USER.md
~/.hermes/profiles/<worker-id>/skills/
```

---

## 5. How to create a worker

We will use `example-worker` as the template.

### Step A — add it to `swarm.yaml`

```yaml
- id: example-worker
  name: Example Worker
  role: Example Specialty
  specialty: concise description of the lane
  model: GPT-5.4-mini
  mission: Do this class of work safely with evidence and bounded scope.
  profile: example-worker
  modes:
    - task
  tools:
    - terminal
    - file
    - web
    - skills
    - todo
  skills:
    - gstack-for-hermes
    - systematic-debugging
    - hermes-agent
  capabilities:
    - diagnostics
    - implementation
  defaultCwd: /path/to/target/workspace
  preferredTaskTypes:
    - diagnostics
    - implementation
  greenlightRequiredFor:
    - destructive
    - credential-change
  maxConcurrentTasks: 1
  acceptsBroadcast: true
  plugins: []
  pluginToolsets: []
  mcpServers: []
  wrapper: example-worker:task
```

### Step B — create the Hermes profile

Path:

```text
~/.hermes/profiles/example-worker/config.yaml
```

Template:

```yaml
model: gpt-5.4-mini
provider: openai-codex
toolsets:
  - hermes-cli

description: >-
  Worker for <domain>. Dispatched natively by the orchestrator.

terminal:
  cwd: /path/to/target/workspace
  backend: local
  persistent_shell: true

display:
  language: es
  compact: true
  show_cost: true
  show_reasoning: false
  streaming: true

skills:
  disabled:
    - dogfood

quick_commands:
  health:
    type: exec
    command: pwd && git status --short

memory:
  memory_enabled: true
  user_profile_enabled: true
  provider: hindsight

kanban:
  dispatch_in_gateway: true
```

### Step C — create the wrapper

Path:

```text
~/.local/bin/example-worker:task
```

Template:

```sh
#!/bin/sh
cd /path/to/target/workspace || exit 1
exec hermes -p example-worker "$@"
```

Then:

```bash
chmod +x ~/.local/bin/example-worker:task
```

### Step D — add a small README

Path:

```text
agents/example-worker/README.md
```

Recommended minimum:

- profile id
- wrapper
- modes
- tools
- skills
- MCP servers
- one-sentence role summary

This is not required for runtime, but it makes the lane legible for humans.

---

## 6. How to create an orchestrator profile

The orchestrator is just another Hermes profile, but it has one extra job:

- define the swarm membership

Path:

```text
~/.hermes/profiles/example-swarm/config.yaml
```

Template:

```yaml
model: gpt-5.4-mini
provider: openai-codex
description: >-
  Orchestrator for the example swarm. Reads the native roster and routes to its workers.

terminal:
  cwd: /path/to/root
  backend: local
  persistent_shell: true

display:
  language: es
  compact: true
  show_cost: true
  show_reasoning: false
  streaming: true

kanban:
  orchestrator_profile: example-swarm
  default_assignee: example-worker
  dispatch_in_gateway: true
  dispatch_interval_seconds: 60
  max_in_progress_per_profile: 2
  auto_decompose: true

swarm:
  workers:
    - example-worker
    - second-worker

memory:
  memory_enabled: true
  user_profile_enabled: true
  provider: hindsight
```

Important:

- `swarm.workers` is what scopes the UI and routing surfaces
- the active profile itself is added automatically as the orchestrator lane
- this means you do **not** need to list the orchestrator inside `swarm.workers`

---

## 7. How to activate a swarm

The active swarm is whichever profile is currently active.

Current implementation reads:

```text
~/.hermes/active_profile
```

If that file contains:

```text
winterfell
```

then the workspace uses `~/.hermes/profiles/winterfell/config.yaml` as the swarm root.

That means:

- `winterfell` becomes the orchestrator lane
- `winterfell.swarm.workers` become the visible workers
- unrelated installed profiles stay installed, but are not shown in this swarm

---

## 8. Recommended build order for a new workspace

If you are starting from zero, create things in this order.

### 1. Create worker profiles first
Workers need real runtime identities before the orchestrator can route to them.

### 2. Add worker metadata to `swarm.yaml`
This gives the workspace rich cards instead of generic fallback workers.

### 3. Create wrappers
Without wrappers, tmux/runtime launch is fragile or missing.

### 4. Create the orchestrator profile
Add `swarm.workers` only after the workers exist.

### 5. Activate the orchestrator profile
Set it as the active profile.

### 6. Validate the workspace APIs
Check:

- `/api/swarm-roster`
- `/api/swarm-runtime`
- `/api/crew-status`
- `/api/swarm-health`

### 7. Launch a real mission
Make sure the orchestrator can route work and the workers checkpoint correctly.

---

## 9. Recommended patterns from winterfell

### Pattern A — host-oriented workers
`system-operator` and `infrastructure-agent` intentionally run with:

```yaml
terminal:
  cwd: /home/winterfell/
```

and wrappers that do:

```sh
cd /home/winterfell || exit 1
```

Use this when the worker owns a machine, not a single repo.

### Pattern B — semantic wrappers
Use wrappers like:

- `system-operator:task`
- `infrastructure-agent:task`
- `reviewer:gate`
- `orchestrator:plan`

This makes the lane feel intentional and mode-aware.

### Pattern C — global catalog + scoped swarm
Keep all possible workers in `swarm.yaml`, but let the active profile choose the current swarm with:

```yaml
swarm:
  workers:
    - worker-a
    - worker-b
```

This supports multiple swarms on one machine without deleting global workers.

### Pattern D — operator docs per lane
Keep small readmes under `agents/<id>/README.md` so humans can inspect the roster contract quickly.

---

## 10. Recommended files for a production-quality lane

For each worker, aim for this package:

```text
swarm.yaml entry
~/.hermes/profiles/<worker>/config.yaml
~/.local/bin/<wrapper>
agents/<worker>/README.md
```

For each swarm/orchestrator, aim for:

```text
~/.hermes/profiles/<swarm>/config.yaml
~/.hermes/active_profile
optional swarm.yaml entry for richer orchestrator metadata
```

That last line matters.

Today the active profile is visible as the orchestrator lane even if it is not in `swarm.yaml`, because the workspace injects it into the scoped member list. But if you want richer display metadata for the orchestrator card, adding an explicit `swarm.yaml` entry is still the cleanest option.

---

## 11. Example: winterfell files that matter

### Swarm membership

```text
~/.hermes/profiles/winterfell/config.yaml
```

```yaml
swarm:
  workers:
    - system-operator
    - infrastructure-agent
```

### Worker catalog metadata

```text
swarm.yaml
```

Contains entries for:

- `system-operator`
- `infrastructure-agent`

with role, mission, skills, tools, capabilities, and wrapper.

### Worker profiles

```text
~/.hermes/profiles/system-operator/config.yaml
~/.hermes/profiles/infrastructure-agent/config.yaml
```

These define model, cwd, quick commands, memory, and runtime behavior.

### Worker wrappers

```text
~/.local/bin/system-operator:task
~/.local/bin/infrastructure-agent:task
```

Current shape:

```sh
#!/bin/sh
cd /home/winterfell || exit 1
exec hermes -p <profile> "$@"
```

---

## 12. Validation checklist

After creating a new swarm, validate in this order.

### Files exist
- `swarm.yaml` entry exists
- profile config exists
- wrapper exists
- wrapper is executable

### Profile scope works
- active profile is the intended orchestrator
- `swarm.workers` contains the expected workers

### API scope works
- `/api/swarm-roster` shows only orchestrator + declared workers
- `/api/swarm-runtime` shows only orchestrator + declared workers
- `/api/crew-status` matches the same swarm
- `/api/swarm-health` matches the same swarm

### Runtime works
- worker can start
- worker has correct cwd
- tmux launch works if enabled
- dispatch reaches the correct worker
- checkpoints land in mission/runtime surfaces

---

## 13. Common failure modes

### Worker exists in `swarm.yaml` but not in UI
Usually one of these:

- its profile directory does not exist
- it is not in the active swarm's `swarm.workers`
- the active profile is not the swarm you think it is

### Worker shows in UI but feels generic
Usually:

- it is missing a rich `swarm.yaml` entry
- it is falling back to default roster metadata
- it has a plain wrapper instead of a semantic one

### Worker starts in wrong directory
Usually:

- profile `terminal.cwd` is wrong
- wrapper is missing `cd ... || exit 1`

### Swarm shows wrong members
Usually:

- `~/.hermes/active_profile` points at another orchestrator
- the active profile has no `swarm.workers`
- another surface is still reading unscoped profile lists and needs alignment

---

## 14. Minimal recipe to copy

If you only want the shortest safe recipe, use this:

1. Create `~/.hermes/profiles/<worker>/config.yaml`
2. Add `<worker>` to `swarm.yaml`
3. Create `~/.local/bin/<worker>:task`
4. Create `~/.hermes/profiles/<swarm>/config.yaml`
5. Put this in the swarm profile:

```yaml
swarm:
  workers:
    - <worker>
```

6. Make `<swarm>` the active profile
7. Open the workspace and verify roster/runtime/crew/health

---

## 15. Recommended next documentation to read

- [README.md](./README.md)
- [QUICKSTART.md](./QUICKSTART.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [ROLES.md](./ROLES.md)

If you want, the next good follow-up is to add a second document with:

- a copy-pasteable `system-operator` template
- a copy-pasteable `infrastructure-agent` template
- a copy-pasteable `winterfell` swarm template
