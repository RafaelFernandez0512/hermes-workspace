import { describe, expect, it } from 'vitest'
import { buildSwarm2CurrentReportRows, buildSwarm2InboxLanes, buildSwarm2ReportRows } from './swarm2-reports-view'

describe('Swarm2 reports view model', () => {
  it('turns review-required checkpoints into needs-review report rows', () => {
    const rows = buildSwarm2ReportRows({
      missions: [
        {
          id: 'mission-1',
          title: 'Ship reports',
          state: 'reviewing',
          updatedAt: 200,
          assignments: [
            {
              id: 'assign-1',
              workerId: 'swarm5',
              task: 'Build outputs page',
              state: 'checkpointed',
              reviewRequired: true,
              completedAt: 300,
              checkpoint: {
                stateLabel: 'DONE',
                checkpointStatus: 'handoff',
                result: 'Page is implemented.',
                filesChanged: 'src/screens/swarm2/swarm2-reports-view.tsx',
                commandsRun: 'pnpm vitest run',
                blocker: null,
                nextAction: 'Review UX',
              },
            },
          ],
        },
      ],
      runtimes: [{ workerId: 'swarm5', displayName: 'Swarm5', artifacts: [], previews: [] }],
    })

    expect(rows[0]).toMatchObject({
      kind: 'checkpoint',
      workerId: 'swarm5',
      state: 'needs_review',
      stateLabel: 'Needs review',
      summary: 'Page is implemented.',
    })
    expect(rows[0].artifacts[0].path).toBe('src/screens/swarm2/swarm2-reports-view.tsx')
  })

  it('surfaces runtime artifacts when no mission checkpoint exists', () => {
    const rows = buildSwarm2ReportRows({
      missions: [],
      runtimes: [
        {
          workerId: 'swarm6',
          displayName: 'Swarm6',
          currentTask: 'Inspect Outputs page',
          lastSummary: 'Ready for review',
          lastOutputAt: 500,
          artifacts: [{ id: 'artifact-1', kind: 'report', label: 'UX report' }],
          previews: [],
        },
      ],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'artifact',
      workerId: 'swarm6',
      state: 'artifact',
      title: 'Inspect Outputs page',
    })
  })

  it('prefers concrete runtime results over boilerplate summaries after control prompts', () => {
    const rows = buildSwarm2ReportRows({
      missions: [],
      runtimes: [
        {
          workerId: 'swarm4',
          displayName: 'Swarm4',
          currentTask: 'Implement reviewer inbox state',
          checkpointStatus: 'done',
          assignmentReviewRequired: true,
          lastSummary: 'Dispatched task: review the inbox flow',
          lastResult: 'Reviewer inbox is ready for Eric handoff',
          lastOutputAt: 900,
          artifacts: [],
          previews: [],
        },
      ],
    })

    expect(rows[0]).toMatchObject({
      workerId: 'swarm4',
      scope: 'current',
      state: 'needs_review',
      stateLabel: 'Needs review',
      summary: 'Reviewer inbox is ready for Eric handoff',
    })
    expect(rows[0].details.find((detail) => detail.label === 'Result')?.value).toBe('Reviewer inbox is ready for Eric handoff')
  })

  it('prioritizes blocked affordances from checkpoints and runtime state', () => {
    const rows = buildSwarm2ReportRows({
      missions: [
        {
          id: 'mission-2',
          title: 'Blocked mission',
          state: 'blocked',
          updatedAt: 200,
          assignments: [
            {
              id: 'assign-2',
              workerId: 'swarm7',
              task: 'Deploy',
              state: 'blocked',
              reviewRequired: false,
              checkpoint: { blocker: 'Missing token' },
            },
          ],
        },
      ],
      runtimes: [],
    })

    expect(rows[0].state).toBe('blocked')
    expect(rows[0].stateLabel).toBe('Blocked')
    expect(rows[0].summary).toBe('Missing token')
  })

  it('does not classify BLOCKER: none checkpoints as blocked', () => {
    const rows = buildSwarm2ReportRows({
      missions: [
        {
          id: 'mission-3',
          title: 'Completed mission',
          state: 'complete',
          updatedAt: 300,
          assignments: [
            {
              id: 'assign-3',
              workerId: 'swarm8',
              task: 'Ship patch',
              state: 'done',
              reviewRequired: false,
              checkpoint: {
                stateLabel: 'DONE',
                checkpointStatus: 'done',
                result: 'Patch shipped',
                blocker: 'none',
              },
            },
          ],
        },
      ],
      runtimes: [],
    })

    expect(rows[0].state).toBe('ready')
    expect(rows[0].stateLabel).toBe('Ready')
    expect(rows[0].summary).toBe('Patch shipped')
  })

  it('ignores cleanup summaries from idle cancelled runtimes in current rows', () => {
    const rows = buildSwarm2CurrentReportRows({
      missions: [],
      runtimes: [
        {
          workerId: 'swarm9',
          displayName: 'Swarm9',
          state: 'idle',
          phase: 'cancelled',
          checkpointStatus: 'none',
          lastSummary: 'Reset by user cleanup: removed blocked/complete/review/queued swarm sessions',
          lastOutputAt: 1200,
          artifacts: [],
          previews: [],
        },
      ],
    })

    expect(rows).toHaveLength(0)
  })

  it('builds inbox lanes from current runtime truth instead of older history severity', () => {
    const missions = [
      {
        id: 'mission-old',
        title: 'Old ready output',
        state: 'complete',
        updatedAt: 500,
        assignments: [
          {
            id: 'assign-old',
            workerId: 'swarm10',
            task: 'Ship patch',
            state: 'done',
            reviewRequired: false,
            completedAt: 500,
            checkpoint: {
              stateLabel: 'DONE',
              checkpointStatus: 'done',
              result: 'Old ready artifact',
            },
          },
        ],
      },
      {
        id: 'mission-current',
        title: 'Current stale assignment',
        state: 'blocked',
        updatedAt: 900,
        assignments: [
          {
            id: 'assign-current',
            workerId: 'swarm10',
            task: 'Investigate regression',
            state: 'stale',
            reviewRequired: false,
            completedAt: 900,
            checkpoint: {
              stateLabel: 'BLOCKED',
              checkpointStatus: 'blocked',
              blocker: 'Worker disappeared',
            },
          },
        ],
      },
    ]
    const runtimes = [
      {
        workerId: 'swarm10',
        displayName: 'Swarm10',
        missionId: 'mission-current',
        missionTitle: 'Current stale assignment',
        assignmentId: 'assign-current',
        assignmentState: 'stale',
        assignmentStaleReason: 'Worker disappeared',
        state: 'idle',
        phase: 'orphaned',
        checkpointStatus: 'needs_input',
        blockedReason: 'Worker disappeared',
        lastResult: 'Worker disappeared',
        lastOutputAt: 950,
        artifacts: [],
        previews: [],
      },
    ]

    const currentRows = buildSwarm2CurrentReportRows({ missions, runtimes })
    expect(currentRows).toHaveLength(1)
    expect(currentRows[0]).toMatchObject({
      workerId: 'swarm10',
      missionId: 'mission-current',
      state: 'stale',
      scope: 'current',
    })

    const lanes = buildSwarm2InboxLanes({ missions, runtimes })
    expect(lanes.blocked).toHaveLength(1)
    expect(lanes.blocked[0].missionId).toBe('mission-current')
    expect(lanes.ready).toHaveLength(0)
  })
})
