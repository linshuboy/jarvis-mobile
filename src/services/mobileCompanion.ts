import { getAudioState, syncAudioState } from './audioFeature'
import { Platform } from 'react-native'

import { declaredRuntimeMethods, mobileCapabilities, platformLabel } from './capabilities'
import { getCameraState, syncCameraState } from './cameraFeature'
import {
  disconnectMobileGatewayConnection,
  getGatewayConnectionState,
  syncMobileGatewayConnection,
} from './gatewaySocket'
import { getLocationState, syncLocationState } from './locationFeature'
import { LatestScopedRequestGate, type ScopedRequestTicket } from './requestScope'
import {
  clearSessionIfCurrent,
  ensureRuntimeIdentity,
  readBindingState,
  readSession,
  replaceSession,
  rotateRuntimeIdentity,
  writeBindingState,
  writeSession,
} from '../storage/session'
import type {
  AuthBootstrapStatus,
  AuthResponse,
  AuthSession,
  BindingClaimResponse,
  BindingInviteResponse,
  MobileAuthUser,
  MobileBindingState,
  MobileCompanionSnapshot,
  MobileCompanionState,
  MobileRuntimeDescriptor,
} from '../types'

type ApiErrorCode = 'unauthorized' | 'transport' | 'server'

class ApiError extends Error {
  code: ApiErrorCode

  constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

class SupersededAuthOperationError extends Error {
  constructor() {
    super('authentication operation was superseded')
  }
}

const authRequestGate = new LatestScopedRequestGate()

function assertAuthOperationCurrent(ticket: ScopedRequestTicket): void {
  if (!authRequestGate.isCurrent(ticket)) {
    throw new SupersededAuthOperationError()
  }
}

async function writeSessionForOperation(session: AuthSession, ticket: ScopedRequestTicket): Promise<void> {
  assertAuthOperationCurrent(ticket)
  await writeSession(session)
  assertAuthOperationCurrent(ticket)
}

async function replaceSessionForOperation(
  expected: AuthSession,
  session: AuthSession,
  ticket: ScopedRequestTicket,
): Promise<void> {
  assertAuthOperationCurrent(ticket)
  const replaced = await replaceSession(expected, session)
  if (!replaced) {
    throw new SupersededAuthOperationError()
  }
  assertAuthOperationCurrent(ticket)
}

async function currentAuthState(
  bootstrapInitDone: boolean | null,
  authError: string | null,
): Promise<MobileCompanionState> {
  return authState(await readSession(), bootstrapInitDone, authError)
}

function normalizeServerUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('server_url is required')
  }
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch (error) {
    throw new Error(`invalid server_url ${trimmed}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!parsed.hostname) {
    throw new Error('server_url host is required')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`server_url scheme must be http or https, got ${parsed.protocol.replace(':', '')}`)
  }
  if (parsed.username || parsed.password) {
    throw new Error('server_url must not include credentials')
  }
  if (!parsed.pathname.endsWith('/')) {
    parsed.pathname = `${parsed.pathname}/`
  }
  parsed.hash = ''
  parsed.search = ''
  return parsed.toString()
}

function apiUrl(serverUrl: string, path: string): string {
  const normalizedPath = path.replace(/^\/+/, '')
  return new URL(normalizedPath, normalizeServerUrl(serverUrl)).toString()
}

async function requestJson(
  serverUrl: string,
  path: string,
  options: {
    method?: 'GET' | 'POST'
    accessToken?: string | null
    body?: unknown
  } = {},
): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (options.accessToken && options.accessToken.trim()) {
    headers.Authorization = `Bearer ${options.accessToken.trim()}`
  }
  let response: Response
  try {
    response = await fetch(apiUrl(serverUrl, path), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch (error) {
    throw new ApiError('transport', error instanceof Error ? error.message : 'network request failed')
  }

  const text = await response.text()
  let payload: unknown = null
  if (text.trim()) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }
  if (response.ok) {
    return payload
  }
  const detail =
    typeof payload === 'object' && payload !== null && 'detail' in payload
      ? String((payload as { detail?: unknown }).detail || '')
      : ''
  const message = detail || `${response.status} ${response.statusText}`.trim()
  if (response.status === 401) {
    throw new ApiError('unauthorized', message || 'unauthorized')
  }
  throw new ApiError('server', message || 'request failed')
}

function authState(session: AuthSession | null, bootstrapInitDone: boolean | null, authError: string | null): MobileCompanionState {
  return {
    server_url: session?.server_url || '',
    authenticated: Boolean(session?.access_token && session?.refresh_token && session?.user),
    user: session?.user || null,
    bootstrap_init_done: bootstrapInitDone,
    auth_error: authError,
  }
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} response is invalid`)
  }
  return value as Record<string, unknown>
}

