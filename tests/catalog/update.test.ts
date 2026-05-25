import { describe, it, expect } from 'vitest'
import { detectUpdates } from '@/application/catalog/update'
import type { AssetMeta, InstalledState } from '@/domain/catalog/types'

const asset = (version: string): AssetMeta => ({
  id: 'x',
  name: 'x',
  description: 'd',
  type: 'skill',
  version,
  bundle: 'B',
  requires: [],
  dependsOn: [],
  body: '# Body',
})

describe('detectUpdates', () => {
  it('flags an asset whose bundled version is newer', () => {
    const installed: InstalledState = {
      x: { version: '0.1.0', platforms: ['claude'], paths: [], hash: 'h' },
    }
    expect(detectUpdates(installed, [asset('0.2.0')])).toEqual(['x'])
  })
  it('ignores up-to-date assets', () => {
    const installed: InstalledState = {
      x: { version: '0.2.0', platforms: ['claude'], paths: [], hash: 'h' },
    }
    expect(detectUpdates(installed, [asset('0.2.0')])).toEqual([])
  })
  it('ignores assets that are not installed', () => {
    expect(detectUpdates({}, [asset('9.9.9')])).toEqual([])
  })
})
