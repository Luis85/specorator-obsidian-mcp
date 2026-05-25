export const GEMINI_MANIFEST_PATH = '.gemini/extensions/specorator/gemini-extension.json'

/** Manifest that registers the Specorator extension dir with Gemini CLI. */
export function geminiManifest(version: string): string {
  // R4: name+version+description only. No `contextFileName` — we don't emit a
  // GEMINI.md, and a dangling pointer breaks the extension. Gemini auto-discovers
  // the `skills/` and `commands/` subdirs under the extension root.
  return (
    JSON.stringify(
      {
        name: 'specorator',
        version,
        description: 'Specorator workflow catalog (skills + commands).',
      },
      null,
      2,
    ) + '\n'
  )
}
