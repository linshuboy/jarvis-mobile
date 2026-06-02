import { Linking, Platform } from 'react-native'

import type { ClientReleaseAsset, ClientReleaseManifest, MobileClientUpdateCheck } from '../types'

const DEFAULT_RELEASE_MANIFEST_URL =
  'https://github.com/linshuboy/JARVISAI/releases/latest/download/release-manifest.json'
const CURRENT_MOBILE_VERSION = '0.1.6'

export function releaseManifestUrl(): string {
  return DEFAULT_RELEASE_MANIFEST_URL
}

function normalizeArch(value: string): string {
  const lower = value.toLowerCase()
  if (lower === 'x64' || lower === 'x86_64') {
    return 'amd64'
  }
  if (lower === 'aarch64') {
    return 'arm64'
  }
  return lower
}

function currentMobilePlatform(): string {
  if (Platform.OS === 'android') {
    return 'android'
  }
  if (Platform.OS === 'ios') {
    return 'ios'
  }
  return 'mobile'
}

function currentMobileArchCandidates(): string[] {
  if (Platform.OS !== 'android') {
    return []
  }
  const constants = Platform.constants as Record<string, unknown>
  const rawArchitectures = constants.SupportedAbis || constants.supportedAbis
  const values = Array.isArray(rawArchitectures) ? rawArchitectures.map(String) : []
  const normalized = values.map(normalizeArch)
  return [...new Set(normalized)]
}

function selectMobileAsset(manifest: ClientReleaseManifest): ClientReleaseAsset | null {
  const platform = currentMobilePlatform()
  const candidates = manifest.clients.mobile.filter((asset) => asset.platform === platform)
  if (platform === 'android') {
    const arches = currentMobileArchCandidates()
    for (const arch of arches) {
      const matched = candidates.find((asset) => asset.arch === arch)
      if (matched) {
        return matched
      }
    }
    const universal = candidates.find((asset) => !asset.arch)
    if (universal) {
      return universal
    }
  }
  return candidates[0] ?? null
}

export async function checkMobileClientUpdate(): Promise<MobileClientUpdateCheck> {
  const manifestUrl = releaseManifestUrl()
  const response = await fetch(manifestUrl, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`检查更新失败：${response.status} ${response.statusText}`.trim())
  }
  const manifest = (await response.json()) as ClientReleaseManifest
  const latestVersion = String(manifest.release?.version || '')
  return {
    manifest_url: manifestUrl,
    current_version: CURRENT_MOBILE_VERSION,
    latest_version: latestVersion,
    update_available: Boolean(latestVersion && latestVersion !== CURRENT_MOBILE_VERSION),
    checked_at: new Date().toISOString(),
    asset: selectMobileAsset(manifest),
    all_assets: Array.isArray(manifest.clients?.mobile) ? manifest.clients.mobile : [],
  }
}

export async function downloadMobileClientUpdate(asset: ClientReleaseAsset): Promise<void> {
  const url = asset.url.trim()
  if (!url) {
    throw new Error('客户端文件下载地址为空')
  }
  const supported = await Linking.canOpenURL(url)
  if (!supported) {
    throw new Error(`系统无法打开下载地址：${url}`)
  }
  await Linking.openURL(url)
}
