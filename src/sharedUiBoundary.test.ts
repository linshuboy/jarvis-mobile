import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const sourceDir = dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(resolve(sourceDir, '..', 'App.tsx'), 'utf8')
const adapterSource = readFileSync(resolve(sourceDir, 'mobileCompanionView.ts'), 'utf8')

if (!appSource.includes('createMobileCompanionView')) {
  throw new Error('Mobile App must consume the shared companion adapter')
}

if (appSource.includes('createMobileStatusView') || appSource.includes('mobileStatusView')) {
  throw new Error('Mobile App must not keep the old status-only adapter path')
}

if (!adapterSource.includes('createMobileCompanionSummary')) {
  throw new Error('Mobile companion adapter must consume the shared native summary')
}

if (JSON.stringify({ appSource, adapterSource }).includes('host.fs') || JSON.stringify({ appSource, adapterSource }).includes('host.exec')) {
  throw new Error('Mobile UI boundary must not expose desktop host actions')
}
