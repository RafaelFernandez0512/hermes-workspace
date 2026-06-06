import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { ensureGatewayProbed, getResolvedUrls } from '../../server/gateway-capabilities'
import { getBearerToken } from '../../server/openai-compat-api'

type DecomposeRequest = {
  prompt?: unknown
  workers?: unknown
  model?: unknown
}

type WorkerHint = {
  id: string
  role?: string
  model?: string
  specialty?: string
  mission?: string
  skills?: Array<string>
  capabilities?: Array<string>
  notes?: string
}

type RouteAssignment = {
  workerId: string
  task: string
  rationale: string
  dependsOn?: Array<string>
  reviewRequired?: boolean
}

const SYSTEM = `You are an orchestrator that decomposes a single high-level user prompt into focused sub-tasks routed to the most appropriate worker agents in a Claude swarm.

Rules:
- Output ONLY valid minified JSON matching this shape: {"assignments":[{"workerId":"swarm1","task":"...","rationale":"...","dependsOn":["optional-prior-worker-id"],"reviewRequired":false}],"unassigned":["...optional reasons"]}
- Use only the worker IDs that exist in the provided roster.
- Each task must be a complete, self-contained instruction the worker can execute without additional context.
- Prefer workers whose role, specialty, mission, skills, and capabilities match the task.
- If a task has natural ordering (requirements → analysis → implementation → validation → docs), include dependsOn entries using prior worker IDs.
- Assign implementation tasks to builder/UI/backend lanes, research to research lanes, review/quality gates to reviewer lanes, PR/issue tasks to PR lanes, and ops/runtime tasks to ops/backend lanes.
- Skip workers that don't fit. Do not pad assignments.
- Never invent worker IDs.
- Keep rationale short (one sentence).
`

async function callOrchestrator(prompt: string, workers: WorkerHint[], model: string): Promise<{ assignments: RouteAssignment[]; unassigned: string[] }>{
  const rosterText = workers
    .map((worker) => {
      const parts = [
        worker.role ? `role=${worker.role}` : '',
        worker.model ? `model=${worker.model}` : '',
        worker.specialty ? `specialty=${worker.specialty}` : '',
        worker.mission ? `mission=${worker.mission}` : '',
        worker.skills?.length ? `skills=${worker.skills.join(',')}` : '',
        worker.capabilities?.length ? `capabilities=${worker.capabilities.join(',')}` : '',
        worker.notes ? `notes=${worker.notes}` : '',
      ].filter(Boolean).join('; ')
      return `- ${worker.id}${parts ? ` — ${parts}` : ''}`
    })
    .join('\n')

  const body = {
    model,
    stream: false,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Available swarm workers:\n${rosterText}\n\nUser prompt to decompose:\n${prompt}\n\nReturn the JSON now.`,
      },
    ],
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const bearer = getBearerToken()
  if (bearer) headers.Authorization = `Bearer ${bearer}`

  const { gateway } = getResolvedUrls()
  const res = await fetch(`${gateway}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Orchestrator HTTP ${res.status}: ${text.slice(0, 240)}`)
  }
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  const raw = data.choices?.[0]?.message?.content?.trim() ?? ''
  if (!raw) throw new Error('Orchestrator returned empty content')

  // Tolerant JSON extraction (in case the model wraps it).
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Orchestrator did not return JSON. Snippet: ${raw.slice(0, 240)}`)
  }
  const slice = raw.slice(start, end + 1)
  let parsed: unknown
  try {
    parsed = JSON.parse(slice)
  } catch (error) {
    throw new Error(`Orchestrator returned invalid JSON: ${(error as Error).message}`)
  }

  const obj = parsed as { assignments?: unknown; unassigned?: unknown }
  const assignmentsRaw = Array.isArray(obj.assignments) ? obj.assignments : []
  const validIds = new Set(workers.map((worker) => worker.id))
  const assignments: RouteAssignment[] = []
  for (const entry of assignmentsRaw) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const workerId = typeof item.workerId === 'string' ? item.workerId.trim() : ''
    const task = typeof item.task === 'string' ? item.task.trim() : ''
    const rationale = typeof item.rationale === 'string' ? item.rationale.trim() : ''
    const dependsOn = Array.isArray(item.dependsOn)
      ? item.dependsOn.filter((value): value is string => typeof value === 'string' && validIds.has(value.trim())).map((value) => value.trim())
      : undefined
    const reviewRequired = typeof item.reviewRequired === 'boolean' ? item.reviewRequired : undefined
    if (!workerId || !task) continue
    if (!validIds.has(workerId)) continue
    assignments.push({ workerId, task, rationale, dependsOn, reviewRequired })
  }
  const unassignedRaw = Array.isArray(obj.unassigned) ? obj.unassigned : []
  const unassigned: string[] = []
  for (const entry of unassignedRaw) {
    if (typeof entry === 'string' && entry.trim()) unassigned.push(entry.trim())
  }
  return { assignments, unassigned }
}


