import { describe, expect, it } from 'vitest'
import { normalizeHermesConfigState } from './hermes-config-migration'

const paths = {
  hermesHome: '/tmp/hermes',
  configPath: '/tmp/hermes/config.yaml',
  envPath: '/tmp/hermes/.env',
  authProfilesPath: '/tmp/hermes/auth-profiles.json',
}

describe('normalizeHermesConfigState', () => {
  it('normalizes flat default provider and model config', () => {
    const state = normalizeHermesConfigState({
      paths,
      config: { provider: 'openrouter', model: 'auto' },
      env: { OPENROUTER_API_KEY: 'sk-openrouter-123456' },
      authProfiles: {},
      localProviders: [],
      localModels: [],
    })

    expect(state.activeProvider).toBe('openrouter')
    expect(state.activeModel).toBe('auto')
    expect(state.defaultModel).toEqual({
      provider: 'openrouter',
      model: 'auto',
      source: 'flat',
    })
    const openrouter = state.providers.find((p) => p.id === 'openrouter')
    expect(openrouter?.configured).toBe(true)
    expect(openrouter?.authenticated).toBe(true)
    expect(openrouter?.isDefault).toBe(true)
    expect(openrouter?.authSource).toBe('env')
  })

  it('normalizes nested default provider and model config', () => {
    const state = normalizeHermesConfigState({
      paths,
      config: { model: { provider: 'openai-codex', default: 'gpt-5.4' } },
      env: {},
      authProfiles: {},
      localProviders: [],
      localModels: [],
    })

    expect(state.activeProvider).toBe('openai-codex')
    expect(state.activeModel).toBe('gpt-5.4')
    expect(state.defaultModel).toEqual({
      provider: 'openai-codex',
      model: 'gpt-5.4',
      source: 'nested',
    })
  })

  it('falls back to nested model when only a partial flat field is set', () => {
    const state = normalizeHermesConfigState({
      paths,
      config: {
        provider: 'openrouter',
        model: { provider: 'openrouter', default: 'auto' },
      },
      env: {},
      authProfiles: {},
      localProviders: [],
      localModels: [],
    })

    expect(state.defaultModel).toEqual({
      provider: 'openrouter',
      model: 'auto',
      source: 'nested',
    })
  })

  it('infers openai-codex provider from flat codex model ids', () => {
    const state = normalizeHermesConfigState({
      paths,
      config: { model: 'gpt-5.4-mini' },
      env: {},
      authProfiles: {
        providers: {
          'openai-codex': { tokens: { access_token: 'tok-12345678' } },
        },
      },
      localProviders: [],
      localModels: [],
    })

    expect(state.activeProvider).toBe('openai-codex')
    expect(state.activeModel).toBe('gpt-5.4-mini')
    expect(state.defaultModel).toEqual({
      provider: 'openai-codex',
      model: 'gpt-5.4-mini',
      source: 'flat',
    })
  })
})
