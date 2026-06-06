import { describe, expect, it, vi } from 'vitest'
import {
  PROVIDER_MODEL_CATALOG,
  validateProviderModelCoherence,
} from '../profiles-browser'

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue(''),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    renameSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn().mockReturnValue({ isFile: () => false, mtimeMs: 0 }),
    copyFileSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn().mockReturnValue({ isFile: () => false, mtimeMs: 0 }),
  copyFileSync: vi.fn(),
}))
vi.mock('../swarm-roster', () => ({ syncSwarmRosterWorkerModel: vi.fn() }))

describe('validateProviderModelCoherence', () => {
  it('returns null for null/undefined inputs', () => {
    expect(validateProviderModelCoherence(null, null)).toBeNull()
    expect(validateProviderModelCoherence(undefined, undefined)).toBeNull()
    expect(validateProviderModelCoherence(null, undefined)).toBeNull()
  })

  it('returns null for valid anthropic+model pair', () => {
    expect(
      validateProviderModelCoherence('anthropic', 'claude-sonnet-4-6'),
    ).toBeNull()
    expect(
      validateProviderModelCoherence('anthropic', 'claude-opus-4-7'),
    ).toBeNull()
  })

  it('returns null for open-ended provider (openai)', () => {
    expect(validateProviderModelCoherence('openai', 'gpt-4o')).toBeNull()
    expect(
      validateProviderModelCoherence('openai', 'some-future-model'),
    ).toBeNull()
  })

  it('accepts the openai-codex family', () => {
    expect(validateProviderModelCoherence('openai-codex', 'gpt-5.5')).toBeNull()
    expect(
      validateProviderModelCoherence('openai-codex', 'deepseek-v4-pro'),
    ).toBeNull()
  })

  it('accepts the deepseek provider family', () => {
    expect(
      validateProviderModelCoherence('deepseek', 'deepseek/deepseek-r1'),
    ).toBeNull()
    expect(validateProviderModelCoherence('deepseek', 'deepseek-v3')).toBeNull()
    expect(
      validateProviderModelCoherence('deepseek', 'deepseek-v4-pro'),
    ).toBeNull()
  })

  it('rejects invalid model for openai-codex', () => {
    const result = validateProviderModelCoherence('openai-codex', 'gpt-3')
    expect(result).not.toBeNull()
    expect(result!.code).toBe('invalid_model')
    expect(result!.message).toMatch(/openai-codex/)
  })

  it('rejects invalid model for anthropic', () => {
    const result = validateProviderModelCoherence('anthropic', 'gpt-4o')
    expect(result).not.toBeNull()
    expect(result!.code).toBe('invalid_model')
    expect(result!.message).toMatch(/gpt-4o/)
    expect(result!.message).toMatch(/anthropic/)
  })

  it('returns null when only provider is provided (no model)', () => {
    expect(validateProviderModelCoherence('anthropic', null)).toBeNull()
    expect(validateProviderModelCoherence('anthropic', undefined)).toBeNull()
    expect(validateProviderModelCoherence('deepseek', null)).toBeNull()
  })

  it('catalog contains all expected anthropic models', () => {
    const catalog = PROVIDER_MODEL_CATALOG['anthropic']
    expect(catalog).not.toBeNull()
    expect(catalog!.has('claude-sonnet-4-6')).toBe(true)
    expect(catalog!.has('claude-opus-4-7')).toBe(true)
    expect(catalog!.has('claude-haiku-4-5')).toBe(true)
  })

  it('catalog contains all expected deepseek models', () => {
    const catalog = PROVIDER_MODEL_CATALOG['deepseek']
    expect(catalog).not.toBeNull()
    expect(catalog!.has('deepseek/deepseek-r1')).toBe(true)
    expect(catalog!.has('deepseek-v3')).toBe(true)
    expect(catalog!.has('deepseek-chat')).toBe(true)
    expect(catalog!.has('deepseek-v4-pro')).toBe(true)
  })
})
