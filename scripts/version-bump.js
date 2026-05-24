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

const pkg = readJson(path.join(repoRoot, 'package.json'))
const newVersion = pkg.version

const manifest = readJson(path.join(repoRoot, 'manifest.json'))
const minAppVersion = manifest.minAppVersion
manifest.version = newVersion
fs.writeFileSync(path.join(repoRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

const versions = readJson(path.join(repoRoot, 'versions.json'))
versions[newVersion] = minAppVersion
fs.writeFileSync(path.join(repoRoot, 'versions.json'), `${JSON.stringify(versions, null, 2)}\n`)

console.log(`✓ bumped to ${newVersion} (minAppVersion ${minAppVersion})`)
