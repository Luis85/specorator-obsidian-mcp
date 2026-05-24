import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { VaultPort } from '@/domain/ports'

export function parseFrontmatter(content: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (!match) return {}
  try {
    const result = parseYaml(match[1]) as unknown
    if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
      return result as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

export async function applyFrontmatterUpdate(
  vault: VaultPort,
  path: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const content = await vault.readFile(path)
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content)
  let existing: Record<string, unknown> = {}
  let bodyStart = 0
  if (fmMatch) {
    try {
      const parsed = parseYaml(fmMatch[1]) as unknown
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>
        bodyStart = fmMatch[0].length
      }
    } catch {
      // non-YAML block — leave bodyStart at 0 so content is preserved
    }
  }
  const merged = { ...existing, ...updates }
  await vault.writeFile(path, `---\n${stringifyYaml(merged)}---\n${content.slice(bodyStart)}`)
}

export function joinVaultPath(parent: string, child: string): string {
  const p = parent.replace(/\/+$/, '')
  return p ? `${p}/${child}` : child
}

export async function collectFiles(vault: VaultPort, folder: string): Promise<string[]> {
  const [files, subfolders] = await Promise.all([
    vault.listFiles(folder),
    vault.listFolders(folder),
  ])
  const nested = await Promise.all(
    subfolders.map((sub) => collectFiles(vault, joinVaultPath(folder, sub))),
  )
  return [...files, ...nested.flat()]
}

export function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
}

export function deny(reason: string): { isError: true; content: [{ type: 'text'; text: string }] } {
  return { isError: true, content: [{ type: 'text' as const, text: `denied: ${reason}` }] }
}

export function err(message: string): { isError: true; content: [{ type: 'text'; text: string }] } {
  return { isError: true, content: [{ type: 'text' as const, text: `error: ${message}` }] }
}
