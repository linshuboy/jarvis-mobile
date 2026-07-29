import { getAudioState, recordAudio, syncAudioState } from './audioFeature'
import { declaredRuntimeMethods, mobileCapabilities, platformLabel } from './capabilities'
import { capturePhoto, getCameraState, syncCameraState } from './cameraFeature'
import { getLocationState, MobileFeatureError, readCurrentLocation, syncLocationState } from './locationFeature'
import {
  createSessionScope,
  LatestScopedRequestGate,
  sessionMatchesScope,
  type SessionScope,
} from './requestScope'
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
  serverUrl: string
  gatewayWsUrl: string
  runtimeToken: string
  runtime: MobileRuntimeDescriptor
  sessionScope: SessionScope
}

let ws: WebSocket | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let handshakeTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelayMs = 1000
let desiredConnection: DesiredConnection | null = null
let manuallyStopped = false

const syncRequestGate = new LatestScopedRequestGate()

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

function desiredConnectionKey(connection: DesiredConnection): string {
  return JSON.stringify([
    connection.serverUrl,
    connection.gatewayWsUrl,
    connection.runtimeToken,
    connection.runtime.runtime_id,
    connection.sessionScope.userId,
    connection.sessionScope.accessToken,
    connection.sessionScope.refreshToken,
  ])
}

function isActiveConnection(socket: WebSocket, connection: DesiredConnection): boolean {
  return (
    socket === ws &&
    desiredConnection !== null &&
    desiredConnectionKey(desiredConnection) === desiredConnectionKey(connection)
  )
}

async function requestSessionIsActive(socket: WebSocket, connection: DesiredConnection): Promise<boolean> {
  if (!isActiveConnection(socket, connection)) {
    return false
  }
  const session = await readSession()
  return isActiveConnection(socket, connection) && sessionMatchesScope(session, connection.sessionScope)
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

function sendJson(payload: unknown, expectedSocket?: WebSocket): void {
  const socket = expectedSocket ?? ws
  if (!socket || socket !== ws || socket.readyState !== WebSocket.OPEN) {
    throw new Error('gateway websocket is not open')
  }
  socket.send(JSON.stringify(payload))
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
  const [runtime, session, location, camera, audio] = await Promise.all([
    buildRuntimeDescriptor(),
    readSession(),
    getLocationState(),
    getCameraState(),
    getAudioState(),
  ])
  const binding = session?.server_url ? await readBindingState(session.server_url, runtime.runtime_id) : null
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

async function markPairingRequired(
  nextError: string,
  socket: WebSocket,
  connection: DesiredConnection,
): Promise<boolean> {
  if (!(await requestSessionIsActive(socket, connection))) {
    return false
  }
  const binding = await readBindingState(connection.serverUrl, connection.runtime.runtime_id)
  if (!(await requestSessionIsActive(socket, connection))) {
    return false
  }
  if (binding) {
    const next: MobileBindingState = {
      ...binding,
      pairing_state: 'pending',
    }
    await writeBindingState(next)
    if (!(await requestSessionIsActive(socket, connection))) {
      return false
    }
  }
  updateConnectionState({
    online: false,
    connection_state: 'waiting_for_pairing',
    last_error: nextError,
  })
  return true
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
}

async function handleRequest(
  frame: Record<string, unknown>,
  socket: WebSocket,
  connection: DesiredConnection,
): Promise<void> {
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
    }, socket)
    return
  }
  if (method === 'mobile.status.snapshot') {
    if (!(await requestSessionIsActive(socket, connection))) {
      return
    }
    const payload = await buildStatusPayload()
    if (!(await requestSessionIsActive(socket, connection))) {
      return
    }
    sendJson({
      type: 'res',
      id: requestId,
      ok: true,
      payload,
    }, socket)
    return
  }
  if (method === 'location.get') {
    try {
      const accuracy = params.accuracy === 'high' ? 'high' : 'balanced'
      if (!(await requestSessionIsActive(socket, connection))) {
        return
      }
      const fix = await readCurrentLocation({ interactive: false, accuracy })
      const locationState = await getLocationState()
      if (!(await requestSessionIsActive(socket, connection))) {
        return
      }
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
      }, socket)
    } catch (error) {
      if (error instanceof MobileFeatureError) {
        if (!(await requestSessionIsActive(socket, connection))) {
          return
        }
        sendJson({
          type: 'res',
          id: requestId,
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        }, socket)
        return
      }
      throw error
    }
    return
  }
  if (method === 'camera.capture') {
    try {
      if (!(await requestSessionIsActive(socket, connection))) {
        return
      }
      const capture = await capturePhoto({ interactivePermission: false })
      const cameraState = await getCameraState()
      if (!(await requestSessionIsActive(socket, connection))) {
        return
      }
      sendJson({
        type: 'res',
        id: requestId,
        ok: true,
        payload: {
          ...capture,
          permission_status: cameraState.permission_status,
          source: 'expo-image-picker',
        },
      }, socket)
    } catch (error) {
      if (error instanceof MobileFeatureError) {
        if (!(await requestSessionIsActive(socket, connection))) {
          return
        }
        sendJson({
          type: 'res',
          id: requestId,
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        }, socket)
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
      if (!(await requestSessionIsActive(socket, connection))) {
        return
      }
      const capture = await recordAudio({
        durationMs,
        interactivePermission: false,
      })
      const audioState = await getAudioState()
      if (!(await requestSessionIsActive(socket, connection))) {
        return
      }
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
      }, socket)
    } catch (error) {
      if (error instanceof MobileFeatureError) {
        if (!(await requestSessionIsActive(socket, connection))) {
          return
        }
        sendJson({
          type: 'res',
          id: requestId,
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        }, socket)
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
  }, socket)
}

