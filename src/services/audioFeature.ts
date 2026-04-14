import { Audio } from 'expo-av'
import { AppState, Platform } from 'react-native'

import { clearAudioState, readAudioState, writeAudioState } from '../storage/session'
import type { MobileAudioCapture, MobileAudioState } from '../types'
import { MobileFeatureError } from './locationFeature'

const DEFAULT_DURATION_MS = 5000
const MIN_DURATION_MS = 1000
const MAX_DURATION_MS = 30000

function nowIso(): string {
  return new Date().toISOString()
}

function defaultAudioState(): MobileAudioState {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return {
      supported: false,
      permission_status: 'unavailable',
      foreground_required: true,
      is_recording: false,
      last_capture: null,
      last_error: 'audio.record is only supported on iOS and Android',
      updated_at: nowIso(),
    }
  }
  return {
    supported: true,
    permission_status: 'undetermined',
    foreground_required: true,
    is_recording: false,
    last_capture: null,
    last_error: '',
    updated_at: nowIso(),
  }
}

function withState(base: MobileAudioState, patch: Partial<MobileAudioState>): MobileAudioState {
  return {
    ...base,
    ...patch,
    updated_at: nowIso(),
  }
}

async function persist(state: MobileAudioState): Promise<MobileAudioState> {
  await writeAudioState(state)
  return state
}

function mapPermissionStatus(value: string | null | undefined): MobileAudioState['permission_status'] {
  switch (String(value || '').toLowerCase()) {
    case 'granted':
      return 'granted'
    case 'denied':
      return 'denied'
    case 'undetermined':
      return 'undetermined'
    default:
      return 'unavailable'
  }
}

function ensureForeground(): void {
  if (AppState.currentState !== 'active') {
    throw new MobileFeatureError('FOREGROUND_REQUIRED', 'audio.record requires the app to stay in foreground')
  }
}

function clampDurationMs(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DURATION_MS
  }
  return Math.min(Math.max(Math.round(parsed), MIN_DURATION_MS), MAX_DURATION_MS)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function guessMimeType(uri: string | null): string | null {
  if (!uri) {
    return null
  }
  if (uri.endsWith('.m4a')) {
    return 'audio/mp4'
  }
  if (uri.endsWith('.caf')) {
    return 'audio/x-caf'
  }
  if (uri.endsWith('.3gp')) {
    return 'audio/3gpp'
  }
  if (uri.endsWith('.webm')) {
    return 'audio/webm'
  }
  return null
}

function fileNameFromUri(uri: string | null): string | null {
  if (!uri) {
    return null
  }
  const index = uri.lastIndexOf('/')
  if (index < 0 || index === uri.length - 1) {
    return uri
  }
  return uri.slice(index + 1)
}

async function currentPermissionStatus(interactive: boolean): Promise<Audio.PermissionResponse> {
  const existing = await Audio.getPermissionsAsync()
  if (existing.granted || !interactive) {
    return existing
  }
  return Audio.requestPermissionsAsync()
}

export async function getAudioState(): Promise<MobileAudioState> {
  const existing = await readAudioState()
  return existing ?? defaultAudioState()
}

export async function syncAudioState(options: { interactive?: boolean } = {}): Promise<MobileAudioState> {
  const interactive = Boolean(options.interactive)
  const existing = await getAudioState()
  if (!existing.supported) {
    return existing
  }
  const permission = await currentPermissionStatus(interactive)
  const next = withState(existing, {
    permission_status: mapPermissionStatus(permission.status),
    last_error: permission.granted
      ? ''
      : permission.canAskAgain
        ? '尚未授予麦克风权限'
        : '麦克风权限被拒绝',
  })
  return persist(next)
}

export async function recordAudio(options: {
  durationMs?: number
  interactivePermission?: boolean
} = {}): Promise<MobileAudioCapture> {
  const state = await syncAudioState({ interactive: Boolean(options.interactivePermission) })
  if (!state.supported) {
    throw new MobileFeatureError('METHOD_NOT_SUPPORTED', state.last_error || 'audio.record is not supported on this platform')
  }
  if (Platform.OS === 'ios' && !__DEV__) {
    // no-op branch kept for parity; real limitation is iOS simulator, not device
  }
  if (state.permission_status !== 'granted') {
    throw new MobileFeatureError('PERMISSION_DENIED', state.last_error || 'microphone permission is not granted')
  }
  ensureForeground()
  const durationMs = clampDurationMs(options.durationMs)

  const recording = new Audio.Recording()
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    })
    await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
    await recording.startAsync()
    await persist(
      withState(state, {
        is_recording: true,
        last_error: '',
      }),
    )
    await delay(durationMs)
    await recording.stopAndUnloadAsync()
    const status = await recording.getStatusAsync()
    const uri = recording.getURI()
    const capture: MobileAudioCapture = {
      local_uri: uri || '',
      duration_ms: typeof status.durationMillis === 'number' ? status.durationMillis : durationMs,
      mime_type: guessMimeType(uri),
      file_name: fileNameFromUri(uri),
      recorded_at: nowIso(),
    }
    await persist(
      withState(state, {
        is_recording: false,
        last_capture: capture,
        last_error: '',
      }),
    )
    return capture
  } catch (error) {
    await persist(
      withState(state, {
        is_recording: false,
        last_error: error instanceof Error ? error.message : '录音失败',
      }),
    )
    throw error instanceof MobileFeatureError
      ? error
      : new MobileFeatureError('UPSTREAM_ERROR', error instanceof Error ? error.message : 'recording failed')
  } finally {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      })
    } catch {
      // best-effort reset
    }
  }
}

export async function clearAudioFeatureState(): Promise<void> {
  await clearAudioState()
}
