import { getAudioState, recordAudio, syncAudioState } from './audioFeature'
import { declaredRuntimeMethods, mobileCapabilities, platformLabel } from './capabilities'
import { capturePhoto, getCameraState, syncCameraState } from './cameraFeature'
import { getLocationState, MobileFeatureError, readCurrentLocation, syncLocationState } from './locationFeature'
import { clearBindingState, ensureRuntimeIdentity, readBindingState, readSession, writeBindingState } from '../storage/session'
import type {
  MobileBindingState,
  MobileGatewayConnectionState,
  MobileRuntimeDescriptor,
} from '../types'
import { Platform } from 'react-native'

const HEARTBEAT_SECONDS = 20
const RUNTIME_TTL_SECONDS = 60
const HANDSHAKE_TIMEOUT_MS = 5000
const MAX_RECONNECT_DELAY_MS = 30000

type Listener = (state: MobileGatewayConnectionState) => void

type DesiredConnection = {
  gatewayWsUrl: string
  runtimeToken: string
  runtime: MobileRuntimeDescriptor
}

let ws: WebSocket | null = null
let connectRequestId: string | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let handshakeTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelayMs = 1000
let desiredConnection: DesiredConnection | null = null
let manuallyStopped = false

const listeners = new Set<Listener>()

let connectionState: MobileGatewayConnectionState = {
  gateway_ws_url: '',
  online: false,
  connection_state: 'offline',
  last_connected_at: '',
  last_error: '',
  heartbeat_seconds: HEARTBEAT_SECONDS,
}

function randomId(): string {
  const maybeCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined
  if (maybeCrypto?.randomUUID) {
    return maybeCrypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function updateConnectionState(patch: Partial<MobileGatewayConnectionState>): void {
  connectionState = {
    ...connectionState,
    ...patch,
  }
  for (const listener of listeners) {
    listener(connectionState)
  }
}

function clearHeartbeatTimer(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function clearHandshakeTimer(): void {
  if (handshakeTimer) {
    clearTimeout(handshakeTimer)
    handshakeTimer = null
  }
}

function scheduleReconnect(): void {
  if (manuallyStopped || !desiredConnection || reconnectTimer) {
    return
  }
  const currentDelay = reconnectDelayMs
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void openConnection()
  }, currentDelay)
}

function sendJson(payload: unknown): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error('gateway websocket is not open')
  }
  ws.send(JSON.stringify(payload))
}

function gatewayWsUrl(serverUrl: string): string {
  const parsed = new URL(serverUrl)
  const next = new URL('ws/node', parsed.toString())
  next.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
  return next.toString()
}

async function buildRuntimeDescriptor(): Promise<MobileRuntimeDescriptor> {
  const identity = await ensureRuntimeIdentity()
  const methods = declaredRuntimeMethods()
  const now = new Date().toISOString()
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'mobile'
  return {
    runtime_id: identity.runtime_id,
    display_name: `${platformLabel()} ${identity.runtime_id.slice(0, 8)}`,
    hostname: `${platform}-companion-${identity.runtime_id.slice(0, 8)}`,
    platform,
    platform_label: platformLabel(),
    runtime_version: '0.1.0',
    metadata: {
      platform_version: String(Platform.Version ?? ''),
      app_family: 'mobile-companion',
    },
    components: [
      {
        component_id: 'mobile.main',
        kind: 'mobile',
        methods,
        health: {
          status: 'healthy',
          checked_at: now,
        },
        metadata: {
          capabilities: mobileCapabilities().map((item) => ({
            method: item.method,
            status: item.status,
            platform: item.platform,
          })),
        },
      },
    ],
  }
}

async function buildStatusPayload(): Promise<Record<string, unknown>> {
  const [runtime, binding, location, camera, audio] = await Promise.all([
    buildRuntimeDescriptor(),
    readBindingState(),
    getLocationState(),
    getCameraState(),
    getAudioState(),
  ])
  return {
    runtime_id: runtime.runtime_id,
    pairing_state: binding?.pairing_state || 'unpaired',
    owner_user_id: binding?.owner_user_id || null,
    capabilities: mobileCapabilities().map((item) => ({
      method: item.method,
      status: item.status,
      platform: item.platform,
    })),
    connection: connectionState,
    location,
    camera,
    audio,
  }
}

