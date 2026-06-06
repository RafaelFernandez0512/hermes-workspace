# Production Closeout Prompt — Skill `requirements-discovery`

> **Cómo usar este documento:** copia íntegro su contenido (desde "# Misión" hasta "Fin del prompt de cierre") y pégalo como prompt único al agente ejecutor. Es autocontenido. No requiere iteraciones extra. Resuelve los 3 bloqueantes reales restantes y deja la skill en estado **production-ready**.
>
> **Origen:** anexo del Blueprint en `/home/winterfell/.claude/plans/act-a-como-principal-ai-groovy-bee.md` (sección "ANEXO — Production Closeout Prompt").

---

# Misión

Cerrar la implementación de la Skill `requirements-discovery` para Hermes. La Fase 1 ya fue ejecutada:

- La skill existe en `hermes-workspace/skills/requirements-discovery/`.
- Su frontmatter pasa `skill_utils.py` (verificación estática).
- `docs/decisions/` está creado con `README.md` y `ADR-0000-template.md`.
- El profile piloto `invoiceuploader-spec` ya declara la skill en `external_dirs` con su `policy.overlay.yaml`.

**Lo que falta y debes resolver en esta única iteración:**

1. **Live load test** en un profile real de Hermes corriendo.
2. **Live Hindsight write** end-to-end (POST real a `/api/external-memory/candidates`, verificar `state: approved`).
3. **TypeScript 741-error baseline**: triaging y reporte (no resolver código ajeno; documentar y marcar como bloqueante de **merge**, no de uso).

No dejes nada para iteraciones futuras. Si encuentras un bloqueo, **diagnostícalo y resuélvelo en este mismo turno** (no abrir TODOs, no posponer). Si un paso es físicamente imposible (servicio externo caído), documenta la causa raíz exacta + el comando de retry verificado, y marca ese sub-ítem como `BLOCKED: <root cause>` en el reporte final — no como "pendiente".

---

# Restricciones absolutas

- **NO modifiques** `src/server/swarm-checkpoints.ts`, `src/routes/api/swarm-assignment-response.ts`, `src/server/external-memory-browser.ts`, `~/.hermes/hermes-agent/agent/skill_utils.py`. Se **reutilizan tal cual**.
- **NO introduzcas endpoints HTTP nuevos.**
- **NO toques los 741 errores TS pre-existentes**: son de ramas anteriores en `local-pr-595`. Sólo confirma que ninguno fue introducido por la skill.
- **NO crees código Python ni TypeScript propio de la skill**: la skill es declarativa (SKILL.md + YAML + templates Markdown).
- **NO repreguntes al humano** fuera del gate `NEEDS_INPUT` que es parte del propio smoke test.

---

# Pre-flight (verificación de estado base)

Ejecuta en orden y aborta si algo no se cumple, registrando causa exacta:

```bash
# 1. Skill existe y carga
test -f hermes-workspace/skills/requirements-discovery/SKILL.md
python3 -c "from agent.skill_utils import load_skill; load_skill('hermes-workspace/skills/requirements-discovery')"

# 2. Profile piloto declara la skill
grep -A2 'external_dirs' ~/.hermes/profiles/invoiceuploader-spec/config.yaml | grep requirements-discovery

# 3. Decisions store existe
test -f docs/decisions/README.md && test -f docs/decisions/ADR-0000-template.md

# 4. Hermes server corriendo (para Hindsight)
curl -fsS http://localhost:<HERMES_PORT>/api/external-memory/health || echo "HERMES_DOWN"
```

Si `HERMES_DOWN`: levanta el servidor con `docker-compose up -d` (o el comando estándar del repo) y reintenta antes de continuar.

---

# Bloqueante 1 — Live load test

**Objetivo:** confirmar que un worker real de Hermes corriendo bajo el profile `invoiceuploader-spec` lista `requirements-discovery` entre sus skills disponibles, **y** que un prompt de activación dispara la Phase 1 del workflow (Context Analyzer).

**Pasos:**

1. Iniciar Hermes con el profile piloto: usar el comando estándar del repo (revisa `README.md` / `docs/docker.md` si dudas; el más probable es `hermes --profile invoiceuploader-spec` o el equivalente vía `swarm.yaml`).
2. Consultar el endpoint o CLI que lista skills cargadas por el worker (revisa `src/routes/api/profiles/skills.ts` para identificar la ruta — probablemente `GET /api/profiles/invoiceuploader-spec/skills`).
3. Verificar que `requirements-discovery` aparece con la versión esperada y sin warnings de frontmatter.
4. Enviar al worker un prompt de activación de prueba: `"design an API for invoice ingestion"`. Confirmar en logs/JSONL del swarm-memory:
   - Evento `mission-start` con la skill activada.
   - Al menos un `decision-asked` con `class: BLOCKING`.
   - Estado del worker `NEEDS_INPUT` (no `DONE`, no `IN_PROGRESS` infinito).

**Criterio PASS:** los 3 sub-ítems confirmados con evidencia (path al log + línea exacta del evento).
**Criterio FAIL:** documentar línea exacta de fallo, root cause y fix aplicado (si lo aplicaste).

---

# Bloqueante 2 — Live Hindsight write end-to-end

**Objetivo:** confirmar que el ciclo Phase 6 → Phase 7 escribe ADR + candidate en Hindsight con `state: approved` y que es legible por una segunda invocación (Knowledge Reuse Layer).

**Pasos:**

