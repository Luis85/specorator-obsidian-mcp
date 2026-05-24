import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`✗ Required file not found: ${filePath}`)
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

const manifest = readJson(path.join(repoRoot, 'manifest.json'))
const pkg = readJson(path.join(repoRoot, 'package.json'))
const versions = readJson(path.join(repoRoot, 'versions.json'))

const errors = []

const required = [
  'id',
  'name',
  'version',
  'minAppVersion',
  'description',
  'author',
  'isDesktopOnly',
]
for (const key of required) {
  if (manifest[key] === undefined) errors.push(`manifest.json missing field: ${key}`)
}

if (manifest.version !== pkg.version) {
  errors.push(`version mismatch: manifest=${manifest.version} package=${pkg.version}`)
}

if (!versions[manifest.version]) {
  errors.push(`versions.json missing entry for ${manifest.version}`)
}

if (manifest.isDesktopOnly !== true) {
  errors.push('isDesktopOnly must be true (http.Server is Node-only)')
}

if (manifest.fundingUrl !== undefined) {
  try {
    const u = new URL(manifest.fundingUrl)
    if (!['http:', 'https:'].includes(u.protocol)) {
      errors.push('fundingUrl must use http or https protocol')
    }
  } catch {
    errors.push(`fundingUrl is not a valid URL: ${manifest.fundingUrl}`)
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`✗ ${e}`)
  process.exit(1)
}
console.log('✓ manifest.json valid')

// Bundle size gate: main.js must be < 2 MB in production builds.
// Inline sourcemaps inflate the file to ~4.6 MB — this catches regressions.
// (Production bundle without sourcemaps is ~1.4 MB due to MCP SDK + zod + yaml.)
const mainJsPath = path.join(repoRoot, 'main.js')
if (fs.existsSync(mainJsPath)) {
  const bundleSizeBytes = fs.statSync(mainJsPath).size
  const LIMIT_BYTES = 2_000_000 // 2 MB
  if (bundleSizeBytes > LIMIT_BYTES) {
    console.error(
      `✗ main.js is ${(bundleSizeBytes / 1024).toFixed(0)} KB — exceeds 2 MB limit.` +
        ' Inline sourcemaps may have been re-enabled for a production build.',
    )
    process.exit(1)
  }
  console.log(`✓ main.js bundle size: ${(bundleSizeBytes / 1024).toFixed(0)} KB (limit 2 MB)`)
} else {
  console.log('⚠ main.js not found — skipping bundle size check (run npm run build first)')
}
