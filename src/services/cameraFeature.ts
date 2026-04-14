import * as ImagePicker from 'expo-image-picker'
import { AppState, Platform } from 'react-native'

import { clearCameraState, readCameraState, writeCameraState } from '../storage/session'
import type { MobileCameraCapture, MobileCameraState } from '../types'
import { MobileFeatureError } from './locationFeature'

function nowIso(): string {
  return new Date().toISOString()
}

function defaultCameraState(): MobileCameraState {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return {
      supported: false,
      permission_status: 'unavailable',
      foreground_required: true,
      last_capture: null,
      last_error: 'camera.capture is only supported on iOS and Android',
      updated_at: nowIso(),
    }
  }
  return {
    supported: true,
    permission_status: 'undetermined',
    foreground_required: true,
    last_capture: null,
    last_error: '',
    updated_at: nowIso(),
  }
}

function mapPermissionStatus(value: string | null | undefined): MobileCameraState['permission_status'] {
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

function withState(base: MobileCameraState, patch: Partial<MobileCameraState>): MobileCameraState {
  return {
    ...base,
    ...patch,
    updated_at: nowIso(),
  }
}

async function persist(state: MobileCameraState): Promise<MobileCameraState> {
  await writeCameraState(state)
  return state
}

async function currentPermissionStatus(interactive: boolean): Promise<ImagePicker.CameraPermissionResponse> {
  const existing = await ImagePicker.getCameraPermissionsAsync()
  if (existing.granted || !interactive) {
    return existing
  }
  return ImagePicker.requestCameraPermissionsAsync()
}

function normalizeCapture(asset: ImagePicker.ImagePickerAsset): MobileCameraCapture {
  return {
    local_uri: asset.uri,
    width: typeof asset.width === 'number' ? asset.width : null,
    height: typeof asset.height === 'number' ? asset.height : null,
    mime_type: asset.mimeType ?? null,
    file_size_bytes: typeof asset.fileSize === 'number' ? asset.fileSize : null,
    file_name: asset.fileName ?? null,
    captured_at: nowIso(),
  }
}

export async function getCameraState(): Promise<MobileCameraState> {
  const existing = await readCameraState()
  return existing ?? defaultCameraState()
}

export async function syncCameraState(options: { interactive?: boolean } = {}): Promise<MobileCameraState> {
  const interactive = Boolean(options.interactive)
  const existing = await getCameraState()
  if (!existing.supported) {
    return existing
  }
  const permission = await currentPermissionStatus(interactive)
  const next = withState(existing, {
    permission_status: mapPermissionStatus(permission.status),
    last_error: permission.granted
      ? ''
      : permission.canAskAgain
        ? '尚未授予相机权限'
        : '相机权限被拒绝',
  })
  return persist(next)
}

function ensureForeground(): void {
  if (AppState.currentState !== 'active') {
    throw new MobileFeatureError('FOREGROUND_REQUIRED', 'camera.capture requires the app to stay in foreground')
  }
}

export async function capturePhoto(options: { interactivePermission?: boolean } = {}): Promise<MobileCameraCapture> {
  const state = await syncCameraState({ interactive: Boolean(options.interactivePermission) })
  if (!state.supported) {
    throw new MobileFeatureError('METHOD_NOT_SUPPORTED', state.last_error || 'camera.capture is not supported on this platform')
  }
  if (state.permission_status !== 'granted') {
    throw new MobileFeatureError('PERMISSION_DENIED', state.last_error || 'camera permission is not granted')
  }
  ensureForeground()

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 0.9,
  })
  if (result.canceled) {
    const next = withState(state, {
      last_error: '用户取消了拍照',
    })
    await persist(next)
    throw new MobileFeatureError('CANCELLED', next.last_error)
  }
  const asset = result.assets?.[0]
  if (!asset) {
    const next = withState(state, {
      last_error: 'camera capture did not return an image asset',
    })
    await persist(next)
    throw new MobileFeatureError('UPSTREAM_ERROR', next.last_error)
  }
  const capture = normalizeCapture(asset)
  const next = withState(state, {
    last_capture: capture,
    last_error: '',
  })
  await persist(next)
  return capture
}

export async function clearCameraFeatureState(): Promise<void> {
  await clearCameraState()
}
