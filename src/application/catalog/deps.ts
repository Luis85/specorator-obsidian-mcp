import type { AssetMeta } from '@/domain/catalog/types'

export function resolveOrder(rootId: string, assets: AssetMeta[]): string[] {
  const byId = new Map(assets.map((a) => [a.id, a]))
  const order: string[] = []
  const state = new Map<string, 'visiting' | 'done'>()

  const visit = (id: string) => {
    const node = byId.get(id)
    if (!node) throw new Error(`missing dependency: ${id}`)
    const s = state.get(id)
    if (s === 'done') return
    if (s === 'visiting') throw new Error(`dependency cycle at: ${id}`)
    state.set(id, 'visiting')
    for (const dep of node.dependsOn) visit(dep)
    state.set(id, 'done')
    order.push(id)
  }

  visit(rootId)
  return order
}
