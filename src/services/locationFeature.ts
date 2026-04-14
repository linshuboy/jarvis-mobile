import * as ExpoLocation from 'expo-location'
import { Platform } from 'react-native'

import { clearLocationState, readLocationState, writeLocationState } from '../storage/session'
import type { MobileLocationFix, MobileLocationState } from '../types'

export class MobileFeatureError extends Error {
  code: string
  details?: Record<string, unknown>

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.code = code
    this.details = details
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function defaultLocationState(): MobileLocationState {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return {
      supported: false,
      permission_status: 'unavailable',
      services_enabled: null,
      last_fix: null,
      last_error: 'location.get is only supported on iOS and Android',
      updated_at: nowIso(),
    }
  }
  return {
    supported: true,
    permission_status: 'undetermined',
    services_enabled: null,
    last_fix: null,
    last_error: '',
    updated_at: nowIso(),
  }
}

function mapPermissionStatus(value: string | null | undefined): MobileLocationState['permission_status'] {
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

function normalizeFix(location: ExpoLocation.LocationObject): MobileLocationFix {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy_meters: typeof location.coords.accuracy === 'number' ? location.coords.accuracy : null,
    altitude_meters: typeof location.coords.altitude === 'number' ? location.coords.altitude : null,
    heading_degrees: typeof location.coords.heading === 'number' ? location.coords.heading : null,
    speed_mps: typeof location.coords.speed === 'number' ? location.coords.speed : null,
    captured_at: new Date(location.timestamp).toISOString(),
  }
}

async function persist(state: MobileLocationState): Promise<MobileLocationState> {
  await writeLocationState(state)
  return state
}

function withState(base: MobileLocationState, patch: Partial<MobileLocationState>): MobileLocationState {
  return {
    ...base,
    ...patch,
    updated_at: nowIso(),
  }
}

async function currentPermissionStatus(interactive: boolean): Promise<ExpoLocation.PermissionResponse> {
  const existing = await ExpoLocation.getForegroundPermissionsAsync()
  if (existing.granted || !interactive) {
    return existing
  }
  return ExpoLocation.requestForegroundPermissionsAsync()
}

async function servicesEnabled(): Promise<boolean | null> {
  try {
    return await ExpoLocation.hasServicesEnabledAsync()
  } catch {
    return null
  }
}

function desiredAccuracy(mode: 'balanced' | 'high' = 'balanced'): ExpoLocation.Accuracy {
  return mode === 'high' ? ExpoLocation.Accuracy.High : ExpoLocation.Accuracy.Balanced
}

export async function getLocationState(): Promise<MobileLocationState> {
  const existing = await readLocationState()
  return existing ?? defaultLocationState()
}

export async function syncLocationState(options: {
  interactive?: boolean
  refreshFix?: boolean
  accuracy?: 'balanced' | 'high'
} = {}): Promise<MobileLocationState> {
  const interactive = Boolean(options.interactive)
  const refreshFix = Boolean(options.refreshFix)
  const accuracy = options.accuracy ?? 'balanced'
  const existing = await getLocationState()
  if (!existing.supported) {
    return existing
  }

  const permission = await currentPermissionStatus(interactive)
  const nextPermission = mapPermissionStatus(permission.status)
  const enabled = await servicesEnabled()
  let next = withState(existing, {
    permission_status: nextPermission,
    services_enabled: enabled,
    last_error: '',
  })

  if (!permission.granted) {
    return persist(
      withState(next, {
        last_error:
          nextPermission === 'denied'
            ? '定位权限被拒绝'
            : '尚未授予定位权限',
      }),
    )
  }

  if (enabled === false) {
    return persist(
      withState(next, {
        last_error: '系统定位服务未开启',
      }),
    )
  }

  if (!refreshFix) {
    return persist(next)
  }

  try {
    const location = await ExpoLocation.getCurrentPositionAsync({
      accuracy: desiredAccuracy(accuracy),
    })
    next = withState(next, {
      last_fix: normalizeFix(location),
      last_error: '',
    })
    return persist(next)
  } catch (error) {
    return persist(
      withState(next, {
        last_error: error instanceof Error ? error.message : '获取定位失败',
      }),
    )
  }
}

export async function readCurrentLocation(options: {
  interactive?: boolean
  accuracy?: 'balanced' | 'high'
} = {}): Promise<MobileLocationFix> {
  const interactive = Boolean(options.interactive)
  const accuracy = options.accuracy ?? 'balanced'
  const state = await syncLocationState({ interactive, refreshFix: false, accuracy })

  if (!state.supported) {
    throw new MobileFeatureError('METHOD_NOT_SUPPORTED', state.last_error || 'location.get is not supported on this platform')
  }
  if (state.permission_status !== 'granted') {
    throw new MobileFeatureError('PERMISSION_DENIED', state.last_error || 'location permission is not granted')
  }
  if (state.services_enabled === false) {
    throw new MobileFeatureError('LOCATION_DISABLED', state.last_error || 'location services are disabled')
  }

  try {
    const location = await ExpoLocation.getCurrentPositionAsync({
      accuracy: desiredAccuracy(accuracy),
    })
    const nextState = withState(state, {
      last_fix: normalizeFix(location),
      last_error: '',
    })
    await persist(nextState)
    return nextState.last_fix as MobileLocationFix
  } catch (error) {
    const message = error instanceof Error ? error.message : 'failed to capture location'
    await persist(
      withState(state, {
        last_error: message,
      }),
    )
    throw new MobileFeatureError('UPSTREAM_ERROR', message)
  }
}

export async function clearLocationFeatureState(): Promise<void> {
  await clearLocationState()
}
