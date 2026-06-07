import { describe, expect, it } from 'vitest'

import { buildSpawnPath } from './path-env'

describe('buildSpawnPath', () => {
  it('preserves Windows paths when using semicolon delimiters', () => {
    const result = buildSpawnPath(
      ['C:\\Users\\winterfell\\.claude\\bin', 'C:\\Users\\winterfell\\.local\\bin'],
      'C:\\Program Files\\dotnet;C:\\Windows\\System32',
      ';',
    )

    expect(result).toBe(
      'C:\\Users\\winterfell\\.claude\\bin;C:\\Users\\winterfell\\.local\\bin;C:\\Program Files\\dotnet;C:\\Windows\\System32',
    )
  })

  it('uses the provided delimiter', () => {
    const result = buildSpawnPath(['one', 'two'], 'three', ':')
    expect(result).toBe('one:two:three')
  })
})