function scheduleHeartbeat(socket: WebSocket, connection: DesiredConnection): void {
  clearHeartbeatTimer()
  heartbeatTimer = setInterval(() => {
    if (!isActiveConnection(socket, connection)) {
      return
    }
    const now = new Date().toISOString()
    try {
      sendJson({
        type: 'event',
        event: 'node.heartbeat',
        payload: {
          runtimeId: connection.runtime.runtime_id,
          ttlSeconds: RUNTIME_TTL_SECONDS,
          runtime: {
            displayName: connection.runtime.display_name,
            metadata: connection.runtime.metadata,
          },
          components: connection.runtime.components.map((item) => ({
            componentId: item.component_id,
            health: {
              status: item.health.status,
              checkedAt: now,
            },
            metadata: item.metadata,
          })),
        },
      }, socket)
    } catch (error) {
      if (!isActiveConnection(socket, connection)) {
        return
      }
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
  const connection = desiredConnection
  const requestId = randomId()
  updateConnectionState({
    gateway_ws_url: connection.gatewayWsUrl,
    online: false,
    connection_state: 'connecting',
  })

  const socket = new WebSocket(connection.gatewayWsUrl)
  ws = socket

  socket.onopen = () => {
    if (!isActiveConnection(socket, connection)) {
      return
    }
    const now = new Date().toISOString()
    try {
      sendJson({
        type: 'req',
        id: requestId,
        method: 'connect',
        params: {
          minProtocol: 1,
          maxProtocol: 1,
          client: {
            id: connection.runtime.runtime_id,
            version: connection.runtime.runtime_version,
            platform: connection.runtime.platform,
            mode: 'runtime_components',
          },
          role: 'node',
          auth: {
            token: connection.runtimeToken,
          },
          ttlSeconds: RUNTIME_TTL_SECONDS,
          runtime: {
            id: connection.runtime.runtime_id,
            displayName: connection.runtime.display_name,
            hostname: connection.runtime.hostname,
            platform: connection.runtime.platform,
            version: connection.runtime.runtime_version,
            metadata: connection.runtime.metadata,
            ttlSeconds: RUNTIME_TTL_SECONDS,
          },
          components: connection.runtime.components.map((item) => ({
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
      }, socket)
      handshakeTimer = setTimeout(() => {
        if (!isActiveConnection(socket, connection)) {
          return
        }
        updateConnectionState({
          online: false,
          connection_state: 'connect_timeout',
          last_error: 'gateway connect handshake timeout',
        })
        closeSocket()
        scheduleReconnect()
      }, HANDSHAKE_TIMEOUT_MS)
    } catch (error) {
      if (!isActiveConnection(socket, connection)) {
        return
      }
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
      if (!isActiveConnection(socket, connection)) {
        return
      }
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

      if (frame.type === 'res' && String(frame.id || '') === requestId) {
        clearHandshakeTimer()
        if (frame.ok === true) {
          reconnectDelayMs = 1000
          updateConnectionState({
            online: true,
            connection_state: 'connected',
            last_connected_at: new Date().toISOString(),
            last_error: '',
          })
          scheduleHeartbeat(socket, connection)
          return
        }
        const errorPayload =
          typeof frame.error === 'object' && frame.error !== null ? (frame.error as Record<string, unknown>) : {}
        const errorCode = String(errorPayload.code || '')
        const errorMessage = String(errorPayload.message || 'gateway connect rejected')
        if (errorCode === 'PAIRING_REQUIRED') {
          const marked = await markPairingRequired(errorMessage, socket, connection)
          if (!marked || !isActiveConnection(socket, connection)) {
            return
          }
          manuallyStopped = true
          desiredConnection = null
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
          await handleRequest(frame, socket, connection)
        } catch (error) {
          if (!isActiveConnection(socket, connection)) {
            return
          }
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
    if (!isActiveConnection(socket, connection)) {
      return
    }
    updateConnectionState({
      online: false,
      connection_state: 'error',
      last_error: 'gateway websocket error',
    })
  }

  socket.onclose = () => {
    if (!isActiveConnection(socket, connection)) {
      return
    }
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
  const ticket = syncRequestGate.begin()
  const [session, runtime] = await Promise.all([readSession(), buildRuntimeDescriptor()])
  if (!syncRequestGate.isCurrent(ticket)) {
    return connectionState
  }
  const binding = session?.server_url ? await readBindingState(session.server_url, runtime.runtime_id) : null
  if (!syncRequestGate.isCurrent(ticket)) {
    return connectionState
  }
  await Promise.all([
    syncLocationState({ interactive: false, refreshFix: false }),
    syncCameraState({ interactive: false }),
    syncAudioState({ interactive: false }),
  ])
  if (!syncRequestGate.isCurrent(ticket)) {
    return connectionState
  }
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
    serverUrl: session.server_url,
    gatewayWsUrl: gatewayWsUrl(session.server_url),
    runtimeToken: binding.runtime_token,
    runtime,
    sessionScope: createSessionScope(session),
  }
  const currentKey = desiredConnection ? desiredConnectionKey(desiredConnection) : ''
  const nextKey = desiredConnectionKey(nextDesired)
  if (!syncRequestGate.isCurrent(ticket)) {
    return connectionState
  }
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
  syncRequestGate.invalidate()
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
  const [session, runtime] = await Promise.all([readSession(), buildRuntimeDescriptor()])
  if (session?.server_url) {
    await clearBindingState(session.server_url, runtime.runtime_id)
  }
  await disconnectMobileGatewayConnection()
}
