import { describe, it, expect } from 'vitest'
import { applyPreset, SAFE_WRITE_TOOLS, DESTRUCTIVE_TOOLS } from '@/application/settings/presets'
import { DEFAULT_SETTINGS, DEFAULT_TOOL_MODES } from '@/domain/settings/PluginSettings'

const base = { ...DEFAULT_SETTINGS }

describe('applyPreset', () => {
  it('all-ask sets every tool to "ask"', () => {
    const result = applyPreset(base, 'all-ask')
    for (const key of Object.keys(DEFAULT_TOOL_MODES)) {
      expect(result.toolModes[key]).toBe('ask')
    }
  })

  it('safe-defaults restores DEFAULT_TOOL_MODES exactly', () => {
    // First corrupt the modes, then restore
    const corrupted = applyPreset(base, 'all-allow')
    const result = applyPreset(corrupted, 'safe-defaults')
    for (const [key, value] of Object.entries(DEFAULT_TOOL_MODES)) {
      expect(result.toolModes[key]).toBe(value)
    }
  })

  it('all-allow sets every tool to "allow"', () => {
    const result = applyPreset(base, 'all-allow')
    for (const key of Object.keys(DEFAULT_TOOL_MODES)) {
      expect(result.toolModes[key]).toBe('allow')
    }
  })

  it('does not mutate the input settings object', () => {
    const original = { ...base, toolModes: { ...base.toolModes } }
    const before = JSON.stringify(original.toolModes)
    applyPreset(original, 'all-ask')
    expect(JSON.stringify(original.toolModes)).toBe(before)
  })

  it('preserves non-toolModes settings fields', () => {
    const result = applyPreset(base, 'all-ask')
    expect(result.port).toBe(base.port)
    expect(result.defaultMode).toBe(base.defaultMode)
    expect(result.pathDenyList).toBe(base.pathDenyList)
    expect(result.askTimeoutMs).toBe(base.askTimeoutMs)
    expect(result.logLevel).toBe(base.logLevel)
    expect(result.autoRegister).toBe(base.autoRegister)
    expect(result.cliExecuteAllowedPrefixes).toBe(base.cliExecuteAllowedPrefixes)
    expect(result.cliRunAllowedPrefixes).toBe(base.cliRunAllowedPrefixes)
    expect(result.obsidianBinPath).toBe(base.obsidianBinPath)
    expect(result.developerMode).toBe(base.developerMode)
  })

  it('covers all keys in DEFAULT_TOOL_MODES for safe-defaults', () => {
    const result = applyPreset(base, 'safe-defaults')
    expect(Object.keys(result.toolModes).sort()).toEqual(Object.keys(DEFAULT_TOOL_MODES).sort())
  })
})

describe('applyPreset trusted-writes', () => {
  it('sets every safe-write tool to "allow"', () => {
    const result = applyPreset(base, 'trusted-writes')
    for (const tool of SAFE_WRITE_TOOLS) {
      expect(result.toolModes[tool]).toBe('allow')
    }
  })

  it('keeps destructive tools at "ask"', () => {
    const result = applyPreset(base, 'trusted-writes')
    for (const tool of DESTRUCTIVE_TOOLS) {
      expect(result.toolModes[tool]).toBe('ask')
    }
  })

  it('keeps shell-level tools at "deny"', () => {
    const result = applyPreset(base, 'trusted-writes')
    expect(result.toolModes['cli.eval']).toBe('deny')
    expect(result.toolModes['cli.execute']).toBe('deny')
    expect(result.toolModes['cli.run']).toBe('deny')
  })

  it('leaves read tools at "allow" (unchanged from defaults)', () => {
    const result = applyPreset(base, 'trusted-writes')
    expect(result.toolModes['vault.read']).toBe('allow')
    expect(result.toolModes['metadata.tags']).toBe('allow')
  })

  it('does not mutate the input', () => {
    const original = { ...base, toolModes: { ...base.toolModes } }
    const before = JSON.stringify(original.toolModes)
    applyPreset(original, 'trusted-writes')
    expect(JSON.stringify(original.toolModes)).toBe(before)
  })
})
