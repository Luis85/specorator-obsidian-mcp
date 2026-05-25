import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SETTINGS,
  type ToolMode,
  DEFAULT_AUTO_REGISTER,
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

  it('pathDenyList default-denies .specorator/** (tamper-protect audit log)', () => {
    expect(DEFAULT_SETTINGS.pathDenyList).toContain('.specorator/**')
  })

  it('pathDenyList default-denies .claude/hooks/** (supply-chain protection)', () => {
    expect(DEFAULT_SETTINGS.pathDenyList).toContain('.claude/hooks/**')
  })

  it('pathDenyList default-denies .claude/hooks/hooks.json (defensive explicit)', () => {
    expect(DEFAULT_SETTINGS.pathDenyList).toContain('.claude/hooks/hooks.json')
  })

  it('autoRegister.claudeCli defaults to true', () => {
    expect(DEFAULT_SETTINGS.autoRegister.claudeCli).toBe(true)
  })

  it('autoRegister.cursor defaults to false', () => {
    expect(DEFAULT_SETTINGS.autoRegister.cursor).toBe(false)
  })

  it('autoRegister.claudeDesktop defaults to false', () => {
    expect(DEFAULT_SETTINGS.autoRegister.claudeDesktop).toBe(false)
  })

  it('DEFAULT_AUTO_REGISTER matches DEFAULT_SETTINGS.autoRegister', () => {
    expect(DEFAULT_SETTINGS.autoRegister).toEqual(DEFAULT_AUTO_REGISTER)
  })

  it('obsidianBinPath defaults to empty string', () => {
    expect(DEFAULT_SETTINGS.obsidianBinPath).toBe('')
  })

  it('developerMode defaults to false', () => {
    expect(DEFAULT_SETTINGS.developerMode).toBe(false)
  })

  it('autoStart defaults to false', () => {
    expect(DEFAULT_SETTINGS.autoStart).toBe(false)
  })

  it('cli.eval defaults to deny in DEFAULT_TOOL_MODES', () => {
    expect(DEFAULT_SETTINGS.toolModes['cli.eval']).toBe('deny')
  })
})
