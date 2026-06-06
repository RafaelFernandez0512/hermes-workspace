import type { SwarmMission, SwarmMissionAssignment, SwarmMissionEvent } from '@/server/swarm-missions'

export type SwarmEventKind =
  | 'mission_state'
  | 'assignment_state'
  | 'checkpoint'
  | 'blocked'
  | 'unblocked'
  | 'tool_use'
  | 'file_edit'
  | 'log_tail'
  | 'cancelled'
  | 'heartbeat'

export type SwarmEvent = {
  kind: SwarmEventKind
  missionId: string
  assignmentId?: string
  workerId?: string
  ts: number
  payload: Record<string, unknown>
}

export type SwarmMissionSnapshot = {
  mission: SwarmMission
  assignments: Array<SwarmMissionAssignment>
  events: Array<SwarmMissionEvent>
}

export type ActivityLevel = 'L1' | 'L2' | 'L3'
