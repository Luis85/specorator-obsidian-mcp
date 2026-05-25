import { describe, it, expect, vi, afterEach } from 'vitest'
import { yieldEveryN, pool } from '@/application/mcp/batching'
import { auditVault, DEFAULT_MAX_FILES } from '@/application/mcp/audit'
import { MockVaultPort } from '@/infrastructure/mock/MockVaultPort'
import { MockMetadataCachePort } from '@/infrastructure/mock/MockMetadataCachePort'

afterEach(() => {
  vi.restoreAllMocks()
})

// ── yieldEveryN ───────────────────────────────────────────────────────────────

describe('yieldEveryN', () => {
  it('processes all items in order', async () => {
    const result = await yieldEveryN([1, 2, 3, 4, 5], 2, (x) => x * 2)
    expect(result).toEqual([2, 4, 6, 8, 10])
  })

  it('yields to the event loop after every batchSize items', async () => {
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const items = Array.from({ length: 6 }, (_, i) => i)

    await yieldEveryN(items, 2, (x) => x)

    // Indices 1, 3, 5 each complete a batch of 2 → 3 yields
    expect(timeoutSpy).toHaveBeenCalledTimes(3)
  })

  it('does not yield when items fit in one batch', async () => {
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const items = [0, 1]

    await yieldEveryN(items, 5, (x) => x)

    expect(timeoutSpy).not.toHaveBeenCalled()
  })

  it('handles async fn correctly', async () => {
    const result = await yieldEveryN([1, 2, 3], 10, async (x) => x + 10)
    expect(result).toEqual([11, 12, 13])
  })

  it('returns empty array for empty input', async () => {
    const result = await yieldEveryN([], 50, (x: number) => x)
    expect(result).toEqual([])
  })
})

// ── pool ──────────────────────────────────────────────────────────────────────

describe('pool', () => {
  it('processes all items and preserves order', async () => {
    const result = await pool([3, 1, 4, 1, 5], 2, async (x) => x * 2)
    expect(result).toEqual([6, 2, 8, 2, 10])
  })

  it('respects concurrency limit', async () => {
    let concurrent = 0
    let maxConcurrent = 0

    await pool(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      async (x) => {
        concurrent++
        maxConcurrent = Math.max(maxConcurrent, concurrent)
        await new Promise<void>((r) => setTimeout(r, 0))
        concurrent--
        return x
      },
    )

    expect(maxConcurrent).toBeLessThanOrEqual(3)
  })

  it('handles empty input', async () => {
    const result = await pool([], 8, async (x: number) => x)
    expect(result).toEqual([])
  })

  it('handles single item', async () => {
    const result = await pool([42], 8, async (x) => x + 1)
    expect(result).toEqual([43])
  })

  it('clamps workers to item count when limit > items.length', async () => {
    // Should not create more workers than items — just verify it completes
    const result = await pool([1, 2], 100, async (x) => x)
    expect(result).toEqual([1, 2])
  })
})

// ── auditVault perf-budget (large vault) ─────────────────────────────────────

describe('auditVault perf-budget', () => {
  function makeLargeVault(fileCount: number) {
    const vault = new MockVaultPort()
    const metadata = new MockMetadataCachePort()
    for (let i = 0; i < fileCount; i++) {
      vault.seedFile(`note${i}.md`, `# Note ${i}`)
    }
    return { vault, metadata }
  }

  it('completes without deadlocking on 10 000 files (orphans check)', async () => {
    const { vault, metadata } = makeLargeVault(10_000)
    // Should finish; if it hangs, the test runner times out
    const result = await auditVault({ vault, metadata }, '', ['orphans'], 1_000_000, 10_000)
    expect(result.totalFiles).toBe(10_000)
    expect(Array.isArray(result.findings.orphans)).toBe(true)
  })

  it('yields to the event loop (setTimeout called) during a large scan', async () => {
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const { vault, metadata } = makeLargeVault(500)

    await auditVault({ vault, metadata }, '', ['orphans'], 1_000_000, 500)

    // 500 items / 200 per batch = 2 full batches → at least 2 yields
    expect(timeoutSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('caps the scan at maxFiles and returns truncated:true', async () => {
    const { vault, metadata } = makeLargeVault(200)

    const result = await auditVault({ vault, metadata }, '', ['orphans'], 1_000_000, 50)

    expect(result.totalFiles).toBe(50)
    expect(result.truncated).toBe(true)
  })

  it('does not set truncated when vault is within the budget', async () => {
    const { vault, metadata } = makeLargeVault(10)

    const result = await auditVault({ vault, metadata }, '', ['orphans'], 1_000_000, 100)

    expect(result.truncated).toBeUndefined()
  })

  it('DEFAULT_MAX_FILES is 5000', () => {
    expect(DEFAULT_MAX_FILES).toBe(5000)
  })
})
