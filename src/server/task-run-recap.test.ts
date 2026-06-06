import { describe, expect, it } from 'vitest'
import {
  buildTaskRunRecapFromKanbanLog,
  buildTaskRunRecapFromLatestRun,
  buildTaskRunRecapFromMessages,
} from './task-run-recap'

describe('task-run-recap', () => {
  it('builds readable activities from latest run metadata', () => {
    const recap = buildTaskRunRecapFromLatestRun({
      summary: 'Implemented the fix and verified the happy path',
      outcome: 'completed',
      status: 'done',
      metadata: {
        changed_files: ['src/a.ts', 'src/b.ts'],
        commands_run: ['pnpm test', 'pnpm build'],
        decision: 'Keep the change server-side',
        worker_session_id: 'abc123',
      },
    })

    expect(recap).toMatchObject({
      summary: 'Implemented the fix and verified the happy path',
      outcome: 'completed',
      status: 'done',
      activities: [
        'Changed Files: src/a.ts, src/b.ts',
        'Commands Run: pnpm test, pnpm build',
        'Decision: Keep the change server-side',
        'Worker Session Id: abc123',
      ],
    })
  })

  it('builds a recap from session messages', () => {
    const recap = buildTaskRunRecapFromMessages(
      [
        { role: 'user', content: 'Please fix the task detail UI', timestamp: 10 },
        { role: 'assistant', content: 'Done — the panel now shows the run recap and activity list.', timestamp: 20 },
        { role: 'assistant', content: 'I also kept the comments timeline intact.', timestamp: 30 },
      ],
      { sessionStarted: 5, model: 'gpt-4.1' },
    )

    expect(recap).toMatchObject({
      summary: 'I also kept the comments timeline intact.',
      profile: 'gpt-4.1',
      startedAt: 5,
      endedAt: 30,
      activities: [
        'User: Please fix the task detail UI',
        'Assistant: Done — the panel now shows the run recap and activity list.',
        'Assistant: I also kept the comments timeline intact.',
      ],
    })
  })

  it('builds a recap from kanban task logs', () => {
    const recap = buildTaskRunRecapFromKanbanLog([
      '  ┊ 📚 skill     plan  0.0s',
      '  ┊ 📖 read      /home/winterfell/src/InvoiceUploader/AGENTS.md  0.0s',
      '  ┊ 🔎 grep      invitation|invitations|invite  0.0s',
      '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
      '    Listo. Dejé el análisis/especificación guardado en:',
      '    /home/winterfell/.hermes/kanban/workspaces/t_5e6153b3/.hermes/plans/2026-06-05_204514-invitaciones-usuarios.md',
      '    La recomendación principal quedó clara: no validar la invitación desde el frontend; hacerlo en backend con Supabase Auth como identidad y public.invitations como registro de negocio.',
      '╰──────────────────────────────────────────────────────────────────────────────╯',
    ].join('\n'))

    expect(recap).toMatchObject({
      summary: expect.stringContaining('La recomendación principal quedó clara'),
      activities: [
        '📚 skill plan 0.0s',
        '📖 read /home/winterfell/src/InvoiceUploader/AGENTS.md 0.0s',
        '🔎 grep invitation|invitations|invite 0.0s',
      ],
    })
  })
})
