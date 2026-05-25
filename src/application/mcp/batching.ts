/**
 * Main-thread yielding helpers for Obsidian plugin code.
 *
 * Obsidian's renderer is single-threaded. Any tight loop over thousands of
 * files that never yields to the event loop freezes the UI. These helpers
 * periodically cede the macrotask queue so Obsidian can paint between batches.
 *
 * Usage:
 *   // I/O-bound (file reads) — yield every 50 items
 *   const results = await yieldEveryN(files, 50, (f) => vault.readFile(f))
 *
 *   // CPU-bound (in-memory work) — yield every 200 items
 *   const results = await yieldEveryN(items, 200, (x) => process(x))
 *
 *   // Unbounded concurrent I/O — cap at 8 parallel reads
 *   const results = await pool(files, 8, (f) => vault.readFile(f))
 */

/**
 * Process `items` in order, calling `fn` for each one, and yield to the event
 * loop (via `setTimeout(resolve, 0)`) after every `batchSize` items.
 *
 * @param items     Array to iterate over.
 * @param batchSize Number of items to process before yielding. Use 50 for I/O,
 *                  200 for pure-CPU work.
 * @param fn        Async (or sync) function to call per item.
 */
export async function yieldEveryN<T, U>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<U> | U,
): Promise<U[]> {
  const out: U[] = []
  for (let i = 0; i < items.length; i++) {
    out.push(await fn(items[i]!))
    if (i % batchSize === batchSize - 1) {
      await new Promise<void>((r) => setTimeout(r, 0))
    }
  }
  return out
}

/**
 * Process `items` with at most `limit` concurrent async operations.
 *
 * Replaces `Promise.all(largeArray.map(...))` patterns where unbounded
 * concurrency would slam the vault adapter (hundreds of simultaneous reads).
 *
 * @param items Array to process.
 * @param limit Maximum concurrent workers (use 8 for file I/O).
 * @param fn    Async function to call per item; result order matches input order.
 */
export async function pool<T, U>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<U>,
): Promise<U[]> {
  const results: U[] = new Array(items.length)
  let index = 0

  async function worker(): Promise<void> {
    while (true) {
      const i = index++
      if (i >= items.length) return
      results[i] = await fn(items[i]!)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}