async function markPairingRequired(nextError: string): Promise<void> {
  const binding = await readBindingState()
  desiredConnection = null
  if (!binding) {
    return
  }
  const next: MobileBindingState = {
    ...binding,
    runtime_token: '',
    pairing_state: 'pending',
  }
  await writeBindingState(next)
  updateConnectionState({
    online: false,
    connection_state: 'waiting_for_pairing',
    last_error: nextError,
  })
}

function closeSocket(): void {
  clearHandshakeTimer()
  clearHeartbeatTimer()
  if (ws) {
    try {
      ws.close()
    } catch {
      // ignore close failure
    }
  }
  ws = null
  connectRequestId = null
}

async function handleRequest(frame: Record<string, unknown>): Promise<void> {
  const requestId = String(frame.id || '').trim() || 'req'
  const method = String(frame.method || '').trim()
  const params =
    typeof frame.params === 'object' && frame.params !== null ? (frame.params as Record<string, unknown>) : {}
  if (!method) {
    sendJson({
      type: 'res',
      id: requestId,
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'method is required',
      },
    })
    return
  }
  if (method === 'mobile.status.snapshot') {
    sendJson({
      type: 'res',
      id: requestId,
      ok: true,
      payload: await buildStatusPayload(),
    })
    return
  }
  if (method === 'location.get') {
    try {
      const accuracy = params.accuracy === 'high' ? 'high' : 'balanced'
      const fix = await readCurrentLocation({ interactive: false, accuracy })
      const locationState = await getLocationState()
      sendJson({
        type: 'res',
        id: requestId,
        ok: true,
        payload: {
          ...fix,
          permission_status: locationState.permission_status,
          services_enabled: locationState.services_enabled,
          source: 'expo-location',
        },
      })
    } catch (error) {
      if (error instanceof MobileFeatureError) {
        sendJson({
          type: 'res',
          id: requestId,
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        })
        return
      }
      throw error
    }
    return
  }
  if (method === 'camera.capture') {
    try {
      const capture = await capturePhoto({ interactivePermission: false })
      const cameraState = await getCameraState()
      sendJson({
        type: 'res',
        id: requestId,
        ok: true,
        payload: {
          ...capture,
          permission_status: cameraState.permission_status,
          source: 'expo-image-picker',
        },
      })
    } catch (error) {
      if (error instanceof MobileFeatureError) {
        sendJson({
          type: 'res',
          id: requestId,
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        })
        return
      }
      throw error
    }
    return
  }
  if (method === 'audio.record') {
    try {
      const durationMs =
        typeof params.duration_ms === 'number'
          ? params.duration_ms
          : typeof params.durationMs === 'number'
            ? params.durationMs
            : undefined
      const capture = await recordAudio({
        durationMs,
        interactivePermission: false,
      })
      const audioState = await getAudioState()
      sendJson({
        type: 'res',
        id: requestId,
        ok: true,
        payload: {
          ...capture,
          permission_status: audioState.permission_status,
          foreground_required: audioState.foreground_required,
          source: 'expo-audio',
        },
      })
    } catch (error) {
      if (error instanceof MobileFeatureError) {
        sendJson({
          type: 'res',
          id: requestId,
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        })
        return
      }
      throw error
    }
    return
  }
  sendJson({
    type: 'res',
    id: requestId,
    ok: false,
    error: {
      code: 'METHOD_NOT_SUPPORTED',
      message: `${method} is not supported by mobile companion`,
    },
  })
}

