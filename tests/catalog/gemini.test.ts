import { describe, it, expect } from 'vitest'
import { geminiManifest, GEMINI_MANIFEST_PATH } from '@/application/catalog/gemini'

describe('gemini extension manifest', () => {
  it('lives at the extension root', () => {
    expect(GEMINI_MANIFEST_PATH).toBe('.gemini/extensions/specorator/gemini-extension.json')
  })
  it('declares name + version so Gemini registers the extension (R4: no dangling contextFileName)', () => {
    const m = JSON.parse(geminiManifest('0.1.0')) as Record<string, unknown>
    expect(m.name).toBe('specorator')
    expect(m.version).toBe('0.1.0')
    // R4: must NOT point contextFileName at a GEMINI.md we never emit.
    expect(m.contextFileName).toBeUndefined()
  })
})
