import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SETTINGS,
  type PluginSettings,
  type ToolMode,
} from '@/domain/settings/PluginSettings'

describe('PluginSettings defaults', () => {
  it('default port is 7842', () => {
    expect(DEFAULT_SETTINGS.port).toBe(7842)
  })

  it('default mode is ask', () => {
    expect(DEFAULT_SETTINGS.defaultMode).toBe<ToolMode>('ask')
  })

  it('cli.execute defaults to deny', () => {
    expect(DEFAULT_SETTINGS.toolModes['cli.execute']).toBe('deny')
  })

  it('vault.write defaults to ask', () => {
    expect(DEFAULT_SETTINGS.toolModes['vault.write']).toBe('ask')
  })

  it('askTimeoutMs is 30000', () => {
    expect(DEFAULT_SETTINGS.askTimeoutMs).toBe(30_000)
  })

  it('pathDenyList is empty by default', () => {
    expect(DEFAULT_SETTINGS.pathDenyList).toEqual<PluginSettings['pathDenyList']>([])
  })
})
