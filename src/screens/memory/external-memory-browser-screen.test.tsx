import { describe, expect, it } from 'vitest'

import {
  candidateActionLabels,
  formatStateFilterLabel,
} from './external-memory-browser-screen'

describe('formatStateFilterLabel', () => {
  it('appends state totals in parentheses when counts are available', () => {
    const totals = {
      candidate: 3,
      approved: 2,
      rejected: 1,
      all: 6,
    }

    expect(formatStateFilterLabel('candidate', totals)).toBe('candidate (3)')
    expect(formatStateFilterLabel('approved', totals)).toBe('approved (2)')
    expect(formatStateFilterLabel('rejected', totals)).toBe('rejected (1)')
    expect(formatStateFilterLabel('all', totals)).toBe('all (6)')
  })

  it('keeps zero totals visible in filter labels', () => {
    expect(formatStateFilterLabel('rejected', { rejected: 0 })).toBe(
      'rejected (0)',
    )
  })
})

describe('candidateActionLabels', () => {
  const reviewProvider = { kind: 'custom' as const, capabilities: ['review'] }
  const hindsightProvider = {
    kind: 'hindsight' as const,
    capabilities: ['browse', 'search', 'delete'],
  }

  it('shows edit, approve, reject, and delete actions for review candidates', () => {
    expect(candidateActionLabels(reviewProvider, { state: 'candidate' })).toEqual([
      'Edit',
      'Approve',
      'Reject',
      'Delete',
    ])
  })

  it('hides redundant approve or reject actions for final states', () => {
    expect(candidateActionLabels(reviewProvider, { state: 'approved' })).toEqual([
      'Edit',
      'Reject',
      'Delete',
    ])
    expect(candidateActionLabels(reviewProvider, { state: 'rejected' })).toEqual([
      'Edit',
      'Approve',
      'Delete',
    ])
  })

  it('shows only delete for native Hindsight documents', () => {
    expect(candidateActionLabels(hindsightProvider, { state: 'document' })).toEqual([
      'Delete',
    ])
  })
})
