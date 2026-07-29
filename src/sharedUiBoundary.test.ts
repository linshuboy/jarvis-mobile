import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const sourceDir = dirname(fileURLToPath(import.meta.url))
const appSource = readFileSync(resolve(sourceDir, '..', 'App.tsx'), 'utf8')
const adapterSource = readFileSync(resolve(sourceDir, 'mobileCompanionView.ts'), 'utf8')
const screensDir = resolve(sourceDir, 'screens')
const metroSource = readFileSync(resolve(sourceDir, '..', 'metro.config.js'), 'utf8')
const screenSource = readdirSync(screensDir)
  .filter((name) => name.endsWith('.tsx'))
  .map((name) => readFileSync(resolve(screensDir, name), 'utf8'))
  .join('\n')

if (!appSource.includes('createMobileCompanionView')) {
  throw new Error('Mobile App must consume the shared companion adapter')
}

if (appSource.includes('createMobileStatusView') || appSource.includes('mobileStatusView')) {
  throw new Error('Mobile App must not keep the old status-only adapter path')
}

if (!adapterSource.includes('createMobileCompanionSummary')) {
  throw new Error('Mobile companion adapter must consume the shared native summary')
}

if (!appSource.includes("from '@agi/frontend/native'") || appSource.includes("from '@agi/frontend'")) {
  throw new Error('Mobile App must only consume the platform-safe native entrypoint')
}

const mobileUiSource = JSON.stringify({ appSource, adapterSource, screenSource })
if (mobileUiSource.includes('host.fs') || mobileUiSource.includes('host.exec')) {
  throw new Error('Mobile UI boundary must not expose desktop host actions')
}

if (mobileUiSource.includes('three') || mobileUiSource.includes('.glb')) {
  throw new Error('Mobile UI must not load DOM or Three.js assets')
}

for (const method of ['mobile.location.get', 'mobile.camera.capture', 'mobile.audio.record']) {
  if (!screenSource.includes(method)) {
    throw new Error(`Mobile capture UI must expose ${method}`)
  }
}

if (!metroSource.includes("react: path.resolve(appNodeModules, 'react')") || !metroSource.includes("'react-native': path.resolve(appNodeModules, 'react-native')")) {
  throw new Error('Metro must pin React and React Native to the mobile host instances')
}