function decodeBootstrap(value: unknown): AuthBootstrapStatus {
  const payload = assertObject(value, 'bootstrap status')
  return {
    init_done: Boolean(payload.init_done),
  }
}

function decodeAuthResponse(value: unknown): AuthResponse {
  const payload = assertObject(value, 'auth')
  const userPayload = assertObject(payload.user, 'auth user')
  return {
    access_token: String(payload.access_token || ''),
    refresh_token: String(payload.refresh_token || ''),
    token_type: payload.token_type ? String(payload.token_type) : undefined,
    access_expires_in: typeof payload.access_expires_in === 'number' ? payload.access_expires_in : undefined,
    refresh_expires_in: typeof payload.refresh_expires_in === 'number' ? payload.refresh_expires_in : undefined,
    user: {
      user_id: String(userPayload.user_id || ''),
      username: String(userPayload.username || ''),
      display_name: userPayload.display_name ? String(userPayload.display_name) : null,
      role: userPayload.role ? String(userPayload.role) : null,
    },
  }
}

function decodeUser(value: unknown): MobileAuthUser {
  const payload = assertObject(value, 'me user')
  return {
    user_id: String(payload.user_id || ''),
    username: String(payload.username || ''),
    display_name: payload.display_name ? String(payload.display_name) : null,
    role: payload.role ? String(payload.role) : null,
  }
}

function decodeInvite(value: unknown): BindingInviteResponse {
  const payload = assertObject(value, 'binding invite')
  return {
    invite_id: payload.invite_id ? String(payload.invite_id) : undefined,
    invite_code: payload.invite_code ? String(payload.invite_code) : undefined,
    invite_url: payload.invite_url ? String(payload.invite_url) : undefined,
    expires_at: payload.expires_at ? String(payload.expires_at) : undefined,
    created_at: payload.created_at ? String(payload.created_at) : undefined,
  }
}

function decodeClaim(value: unknown): BindingClaimResponse {
  const payload = assertObject(value, 'binding claim')
  return {
    runtime_id: String(payload.runtime_id || ''),
    pairing_state: String(payload.pairing_state || ''),
    request_state: payload.request_state ? String(payload.request_state) : null,
    pairing_request_id: payload.pairing_request_id ? String(payload.pairing_request_id) : null,
    runtime_token: String(payload.runtime_token || ''),
    owner_user_id: payload.owner_user_id ? String(payload.owner_user_id) : null,
  }
}

function buildRuntime(): Promise<MobileRuntimeDescriptor> {
  return ensureRuntimeIdentity().then((identity) => {
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
  })
}

async function createInvite(session: AuthSession): Promise<BindingInviteResponse> {
  return decodeInvite(
    await requestJson(session.server_url, 'api/host/runtime/invites', {
      method: 'POST',
      accessToken: session.access_token,
      body: { expires_in_seconds: 900 },
    }),
  )
}

function extractInviteCode(invite: BindingInviteResponse): string {
  if (invite.invite_code && invite.invite_code.trim()) {
    return invite.invite_code.trim()
  }
  if (invite.invite_url && invite.invite_url.trim()) {
    const url = new URL(invite.invite_url)
    const code = url.searchParams.get('code') || ''
    if (code.trim()) {
      return code.trim()
    }
  }
  throw new Error('binding invite response did not include invite_code')
}

async function claimInvite(session: AuthSession, ticket: ScopedRequestTicket): Promise<MobileBindingState> {
  let runtime = await buildRuntime()
  assertAuthOperationCurrent(ticket)
  let currentBinding = await readBindingState(session.server_url, runtime.runtime_id)
  assertAuthOperationCurrent(ticket)
  const invite = await createInvite(session)
  assertAuthOperationCurrent(ticket)
  const inviteCode = extractInviteCode(invite)
  const submitClaim = (): Promise<unknown> =>
    requestJson(session.server_url, 'api/host/runtime/invites/claim', {
      method: 'POST',
      body: {
        invite_code: inviteCode,
        current_runtime_token: currentBinding?.runtime_token || undefined,
        runtime: {
          runtime_id: runtime.runtime_id,
          display_name: runtime.display_name,
          hostname: runtime.hostname,
          platform: runtime.platform,
          runtime_version: runtime.runtime_version,
          metadata: runtime.metadata,
        },
        components: runtime.components,
      },
    })
  let claimPayload: unknown
  try {
    claimPayload = await submitClaim()
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'unauthorized') {
      throw error
    }
    assertAuthOperationCurrent(ticket)
    await rotateRuntimeIdentity()
    assertAuthOperationCurrent(ticket)
    runtime = await buildRuntime()
    currentBinding = null
    claimPayload = await submitClaim()
  }
  assertAuthOperationCurrent(ticket)
  const claim = decodeClaim(claimPayload)
  if (claim.runtime_id !== runtime.runtime_id) {
    throw new Error('binding claim runtime_id does not match this device')
  }
  if (!claim.runtime_token.trim()) {
    throw new Error('binding claim did not include runtime_token')
  }
  const binding: MobileBindingState = {
    server_url: session.server_url,
    runtime_id: claim.runtime_id,
    runtime_token: claim.runtime_token,
    pairing_state: claim.pairing_state,
    request_state: claim.request_state ?? null,
    pairing_request_id: claim.pairing_request_id ?? null,
    owner_user_id: claim.owner_user_id ?? null,
    bound_at: new Date().toISOString(),
  }
  assertAuthOperationCurrent(ticket)
  await writeBindingState(binding)
  assertAuthOperationCurrent(ticket)
  return binding
}

