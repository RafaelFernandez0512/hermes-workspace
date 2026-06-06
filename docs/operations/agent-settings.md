# Agent Settings — Provider+Model Atomic Updates, Validation, Migration

## Overview

Agent profiles store `provider` and `model` as a pair in `~/.hermes/profiles/<name>/config.yaml`.
These two fields must always be written together to prevent the config from landing in an invalid
state (e.g. `provider: openai-codex` with `model: claude-sonnet-4-6`).

---

## Provider+model catalog

The canonical catalog lives in `src/server/profiles-browser.ts` → `PROVIDER_MODEL_CATALOG`.

| Provider            | Accepted models                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anthropic`         | claude-opus-4-7, claude-opus-4-5, claude-sonnet-4-6, claude-sonnet-4-5, claude-haiku-4-5-20251001, claude-haiku-4-5, claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022, claude-3-opus-20240229 |
| `openai-codex`      | gpt-5.5, gpt-5.4-mini, gpt-5.4, gpt-5.3-codex, gpt-5.3-codex-spark, deepseek-v4-pro                                                                                                                |
| `deepseek`          | deepseek/deepseek-r1, deepseek/deepseek-v3, deepseek/deepseek-chat, deepseek-r1, deepseek-v3, deepseek-chat, deepseek-v4-pro                                                                       |
| `openai`            | any (open-ended)                                                                                                                                                                                   |
| `openai-compatible` | any                                                                                                                                                                                                |
| `google`            | any                                                                                                                                                                                                |
| `bedrock`           | any                                                                                                                                                                                                |
| `vertex`            | any                                                                                                                                                                                                |

Providers with `null` in the catalog accept any model string. `anthropic`, `openai-codex`,
and `deepseek` have explicit allowlists. To add a model, update the corresponding `Set` in
`PROVIDER_MODEL_CATALOG`.

---

## Validation

`validateProviderModelCoherence(provider, model)` returns `null` when valid, or:

```ts
{
  code: 'invalid_provider' | 'invalid_model'
  message: string   // human-readable, actionable
  provider?: string
  model?: string
}
```

This function is called:

- `POST /api/profiles/create` — before writing the new profile config
- `POST /api/profiles/update` — before applying the patch

Both endpoints return `400` with `{ error: string, code: string }` on validation failure.

---

## API reference

### Create profile

```
POST /api/profiles/create
{
  "name": "my-agent",
  "provider": "anthropic",
  "model": "claude-sonnet-4-6"
}
```

Returns `400` if provider+model combination is invalid.

### Update profile

```
POST /api/profiles/update
{
  "name": "my-agent",
  "patch": {
    "provider": "anthropic",
    "model": "claude-opus-4-7"
  }
}
```

Always send `provider` and `model` together. Sending only `model` leaves `provider` unchanged —
which may result in an inconsistent state if the new model doesn't belong to the existing provider.

---

## Migration

If existing profiles have a mismatched provider+model, run the lifecycle migration to add audit
fields (does not repair model/provider — those must be fixed manually via the Agent Settings UI):

```bash
pnpm tsx scripts/migrate-lifecycle.ts --dry-run
pnpm tsx scripts/migrate-lifecycle.ts
```

To fix a mismatched profile manually:

```bash
# Edit ~/.hermes/profiles/<name>/config.yaml directly:
provider: anthropic
model: claude-sonnet-4-6
```

Or via the API:

```bash
curl -X POST http://localhost:3002/api/profiles/update \
  -H 'Content-Type: application/json' \
  -d '{ "name": "my-agent", "patch": { "provider": "anthropic", "model": "claude-sonnet-4-6" } }'
```

---

## Troubleshooting

**400: Unknown provider**
The provider string is not in the catalog. Use one of: `anthropic`, `openai-codex`, `deepseek`, `openai`, `openai-compatible`, `google`, `bedrock`, `vertex`.

**400: Model "gpt-4o" is not valid for provider "anthropic"**
The model does not belong to the specified provider. Either change the provider to `openai` or pick an Anthropic model.

**400: Unknown provider "deepseek"**
Use one of the DeepSeek models: `deepseek/deepseek-r1`, `deepseek/deepseek-v3`, `deepseek/deepseek-chat`, or `deepseek-v4-pro`.

**Profile shows old model after update**
Check that your UI is sending both `provider` and `model` in the PATCH body. If only `model` is sent, `provider` stays at its previous value.

---

## Feature flag interaction

Provider+model validation is always active (not gated behind `HERMES_LIFECYCLE_V2`). The lifecycle
cascade operations (archive/delete) are gated — see `docs/swarm/lifecycle.md`.