function scoreWorker(prompt: string, worker: WorkerHint): number {
  const text = [worker.id, worker.role, worker.model, worker.specialty, worker.mission, ...(worker.skills ?? []), ...(worker.capabilities ?? []), worker.notes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const lower = prompt.toLowerCase()
  let score = 0
  const pairs: Array<[RegExp, Array<string>]> = [
    [/research|investigate|options|tradeoff|source|synth/i, ['research', 'analysis']],
    [/build|implement|code|patch|ui|frontend|backend|api|fix/i, ['builder', 'implementation', 'ui', 'backend', 'runtime']],
    [/review|test|verify|quality|regression|gate/i, ['reviewer', 'review', 'pr', 'issues']],
    [/pr|issue|github|repro/i, ['pr', 'issues', 'github']],
    [/ops|health|runtime|tmux|gateway/i, ['ops', 'runtime', 'backend']],
    [/docs|handoff|spec|readme/i, ['docs', 'scribe']],
  ]
  for (const [pattern, terms] of pairs) {
    if (!pattern.test(lower)) continue
    for (const term of terms) if (text.includes(term)) score += 3
  }
  if (text.includes('swarm-worker-core')) score += 1
  return score
}

function invoiceUploaderAssignments(prompt: string, workers: WorkerHint[]): { assignments: RouteAssignment[]; unassigned: string[] } | null {
  const lower = prompt.toLowerCase()
  const looksLikeInvoiceUploader = /factura|invoice|orden(?:es)? de compra|purchase order|confirmar/i.test(lower)
  if (!looksLikeInvoiceUploader) return null

  const byId = new Map(workers.map((worker) => [worker.id, worker]))
  // The Route Mission UI itself is the orchestrator. Do not dispatch the
  // high-level InvoiceUploader profile as a worker assignment: it is prone to
  // doing work itself and timing out instead of simply sequencing the squad.
  // Route the ordered worker chain directly.
  const chain = [
    'invoiceuploader-spec',
    'invoiceuploader-tech',
    'invoiceuploader-coder',
    'invoiceuploader-validator',
    'invoiceuploader-writer',
  ].filter((id) => byId.has(id))
  if (chain.length < 3) return null

  const taskById: Record<string, string> = {
    InvoiceUploader: `Orquesta esta misión de InvoiceUploader y conserva el orden seguro de trabajo. Primero confirma alcance y dependencias; después espera/spec, análisis, implementación, validación y documentación. Prompt original: ${prompt}`,
    'invoiceuploader-spec': `Convierte el reporte en especificación y criterios de aceptación: impedir múltiples facturas activas por orden de compra; si ya existe una factura, mostrar modal de confirmación para reemplazarla; al aceptar borrar/desactivar la anterior y agregar la nueva; permitir editar/cambiar confirmación después de subir la factura. Prompt original: ${prompt}`,
    'invoiceuploader-tech': `Analiza causa raíz e impacto técnico en React, Supabase/PostgreSQL, .NET/jobs y permisos para los dos errores. No implementes; entrega componentes afectados, riesgos, contrato de datos y plan mínimo seguro. Prompt original: ${prompt}`,
    'invoiceuploader-coder': `Implementa el cambio mínimo y reversible según la especificación y análisis: modal de confirmación de reemplazo cuando la orden ya tiene factura; eliminación/desactivación segura de factura anterior antes de guardar la nueva; permitir editar el estado de confirmación después de subir. Añade/ajusta pruebas si existen. Prompt original: ${prompt}`,
    'invoiceuploader-validator': `Valida con evidencia concreta después de la implementación: build/smoke React + Vite, flujo de reemplazo con modal, cancelación sin cambios, aceptación reemplazando factura, y edición/cambio de confirmación después de subir. Si falla, reporta exactamente para que coder corrija. Prompt original: ${prompt}`,
    'invoiceuploader-writer': `Documenta decisiones, archivos cambiados, validación, riesgos y rollback del arreglo, sin secretos ni datos sensibles. Prompt original: ${prompt}`,
  }

  const assignments = chain.map((workerId, index) => ({
    workerId,
    task: taskById[workerId] ?? `Handle your InvoiceUploader lane for this mission. Prompt original: ${prompt}`,
    rationale: index === 0 ? 'Orquestador del workspace InvoiceUploader.' : `Paso ${index} del flujo secuencial InvoiceUploader.`,
    dependsOn: index === 0 ? [] : [chain[index - 1]],
    reviewRequired: workerId === 'invoiceuploader-coder',
  }))
  return { assignments, unassigned: [] }
}

function heuristicAssignments(prompt: string, workers: WorkerHint[]): { assignments: RouteAssignment[]; unassigned: string[] } {
  const invoicePlan = invoiceUploaderAssignments(prompt, workers)
  if (invoicePlan) return invoicePlan

  const ranked = [...workers]
    .map((worker) => ({ worker, score: scoreWorker(prompt, worker) }))
    .sort((a, b) => b.score - a.score || a.worker.id.localeCompare(b.worker.id))
  const selected = ranked.filter((row) => row.score > 0).slice(0, Math.min(3, workers.length))
  const fallback = selected.length ? selected : ranked.slice(0, Math.min(2, workers.length))
  const assignments = fallback.map(({ worker }) => ({
    workerId: worker.id,
    task: `Handle your lane for this Swarm2 mission and return only the required proof checkpoint. Mission: ${prompt}`,
    rationale: `Fallback roster match for ${worker.role || worker.id}.`,
  }))
  return {
    assignments,
    unassigned: selected.length ? [] : ['Model decomposition failed or produced no confident matches; used deterministic roster fallback.'],
  }
}

export const Route = createFileRoute('/api/swarm-decompose')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        await ensureGatewayProbed()
        let body: DecomposeRequest
        try { body = await request.json() as DecomposeRequest } catch { return json({ error: 'Invalid JSON body' }, { status: 400 }) }

        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
        if (!prompt) return json({ error: 'prompt required' }, { status: 400 })
        if (prompt.length > 16_000) return json({ error: 'prompt too long' }, { status: 400 })

        const workersRaw = Array.isArray(body.workers) ? body.workers : []
        const workers: WorkerHint[] = []
        for (const entry of workersRaw) {
          if (!entry || typeof entry !== 'object') continue
          const obj = entry as Record<string, unknown>
          const id = typeof obj.id === 'string' ? obj.id.trim() : ''
          if (!id || id === 'workspace') continue
          workers.push({
            id,
            role: typeof obj.role === 'string' ? obj.role : undefined,
            model: typeof obj.model === 'string' ? obj.model : undefined,
            specialty: typeof obj.specialty === 'string' ? obj.specialty : undefined,
            mission: typeof obj.mission === 'string' ? obj.mission : undefined,
            skills: Array.isArray(obj.skills) ? obj.skills.filter((value): value is string => typeof value === 'string') : undefined,
            capabilities: Array.isArray(obj.capabilities) ? obj.capabilities.filter((value): value is string => typeof value === 'string') : undefined,
            notes: typeof obj.notes === 'string' ? obj.notes : undefined,
          })
        }
        if (workers.length === 0) return json({ error: 'workers[] required' }, { status: 400 })

        const requestedModel = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : (process.env.CLAUDE_DEFAULT_MODEL ?? 'claude-opus-4-7')
        const deterministicInvoicePlan = invoiceUploaderAssignments(prompt, workers)
        if (deterministicInvoicePlan) {
          return json({
            ok: true,
            deterministic: true,
            decomposedAt: Date.now(),
            model: requestedModel,
            ...deterministicInvoicePlan,
          })
        }

        try {
          const result = await callOrchestrator(prompt, workers, requestedModel)
          return json({
            ok: true,
            decomposedAt: Date.now(),
            model: requestedModel,
            ...result,
          })
        } catch (error) {
          const fallback = heuristicAssignments(prompt, workers)
          return json({
            ok: true,
            fallback: true,
            warning: error instanceof Error ? error.message : 'decompose failed',
            decomposedAt: Date.now(),
            model: requestedModel,
            ...fallback,
          })
        }
      },
    },
  },
})