async function refreshSession(session: AuthSession, ticket: ScopedRequestTicket): Promise<AuthSession> {
  const refreshed = decodeAuthResponse(
    await requestJson(session.server_url, 'api/auth/refresh', {
      method: 'POST',
      body: { refresh_token: session.refresh_token },
    }),
  )
  assertAuthOperationCurrent(ticket)
  const next: AuthSession = {
    server_url: session.server_url,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    user: refreshed.user,
  }
  return next
}

async function meWithRefresh(session: AuthSession, ticket: ScopedRequestTicket): Promise<AuthSession> {
  try {
    const payload = assertObject(
      await requestJson(session.server_url, 'api/auth/me', {
        accessToken: session.access_token,
      }),
      'me',
    )
    assertAuthOperationCurrent(ticket)
    const next: AuthSession = {
      ...session,
      user: decodeUser(payload.user),
    }
    await replaceSessionForOperation(session, next, ticket)
    return next
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'unauthorized') {
      throw error
    }
    if (!session.refresh_token.trim()) {
      throw error
    }
    assertAuthOperationCurrent(ticket)
    const refreshed = await refreshSession(session, ticket)
    const payload = assertObject(
      await requestJson(refreshed.server_url, 'api/auth/me', {
        accessToken: refreshed.access_token,
      }),
      'me',
    )
    assertAuthOperationCurrent(ticket)
    const next: AuthSession = {
      ...refreshed,
      user: decodeUser(payload.user),
    }
    await replaceSessionForOperation(session, next, ticket)
    return next
  }
}

export async function getMobileSnapshot(): Promise<MobileCompanionSnapshot> {
  const [session, runtime, location, camera, audio] = await Promise.all([
    readSession(),
    buildRuntime(),
    getLocationState(),
    getCameraState(),
    getAudioState(),
  ])
  const binding =
    session?.server_url && session.access_token && session.refresh_token
      ? await readBindingState(session.server_url, runtime.runtime_id)
      : null
  return {
    auth: authState(session, null, null),
    binding,
    runtime,
    connection: getGatewayConnectionState(),
    location,
    camera,
    audio,
    capabilities: mobileCapabilities(),
  }
}

export async function syncMobileAuthState(): Promise<MobileCompanionState> {
  const ticket = authRequestGate.begin()
  const session = await readSession()
  assertAuthOperationCurrent(ticket)
  if (!session?.server_url) {
    return authState(session, null, null)
  }
  const bootstrap = decodeBootstrap(await requestJson(session.server_url, 'api/auth/bootstrap/status'))
  assertAuthOperationCurrent(ticket)
  if (!bootstrap.init_done) {
    const next = authState(session, false, '服务端尚未初始化，请先在 Web 端完成初始化')
    await replaceSessionForOperation(session, {
      server_url: session.server_url,
      access_token: '',
      refresh_token: '',
      user: null,
    }, ticket)
    await disconnectMobileGatewayConnection()
    assertAuthOperationCurrent(ticket)
    await syncLocationState({ interactive: false, refreshFix: false })
    await syncCameraState({ interactive: false })
    await syncAudioState({ interactive: false })
    assertAuthOperationCurrent(ticket)
    return next
  }
  if (!session.access_token || !session.refresh_token) {
    await disconnectMobileGatewayConnection()
    assertAuthOperationCurrent(ticket)
    await syncLocationState({ interactive: false, refreshFix: false })
    await syncCameraState({ interactive: false })
    await syncAudioState({ interactive: false })
    assertAuthOperationCurrent(ticket)
    return authState(session, true, null)
  }
  try {
    const nextSession = await meWithRefresh(session, ticket)
    assertAuthOperationCurrent(ticket)
    await syncMobileGatewayConnection()
    assertAuthOperationCurrent(ticket)
    await syncLocationState({ interactive: false, refreshFix: false })
    await syncCameraState({ interactive: false })
    await syncAudioState({ interactive: false })
    assertAuthOperationCurrent(ticket)
    return authState(nextSession, true, null)
  } catch (error) {
    if (error instanceof SupersededAuthOperationError || !authRequestGate.isCurrent(ticket)) {
      return currentAuthState(null, null)
    }
    const next: AuthSession = {
      server_url: session.server_url,
      access_token: '',
      refresh_token: '',
      user: null,
    }
    try {
      await replaceSessionForOperation(session, next, ticket)
    } catch (replaceError) {
      if (replaceError instanceof SupersededAuthOperationError) {
        return currentAuthState(null, null)
      }
      throw replaceError
    }
    await disconnectMobileGatewayConnection()
    assertAuthOperationCurrent(ticket)
    await syncLocationState({ interactive: false, refreshFix: false })
    await syncCameraState({ interactive: false })
    await syncAudioState({ interactive: false })
    assertAuthOperationCurrent(ticket)
    return authState(next, true, error instanceof Error ? error.message : '同步登录态失败')
  }
}

