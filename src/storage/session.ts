import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

import type {
  AuthSession,
  MobileAudioState,
  MobileBindingState,
  MobileCameraState,
  MobileLocationState,
  RuntimeIdentity,
} from '../types'

const AUTH_SESSION_KEY = 'agi.mobile.auth_session'
const BINDING_STATE_KEY = 'agi.mobile.binding_state'
const RUNTIME_IDENTITY_KEY = 'agi.mobile.runtime_identity'
const LOCATION_STATE_KEY = 'agi.mobile.location_state'
const CAMERA_STATE_KEY = 'agi.mobile.camera_state'
const AUDIO_STATE_KEY = 'agi.mobile.audio_state'
const UPDATE_PROXY_KEY = 'agi.mobile.client_update_proxy_url'

function randomUuid(): string {
  const maybeCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined
  if (maybeCrypto?.randomUUID) {
    return maybeCrypto.randomUUID()
  }
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
  return template.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    const value = char === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

async function readRaw(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return globalThis.localStorage?.getItem(key) ?? null
  }
  return SecureStore.getItemAsync(key)
}

async function writeRaw(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(key, value)
    return
  }
  await SecureStore.setItemAsync(key, value)
}

async function deleteRaw(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(key)
    return
  }
  await SecureStore.deleteItemAsync(key)
}

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await readRaw(key)
  if (!raw?.trim()) {
    return null
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    await deleteRaw(key)
    return null
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await writeRaw(key, JSON.stringify(value))
}

export function readSession(): Promise<AuthSession | null> {
  return readJson<AuthSession>(AUTH_SESSION_KEY)
}

export function writeSession(value: AuthSession): Promise<void> {
  return writeJson(AUTH_SESSION_KEY, value)
}

export function clearSession(): Promise<void> {
  return deleteRaw(AUTH_SESSION_KEY)
}

export function readBindingState(): Promise<MobileBindingState | null> {
  return readJson<MobileBindingState>(BINDING_STATE_KEY)
}

export function writeBindingState(value: MobileBindingState): Promise<void> {
  return writeJson(BINDING_STATE_KEY, value)
}

export function clearBindingState(): Promise<void> {
  return deleteRaw(BINDING_STATE_KEY)
}

export function readLocationState(): Promise<MobileLocationState | null> {
  return readJson<MobileLocationState>(LOCATION_STATE_KEY)
}

export function writeLocationState(value: MobileLocationState): Promise<void> {
  return writeJson(LOCATION_STATE_KEY, value)
}

export function clearLocationState(): Promise<void> {
  return deleteRaw(LOCATION_STATE_KEY)
}

export function readCameraState(): Promise<MobileCameraState | null> {
  return readJson<MobileCameraState>(CAMERA_STATE_KEY)
}

export function writeCameraState(value: MobileCameraState): Promise<void> {
  return writeJson(CAMERA_STATE_KEY, value)
}

export function clearCameraState(): Promise<void> {
  return deleteRaw(CAMERA_STATE_KEY)
}

export function readAudioState(): Promise<MobileAudioState | null> {
  return readJson<MobileAudioState>(AUDIO_STATE_KEY)
}

export function writeAudioState(value: MobileAudioState): Promise<void> {
  return writeJson(AUDIO_STATE_KEY, value)
}

export function clearAudioState(): Promise<void> {
  return deleteRaw(AUDIO_STATE_KEY)
}

export function readUpdateProxyUrl(): Promise<string> {
  return readRaw(UPDATE_PROXY_KEY).then((value) => value?.trim() || '')
}

export function writeUpdateProxyUrl(value: string): Promise<void> {
  const trimmed = value.trim()
  if (!trimmed) {
    return deleteRaw(UPDATE_PROXY_KEY)
  }
  return writeRaw(UPDATE_PROXY_KEY, trimmed)
}

export async function ensureRuntimeIdentity(): Promise<RuntimeIdentity> {
  const existing = await readJson<RuntimeIdentity>(RUNTIME_IDENTITY_KEY)
  if (existing?.runtime_id) {
    return existing
  }
  const next: RuntimeIdentity = {
    runtime_id: randomUuid(),
    created_at: new Date().toISOString(),
  }
  await writeJson(RUNTIME_IDENTITY_KEY, next)
  return next
}
