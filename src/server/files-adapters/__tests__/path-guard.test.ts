import { describe, expect, it } from 'vitest'
import { ensureWithinRoot } from '../path-guard'

const ROOT = '/home/alice/files'

describe('ensureWithinRoot', () => {
  it('resolves a simple relative path', () => {
    expect(ensureWithinRoot(ROOT, 'docs/readme.md')).toBe('/home/alice/files/docs/readme.md')
  })

  it('resolves a path at root level', () => {
    expect(ensureWithinRoot(ROOT, 'file.txt')).toBe('/home/alice/files/file.txt')
  })

  it('resolves empty input to the root itself', () => {
    expect(ensureWithinRoot(ROOT, '')).toBe('/home/alice/files')
  })

  it('rejects .. traversal above root', () => {
    expect(() => ensureWithinRoot(ROOT, '../../etc/passwd')).toThrow('Path is outside SFTP root')
  })

  it('rejects a single .. segment', () => {
    expect(() => ensureWithinRoot(ROOT, '../sibling')).toThrow('Path is outside SFTP root')
  })

  it('strips leading slashes so absolute-looking inputs stay within root', () => {
    // '/abs/outside' becomes 'abs/outside' after stripping, which is within root
    const resolved = ensureWithinRoot(ROOT, '/abs/outside')
    expect(resolved).toBe('/home/alice/files/abs/outside')
  })

  it('rejects Windows-style backslash traversal', () => {
    // Windows path converted: ..\\..\\etc\\passwd → ../../etc/passwd after normalize
    expect(() => ensureWithinRoot(ROOT, '..\\..\\etc\\passwd')).toThrow('Path is outside SFTP root')
  })

  it('allows deeply nested valid path', () => {
    const result = ensureWithinRoot(ROOT, 'a/b/c/d/e.txt')
    expect(result).toBe('/home/alice/files/a/b/c/d/e.txt')
  })

  it('handles path with redundant segments inside root', () => {
    const result = ensureWithinRoot(ROOT, 'a/./b/../b/file.txt')
    expect(result).toBe('/home/alice/files/a/b/file.txt')
  })
})