function scheduleHeartbeat(): void {
  clearHeartbeatTimer()
  heartbeatTimer = setInterval(() => {
    if (!desiredConnection) {
      return
    }
    const now = new Date().toISOString()
    try {
      sendJson({
        type: 'event',
        event: 'node.heartbeat',
        payload: {
          runtimeId: desiredConnection.runtime.runtime_id,
          ttlSeconds: RUNTIME_TTL_SECONDS,
          runtime: {
            displayName: desiredConnection.runtime.display_name,
            metadata: desiredConnection.runtime.metadata,
          },
          components: desiredConnection.runtime.components.map((item) => ({
            componentId: item.component_id,
            health: {
              status: item.health.status,
              checkedAt: now,
            },
            metadata: item.metadata,
          })),
        },
      })
    } catch (error) {
      updateConnectionState({
        online: false,
        connection_state: 'reconnecting',
        last_error: error instanceof Error ? error.message : 'failed to send heartbeat',
      })
      closeSocket()
      scheduleReconnect()
    }
  }, HEARTBEAT_SECONDS * 1000)
}

async function openConnection(): Promise<void> {
  if (!desiredConnection) {
    return
  }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return
  }
  clearReconnectTimer()
  clearHandshakeTimer()
  manuallyStopped = false
  connectRequestId = randomId()
  updateConnectionState({
    gateway_ws_url: desiredConnection.gatewayWsUrl,
    online: false,
    connection_state: 'connecting',
  })

  const socket = new WebSocket(desiredConnection.gatewayWsUrl)
  ws = socket

  socket.onopen = () => {
    if (!desiredConnection || socket !== ws) {
      return
    }
    const now = new Date().toISOString()
    try {
      sendJson({
        type: 'req',
        id: connectRequestId,
        method: 'connect',
        params: {
          minProtocol: 1,
          maxProtocol: 1,
          client: {
            id: desiredConnection.runtime.runtime_id,
            version: desiredConnection.runtime.runtime_version,
            platform: desiredConnection.runtime.platform,
            mode: 'runtime_components',
          },
          role: 'node',
          auth: {
            token: desiredConnection.runtimeToken,
          },
          ttlSeconds: RUNTIME_TTL_SECONDS,
          runtime: {
            id: desiredConnection.runtime.runtime_id,
            displayName: desiredConnection.runtime.display_name,
            hostname: desiredConnection.runtime.hostname,
            platform: desiredConnection.runtime.platform,
            version: desiredConnection.runtime.runtime_version,
            metadata: desiredConnection.runtime.metadata,
            ttlSeconds: RUNTIME_TTL_SECONDS,
          },
          components: desiredConnection.runtime.components.map((item) => ({
            componentId: item.component_id,
            kind: item.kind,
            methods: item.methods,
            health: {
              status: item.health.status,
              checkedAt: now,
            },
            metadata: item.metadata,
          })),
        },
      })
      handshakeTimer = setTimeout(() => {
        updateConnectionState({
          online: false,
          connection_state: 'connect_timeout',
          last_error: 'gateway connect handshake timeout',
        })
        closeSocket()
        scheduleReconnect()
      }, HANDSHAKE_TIMEOUT_MS)
    } catch (error) {
      updateConnectionState({
        online: false,
        connection_state: 'connect_failed',
        last_error: error instanceof Error ? error.message : 'failed to send connect frame',
      })
      closeSocket()
      scheduleReconnect()
    }
  }

  socket.onmessage = (event) => {
    void (async () => {
      let frame: Record<string, unknown>
      try {
        frame = JSON.parse(String(event.data || '{}')) as Record<string, unknown>
      } catch {
        updateConnectionState({
          online: false,
          connection_state: 'protocol_error',
          last_error: 'invalid gateway websocket frame',
        })
        closeSocket()
        scheduleReconnect()
        return
      }

      if (frame.type === 'res' && String(frame.id || '') === connectRequestId) {
        clearHandshakeTimer()
        if (frame.ok === true) {
          reconnectDelayMs = 1000
          updateConnectionState({
            online: true,
            connection_state: 'connected',
            last_connected_at: new Date().toISOString(),
            last_error: '',
          })
          scheduleHeartbeat()
          return
        }
        const errorPayload =
          typeof frame.error === 'object' && frame.error !== null ? (frame.error as Record<string, unknown>) : {}
        const errorCode = String(errorPayload.code || '')
        const errorMessage = String(errorPayload.message || 'gateway connect rejected')
        if (errorCode === 'PAIRING_REQUIRED') {
          await markPairingRequired(errorMessage)
          manuallyStopped = true
          clearReconnectTimer()
        } else {
          updateConnectionState({
            online: false,
            connection_state: 'rejected',
            last_error: errorMessage,
          })
          scheduleReconnect()
        }
        closeSocket()
        return
      }

      if (frame.type === 'req') {
        try {
          await handleRequest(frame)
        } catch (error) {
          updateConnectionState({
            online: false,
            connection_state: 'handler_error',
            last_error: error instanceof Error ? error.message : 'request handler failed',
          })
        }
      }
    })()
  }

  socket.onerror = () => {
    updateConnectionState({
      online: false,
      connection_state: 'error',
      last_error: 'gateway websocket error',
    })
  }

  socket.onclose = () => {
    clearHandshakeTimer()
    clearHeartbeatTimer()
    const nextState =
      manuallyStopped && connectionState.connection_state === 'waiting_for_pairing'
        ? 'waiting_for_pairing'
        : manuallyStopped
          ? 'offline'
          : 'reconnecting'
    updateConnectionState({
      online: false,
      connection_state: nextState,
    })
    ws = null
    if (!manuallyStopped) {
      scheduleReconnect()
    }
  }
}

