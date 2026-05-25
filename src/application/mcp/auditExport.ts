/**
 * Format audit results as a Markdown report.
 *
 * The resulting Markdown has:
 *   - A H1 title with the audited folder and timestamp
 *   - One H2 section per check that ran
 *   - A bullet list of affected paths (or "✓ none" when clean)
 *   - A summary table at the end
 */

import type { AuditResult, AuditFindings } from './audit'

const CHECK_LABELS: Record<string, string> = {
  orphans: 'Orphaned Notes (no backlinks)',
  deadends: 'Dead-ends (no outgoing links)',
  unresolved_links: 'Unresolved Links',
  empty_notes: 'Empty Notes',
  large_files: 'Large Files',
  tag_dupes: 'Duplicate Tags (case variants)',
}

function formatCheck(checkName: string, findings: AuditFindings): string {
  const label = CHECK_LABELS[checkName] ?? checkName
  const lines: string[] = [`## ${label}`, '']

  switch (checkName) {
    case 'orphans':
    case 'deadends':
    case 'empty_notes': {
      const items = findings[checkName as 'orphans' | 'deadends' | 'empty_notes'] ?? []
      if (items.length === 0) {
        lines.push('✓ none')
      } else {
        for (const p of items) lines.push(`- \`${p}\``)
      }
      break
    }
    case 'unresolved_links': {
      const items = findings.unresolved_links ?? []
      if (items.length === 0) {
        lines.push('✓ none')
      } else {
        for (const { source, target } of items) {
          lines.push(`- \`${source}\` → \`${target}\` (unresolved)`)
        }
      }
      break
    }
    case 'large_files': {
      const items = findings.large_files ?? []
      if (items.length === 0) {
        lines.push('✓ none')
      } else {
        for (const { path, bytes } of items) {
          lines.push(`- \`${path}\` (${(bytes / 1024).toFixed(1)} KB)`)
        }
      }
      break
    }
    case 'tag_dupes': {
      const items = findings.tag_dupes ?? []
      if (items.length === 0) {
        lines.push('✓ none')
      } else {
        for (const { canonical, variants } of items) {
          lines.push(`- \`${canonical}\` variants: ${variants.map((v) => `\`${v}\``).join(', ')}`)
        }
      }
      break
    }
    default: {
      lines.push('(no formatter for this check)')
      break
    }
  }

  lines.push('')
  return lines.join('\n')
}

export function formatAuditMarkdown(result: AuditResult, generatedAt?: Date): string {
  const ts = (generatedAt ?? new Date()).toISOString()
  const folder = result.folder || '(vault root)'
  const lines: string[] = [
    `# Vault Audit Report`,
    '',
    `**Folder:** \`${folder}\`  `,
    `**Generated:** ${ts}  `,
    `**Total files audited:** ${result.totalFiles}  `,
    `**Checks run:** ${result.checksRun.join(', ')}`,
    '',
  ]

  for (const check of result.checksRun) {
    lines.push(formatCheck(check, result.findings))
  }

  // Summary table
  lines.push('## Summary')
  lines.push('')
  lines.push('| Check | Count |')
  lines.push('|---|---|')
  for (const [check, count] of Object.entries(result.counts)) {
    const label = CHECK_LABELS[check] ?? check
    lines.push(`| ${label} | ${count} |`)
  }
  lines.push('')

  return lines.join('\n')
}