export async function loginMobileCompanion(
  serverUrl: string,
  username: string,
  password: string,
): Promise<{ auth: MobileCompanionState; binding: MobileBindingState | null }> {
  const normalizedServerUrl = normalizeServerUrl(serverUrl)
  const ticket = authRequestGate.begin(normalizedServerUrl)
  const normalizedUsername = username.trim()
  if (!normalizedUsername) {
    throw new Error('username is required')
  }
  if (!password.trim()) {
    throw new Error('password is required')
  }
  const bootstrap = decodeBootstrap(await requestJson(normalizedServerUrl, 'api/auth/bootstrap/status'))
  assertAuthOperationCurrent(ticket)
  if (!bootstrap.init_done) {
    throw new Error('服务端尚未初始化，移动端不提供初始化流程')
  }
  const auth = decodeAuthResponse(
    await requestJson(normalizedServerUrl, 'api/auth/login', {
      method: 'POST',
      body: {
        username: normalizedUsername,
        password,
      },
    }),
  )
  assertAuthOperationCurrent(ticket)
  const session: AuthSession = {
    server_url: normalizedServerUrl,
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
    user: auth.user,
  }
  await disconnectMobileGatewayConnection()
  assertAuthOperationCurrent(ticket)
  await writeSessionForOperation(session, ticket)
  try {
    const binding = await claimInvite(session, ticket)
    assertAuthOperationCurrent(ticket)
    await syncMobileGatewayConnection()
    assertAuthOperationCurrent(ticket)
    return {
      auth: authState(session, true, null),
      binding,
    }
  } catch (error) {
    if (error instanceof SupersededAuthOperationError || !authRequestGate.isCurrent(ticket)) {
      throw new SupersededAuthOperationError()
    }
    return {
      auth: authState(session, true, error instanceof Error ? error.message : '当前设备自动绑定失败'),
      binding: null,
    }
  }
}

export async function bindCurrentMobileRuntime(): Promise<MobileBindingState> {
  const ticket = authRequestGate.begin()
  const session = await readSession()
  assertAuthOperationCurrent(ticket)
  if (!session?.server_url || !session.access_token || !session.refresh_token) {
    throw new Error('请先登录账号')
  }
  const activeSession = await meWithRefresh(session, ticket)
  const binding = await claimInvite(activeSession, ticket)
  assertAuthOperationCurrent(ticket)
  await syncMobileGatewayConnection()
  assertAuthOperationCurrent(ticket)
  return binding
}

export async function logoutMobileCompanion(): Promise<MobileCompanionState> {
  const ticket = authRequestGate.begin()
  const session = await readSession()
  assertAuthOperationCurrent(ticket)
  if (session?.server_url && session.refresh_token.trim()) {
    try {
      await requestJson(session.server_url, 'api/auth/logout', {
        method: 'POST',
        body: { refresh_token: session.refresh_token },
      })
    } catch {
      // keep logout best-effort
    }
  }
  assertAuthOperationCurrent(ticket)
  const preservedServerUrl = session?.server_url || ''
  await disconnectMobileGatewayConnection()
  assertAuthOperationCurrent(ticket)
  if (preservedServerUrl) {
    const next: AuthSession = {
      server_url: preservedServerUrl,
      access_token: '',
      refresh_token: '',
      user: null,
    }
    if (!session) {
      throw new SupersededAuthOperationError()
    }
    await replaceSessionForOperation(session, next, ticket)
    return authState(next, true, null)
  }
  const cleared = await clearSessionIfCurrent(session)
  if (!cleared || !authRequestGate.isCurrent(ticket)) {
    return currentAuthState(null, null)
  }
  return authState(null, null, null)
}
