export type MobileAuthUser = {
  user_id: string
  username: string
  display_name?: string | null
  role?: string | null
}

export type MobileCompanionState = {
  server_url: string
  authenticated: boolean
  user: MobileAuthUser | null
  bootstrap_init_done?: boolean | null
  auth_error?: string | null
}

export type MobileBindingState = {
  runtime_id: string
  runtime_token: string
  pairing_state: string
  request_state?: string | null
  pairing_request_id?: string | null
  owner_user_id?: string | null
  bound_at: string
}

export type MobileGatewayConnectionState = {
  gateway_ws_url: string
  online: boolean
  connection_state: string
  last_connected_at: string
  last_error: string
  heartbeat_seconds: number
}

export type MobileLocationFix = {
  latitude: number
  longitude: number
  accuracy_meters: number | null
  altitude_meters: number | null
  heading_degrees: number | null
  speed_mps: number | null
  captured_at: string
}

export type MobileLocationState = {
  supported: boolean
  permission_status: 'granted' | 'denied' | 'undetermined' | 'unavailable'
  services_enabled: boolean | null
  last_fix: MobileLocationFix | null
  last_error: string
  updated_at: string
}

export type MobileCameraCapture = {
  local_uri: string
  width: number | null
  height: number | null
  mime_type: string | null
  file_size_bytes: number | null
  file_name: string | null
  captured_at: string
}

export type MobileCameraState = {
  supported: boolean
  permission_status: 'granted' | 'denied' | 'undetermined' | 'unavailable'
  foreground_required: boolean
  last_capture: MobileCameraCapture | null
  last_error: string
  updated_at: string
}

export type MobileAudioCapture = {
  local_uri: string
  duration_ms: number | null
  mime_type: string | null
  file_name: string | null
  recorded_at: string
}

export type MobileAudioState = {
  supported: boolean
  permission_status: 'granted' | 'denied' | 'undetermined' | 'unavailable'
  foreground_required: boolean
  is_recording: boolean
  last_capture: MobileAudioCapture | null
  last_error: string
  updated_at: string
}

export type MobileCapabilityDescriptor = {
  method: string
  title: string
  description: string
  platform: 'shared' | 'ios' | 'android'
  status: 'ready' | 'planned' | 'unsupported'
  declare_on_runtime: boolean
}

export type MobileRuntimeComponent = {
  component_id: string
  kind: 'mobile'
  methods: string[]
  health: {
    status: 'healthy'
    checked_at: string
  }
  metadata: Record<string, unknown>
}

export type MobileRuntimeDescriptor = {
  runtime_id: string
  display_name: string
  hostname: string
  platform: string
  platform_label: string
  runtime_version: string
  metadata: Record<string, unknown>
  components: MobileRuntimeComponent[]
}

export type MobileCompanionSnapshot = {
  auth: MobileCompanionState
  binding: MobileBindingState | null
  runtime: MobileRuntimeDescriptor
  connection: MobileGatewayConnectionState
  location: MobileLocationState
  camera: MobileCameraState
  audio: MobileAudioState
  capabilities: MobileCapabilityDescriptor[]
}

export type ClientReleaseAsset = {
  name: string
  component: 'hostd' | 'desktop' | 'mobile' | 'unknown'
  platform: string | null
  arch: string | null
  kind: string | null
  url: string
  sha256: string
  size: number
}

export type ClientReleaseManifest = {
  schemaVersion: number
  release: {
    version: string
    channel: string
    sourceRepository: string
    sourceSha: string
    createdAt: string
  }
  clients: {
    hostd: ClientReleaseAsset[]
    desktop: ClientReleaseAsset[]
    mobile: ClientReleaseAsset[]
  }
}

export type MobileClientUpdateCheck = {
  manifest_url: string
  current_version: string
  latest_version: string
  update_available: boolean
  checked_at: string
  asset: ClientReleaseAsset | null
  all_assets: ClientReleaseAsset[]
}

export type AuthBootstrapStatus = {
  init_done: boolean
}

export type AuthResponse = {
  access_token: string
  refresh_token: string
  token_type?: string
  access_expires_in?: number
  refresh_expires_in?: number
  user: MobileAuthUser
}

export type AuthSession = {
  server_url: string
  access_token: string
  refresh_token: string
  user: MobileAuthUser | null
}

export type BindingInviteResponse = {
  invite_id?: string
  invite_code?: string
  invite_url?: string
  expires_at?: string
  created_at?: string
}

export type BindingClaimResponse = {
  runtime_id: string
  pairing_state: string
  request_state?: string | null
  pairing_request_id?: string | null
  runtime_token: string
  owner_user_id?: string | null
}

export type RuntimeIdentity = {
  runtime_id: string
  created_at: string
}