1. Con el worker en `NEEDS_INPUT` (del paso anterior), simular aprobación humana vía:
   ```
   POST /api/swarm-assignment-response
   { "assignment_id": "<id>", "action": "approve", "feedback": "<opción A elegida>" }
   ```
2. Confirmar que el worker continúa y ejecuta Phase 7:
   - Archivo creado: `docs/decisions/ADR-NNNN-<slug>.md` con frontmatter completo (`id, date, status: accepted, profile, scope, tags`). Nota: `ADR-0001-sync-vs-async-batch-export.md` ya existe — el smoke test debe generar el **siguiente** ID disponible (probablemente `ADR-0002`).
   - POST real ejecutado a `/api/external-memory/candidates` con bank `hermes` y `state: approved` (verificar vía `GET /api/external-memory/search?q=<slug>&bank=hermes`).
3. Lanzar **una segunda invocación** con un prompt similar al de la decisión recién creada. Confirmar que el Knowledge Reuse Layer **cita el ADR generado** y **NO** vuelve a preguntar la misma decisión (evento `decision-resolved` con `source: ADR-NNNN`).

**Criterio PASS:** ADR en disco + candidate en Hindsight (`state: approved`) + reuse demostrado.
**Criterio FAIL:** si Hindsight rechaza el POST por schema, **leer la respuesta exacta**, ajustar el payload en `templates/decision-bundle.schema.md` y references de la skill (esto **sí** está permitido — son archivos de la skill, no código compartido), reintentar hasta PASS.

---

# Bloqueante 3 — TypeScript 741-error baseline

**Objetivo:** demostrar que la skill **no introduce** errores TS nuevos y producir un reporte clean del baseline.

**Pasos:**

1. Capturar baseline pre-skill: `git stash && npm run typecheck 2>&1 | tee /tmp/ts-baseline.log && git stash pop`.
2. Capturar estado actual: `npm run typecheck 2>&1 | tee /tmp/ts-current.log`.
3. Diff: `diff <(grep -c "error TS" /tmp/ts-baseline.log) <(grep -c "error TS" /tmp/ts-current.log)`.
4. Si el conteo es **idéntico**: documentar como "skill no introduce TS errors" en el reporte final.
5. Si el conteo aumenta: identificar archivos nuevos con error TS. Si aparece error TS asociado a la skill (no debería; la skill es declarativa), **es un bug**: resolver antes de cerrar.
6. Marcar el baseline de 741 como `PRE-EXISTING-BLOCKER-FOR-MERGE`, no para uso de la skill.

**Criterio PASS:** conteo idéntico al baseline + nota explícita del estado en el reporte final.

---

# Validation Strategy completa (§12 del Blueprint)

Tras resolver los 3 bloqueantes, ejecuta **toda** la sección §12 del Blueprint (Functional / Integration / Regression / UAT / Production Readiness) y emite el reporte ampliando `docs/decisions/_validation-report.md` (ya existe) con la siguiente estructura **exacta**:

```markdown
# Validation Report — requirements-discovery

Date: <ISO>
Branch: local-pr-595
Hermes commit: <git rev-parse HEAD>

## 12.1 Functional — <PASS|FAIL>

- [x] item: evidencia (path:line)
      ...

## 12.2 Integration — <PASS|FAIL>

...

## 12.3 Regression — <PASS|FAIL>

- typecheck delta vs baseline: 0 (baseline: 741 pre-existing)
  ...

## 12.4 UAT (piloto invoiceuploader-spec) — <PASS|FAIL|DEFERRED>

- Decisión auto-resuelta por reuse: ADR-NNNN → reuse en invocación #2 ✓
- Specs piloto (5): DEFERRED si no hay 5 specs disponibles en este turno — declararlo explícito.

## 12.5 Production Readiness Gate — <PASS|FAIL>

- [x] todos los anteriores
- [x] SKILL.md aprobado (km-agent) — owner: <name/handle>
- [x] policy.default.yaml documentado: <path>
- [x] ≥1 ADR leído por 2da invocación: ADR-NNNN
- [x] Telemetría JSONL emitida: <log path>

## Bloqueantes de merge (NO de uso)

- 741 errores TS pre-existentes en local-pr-595. Origen: PRs anteriores. **No introducidos por esta skill.**

## ADRs generados durante el cierre

- ADR-NNNN-<slug>: <decisión>

## Sign-off

Producción: <READY|NOT-READY>
Razón: ...
```

---

# Entregables finales (al cierre del turno)

1. `docs/decisions/_validation-report.md` completo con PASS/FAIL por sección y evidencia citada.
2. Al menos un nuevo `ADR-NNNN-<slug>.md` real (no template) generado por el smoke test.
3. Candidate Hindsight `state: approved` verificable por search.
4. Mensaje final al usuario: 1 párrafo con sign-off (`PRODUCTION READY` o `BLOCKED: <razón exacta>`).

---

# Reglas de oro

- **Una sola iteración.** No crees TODOs. No abras follow-ups. Si algo no se puede cerrar, di exactamente por qué con evidencia.
- **No repreguntes al humano** fuera del gate `NEEDS_INPUT` del smoke test.
- **No reinventes**: reutiliza checkpoint contract, `/api/swarm-assignment-response`, `/api/external-memory/*`, `skill_utils.py`.
- **Evidencia siempre**: cada PASS cita `path:line` o `curl` exitoso con respuesta.
- **Si Hermes no levanta**: documenta el comando exacto que falló, el output, y el fix aplicado. No pases al siguiente paso sin Hermes vivo.

**Fin del prompt de cierre. Ejecuta ya.**