export function getGatewayConnectionState(): MobileGatewayConnectionState {
  return connectionState
}

export function subscribeGatewayConnection(listener: Listener): () => void {
  listeners.add(listener)
  listener(connectionState)
  return () => {
    listeners.delete(listener)
  }
}

export async function syncMobileGatewayConnection(): Promise<MobileGatewayConnectionState> {
  const [session, binding, runtime] = await Promise.all([readSession(), readBindingState(), buildRuntimeDescriptor()])
  await syncLocationState({ interactive: false, refreshFix: false })
  await syncCameraState({ interactive: false })
  await syncAudioState({ interactive: false })
  const hasAuth = Boolean(session?.server_url && session.access_token && session.refresh_token)
  const hasBinding = Boolean(binding?.runtime_token)
  if (!hasAuth || !hasBinding || !session || !binding) {
    manuallyStopped = true
    desiredConnection = null
    clearReconnectTimer()
    closeSocket()
    updateConnectionState({
      gateway_ws_url: session?.server_url ? gatewayWsUrl(session.server_url) : '',
      online: false,
      connection_state: hasAuth ? 'waiting_for_pairing' : 'offline',
      last_error: hasAuth && !hasBinding ? 'runtime token is missing' : '',
    })
    return connectionState
  }

  const nextDesired: DesiredConnection = {
    gatewayWsUrl: gatewayWsUrl(session.server_url),
    runtimeToken: binding.runtime_token,
    runtime,
  }
  const currentKey = desiredConnection
    ? `${desiredConnection.gatewayWsUrl}|${desiredConnection.runtimeToken}|${desiredConnection.runtime.runtime_id}`
    : ''
  const nextKey = `${nextDesired.gatewayWsUrl}|${nextDesired.runtimeToken}|${nextDesired.runtime.runtime_id}`
  desiredConnection = nextDesired
  updateConnectionState({
    gateway_ws_url: nextDesired.gatewayWsUrl,
    heartbeat_seconds: HEARTBEAT_SECONDS,
  })
  if (currentKey !== nextKey) {
    manuallyStopped = false
    closeSocket()
  }
  await openConnection()
  return connectionState
}

export async function disconnectMobileGatewayConnection(): Promise<MobileGatewayConnectionState> {
  manuallyStopped = true
  desiredConnection = null
  clearReconnectTimer()
  closeSocket()
  updateConnectionState({
    online: false,
    connection_state: 'offline',
  })
  return connectionState
}

export async function revokeMobileBindingLocally(): Promise<void> {
  await clearBindingState()
  await disconnectMobileGatewayConnection()
}
