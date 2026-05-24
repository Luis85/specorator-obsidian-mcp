import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const newVersion = pkg.version

const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'))
const minAppVersion = manifest.minAppVersion
manifest.version = newVersion
fs.writeFileSync(path.join(repoRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

const versions = JSON.parse(fs.readFileSync(path.join(repoRoot, 'versions.json'), 'utf8'))
versions[newVersion] = minAppVersion
fs.writeFileSync(path.join(repoRoot, 'versions.json'), `${JSON.stringify(versions, null, 2)}\n`)

console.log(`✓ bumped to ${newVersion} (minAppVersion ${minAppVersion})`)
