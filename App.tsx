import { nativeTokens } from '@agi/frontend/native'
import { StatusBar } from 'expo-status-bar'
import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { createMobileCompanionView } from './src/mobileCompanionView'
import { CapabilitiesScreen } from './src/screens/CapabilitiesScreen'
import { CaptureScreen } from './src/screens/CaptureScreen'
import { ConnectScreen } from './src/screens/ConnectScreen'
import { PulseScreen } from './src/screens/PulseScreen'
import { SettingsScreen } from './src/screens/SettingsScreen'
import { recordAudio, syncAudioState } from './src/services/audioFeature'
import { capturePhoto, syncCameraState } from './src/services/cameraFeature'
import { checkMobileClientUpdate, downloadMobileClientUpdate } from './src/services/clientUpdates'
import { subscribeGatewayConnection, syncMobileGatewayConnection } from './src/services/gatewaySocket'
import { syncLocationState } from './src/services/locationFeature'
import {
  bindCurrentMobileRuntime,
  getMobileSnapshot,
  loginMobileCompanion,
  logoutMobileCompanion,
  syncMobileAuthState,
} from './src/services/mobileCompanion'
import { LatestScopedRequestGate } from './src/services/requestScope'
import { readUpdateProxyUrl, writeUpdateProxyUrl } from './src/storage/session'
import type { MobileClientUpdateCheck, MobileCompanionSnapshot, MobileCompanionState } from './src/types'
import { BottomNav, Notice, palette, type MobileTabId } from './src/ui/spatial'

const sharedCanvasColor = nativeTokens.color.surface.canvas

export default function App() {
  const [activeTab, setActiveTab] = useState<MobileTabId>('pulse')
  const [snapshot, setSnapshot] = useState<MobileCompanionSnapshot | null>(null)
  const [authState, setAuthState] = useState<MobileCompanionState | null>(null)
  const [serverUrlInput, setServerUrlInput] = useState('')
  const [usernameInput, setUsernameInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionPending, setActionPending] = useState(false)
  const [flash, setFlash] = useState('')
  const [error, setError] = useState('')
  const [clientUpdate, setClientUpdate] = useState<MobileClientUpdateCheck | null>(null)
  const [clientUpdatePending, setClientUpdatePending] = useState(false)
  const [clientUpdateMessage, setClientUpdateMessage] = useState('')
  const [clientUpdateError, setClientUpdateError] = useState('')
  const [clientUpdateProxyInput, setClientUpdateProxyInput] = useState('')
  const snapshotRequestGate = useRef(new LatestScopedRequestGate())
  const activeServerUrl = useRef<string | null>(null)

  async function refreshSnapshot(expectedServerUrl?: string | null) {
    const expectedUrl = expectedServerUrl === undefined ? activeServerUrl.current ?? undefined : expectedServerUrl
    const ticket = snapshotRequestGate.current.begin(expectedUrl)
    const next = await getMobileSnapshot()
    if (!snapshotRequestGate.current.accepts(ticket, next.auth.server_url)) {
      return null
    }
    activeServerUrl.current = next.auth.server_url
    startTransition(() => {
      setSnapshot(next)
      setLoading(false)
    })
    return next
  }

  useEffect(() => {
    let disposed = false
    setLoading(true)
    refreshSnapshot()
      .then(() => syncMobileGatewayConnection())
      .then(() => syncMobileAuthState())
      .then((nextAuth) => {
        if (!disposed) {
          activeServerUrl.current = nextAuth.server_url
          startTransition(() => {
            setAuthState(nextAuth)
            setLoading(false)
          })
          refreshSnapshot(nextAuth.server_url).catch(() => undefined)
        }
      })
      .catch((nextError: unknown) => {
        if (!disposed) {
          setError(nextError instanceof Error ? nextError.message : '加载移动端状态失败')
          setLoading(false)
        }
      })
    return () => {
      disposed = true
      snapshotRequestGate.current.invalidate()
    }
  }, [])

  useEffect(() => {
    let disposed = false
    readUpdateProxyUrl()
      .then((value) => { if (!disposed) setClientUpdateProxyInput(value) })
      .catch(() => undefined)
    return () => { disposed = true }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeGatewayConnection(() => {
      refreshSnapshot().catch(() => undefined)
    })
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncMobileGatewayConnection()
          .then(() => refreshSnapshot())
          .catch(() => undefined)
      }
    })
    return () => {
      unsubscribe()
      subscription.remove()
      snapshotRequestGate.current.invalidate()
    }
  }, [])

  const effectiveAuth = authState ?? snapshot?.auth ?? null

  useEffect(() => {
    if (effectiveAuth?.server_url && serverUrlInput.trim() === '') {
      setServerUrlInput(effectiveAuth.server_url)
    }
  }, [effectiveAuth?.server_url, serverUrlInput])

  const capabilities = snapshot?.capabilities ?? []
  const mobileCompanionView = useMemo(
    () => createMobileCompanionView({
      authenticated: Boolean(effectiveAuth?.authenticated),
      bound: Boolean(snapshot?.binding?.runtime_token),
      online: Boolean(snapshot?.connection.online),
      connectionState: snapshot?.connection.connection_state || 'loading',
      capabilities,
    }),
    [capabilities, effectiveAuth?.authenticated, snapshot?.binding?.runtime_token, snapshot?.connection.connection_state, snapshot?.connection.online],
  )

  function resetFeedback() {
    setFlash('')
    setError('')
  }

  async function handleLogin() {
    snapshotRequestGate.current.invalidate()
    activeServerUrl.current = serverUrlInput
    setActionPending(true)
    resetFeedback()
    try {
      const next = await loginMobileCompanion(serverUrlInput, usernameInput, passwordInput)
      activeServerUrl.current = next.auth.server_url
      setAuthState(next.auth)
      setPasswordInput('')
      setFlash(next.binding ? '登录成功，当前移动设备已自动绑定' : '登录成功，设备等待绑定')
      setActiveTab('pulse')
      await refreshSnapshot(next.auth.server_url)
    } catch (nextError) {
      activeServerUrl.current = authState?.server_url ?? snapshot?.auth.server_url ?? null
      setError(nextError instanceof Error ? nextError.message : '登录失败')
    } finally {
      setActionPending(false)
    }
  }

  async function handleRebind() {
    setActionPending(true)
    resetFeedback()
    try {
      const next = await bindCurrentMobileRuntime()
      setFlash(`当前设备已重新绑定：${next.pairing_state}`)
      await refreshSnapshot()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '重新绑定失败')
    } finally {
      setActionPending(false)
    }
  }

  async function handleLogout() {
    snapshotRequestGate.current.invalidate()
    setActionPending(true)
    resetFeedback()
    try {
      const next = await logoutMobileCompanion()
      activeServerUrl.current = next.server_url
      setAuthState(next)
      setFlash('账号已退出')
      setActiveTab('pulse')
      await refreshSnapshot(next.server_url)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '退出失败')
    } finally {
      setActionPending(false)
    }
  }

  async function handleRefreshLocation() {
    setActionPending(true)
    resetFeedback()
    try {
      await syncLocationState({ interactive: true, refreshFix: true, accuracy: 'balanced' })
      setFlash('定位权限与当前位置已刷新')
      await refreshSnapshot()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '刷新定位失败')
    } finally {
      setActionPending(false)
    }
  }

  async function handleCapturePhoto() {
    setActionPending(true)
    resetFeedback()
    try {
      await syncCameraState({ interactive: true })
      await capturePhoto({ interactivePermission: false })
      setFlash('拍照成功，最近采集已更新')
      await refreshSnapshot()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '拍照失败')
    } finally {
      setActionPending(false)
    }
  }

  async function handleRecordAudio() {
    setActionPending(true)
    resetFeedback()
    try {
      await syncAudioState({ interactive: true })
      await recordAudio({ interactivePermission: false, durationMs: 5000 })
      setFlash('录音成功，最近采集已更新')
      await refreshSnapshot()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '录音失败')
    } finally {
      setActionPending(false)
    }
  }

  async function handleCheckClientUpdate() {
    const proxyUrl = clientUpdateProxyInput.trim()
    setClientUpdatePending(true)
    setClientUpdateMessage('')
    setClientUpdateError('')
    try {
      await writeUpdateProxyUrl(proxyUrl)
      const next = await checkMobileClientUpdate(proxyUrl)
      setClientUpdate(next)
      setClientUpdateMessage(next.update_available ? `发现新版本 ${next.latest_version}` : '当前已是最新版本')
    } catch (nextError) {
      setClientUpdateError(nextError instanceof Error ? nextError.message : '检查客户端更新失败')
    } finally {
      setClientUpdatePending(false)
    }
  }

  async function handleDownloadClientUpdate() {
    if (!clientUpdate?.asset) {
      setClientUpdateError('当前设备没有匹配的移动端安装包')
      return
    }
    const proxyUrl = clientUpdateProxyInput.trim()
    setClientUpdatePending(true)
    setClientUpdateMessage('')
    setClientUpdateError('')
    try {
      await writeUpdateProxyUrl(proxyUrl)
      await downloadMobileClientUpdate(clientUpdate.asset, proxyUrl)
      setClientUpdateMessage('已交给系统浏览器或安装器处理')
    } catch (nextError) {
      setClientUpdateError(nextError instanceof Error ? nextError.message : '打开客户端下载地址失败')
    } finally {
      setClientUpdatePending(false)
    }
  }

  const authenticated = Boolean(effectiveAuth?.authenticated)
  const currentScreen = !authenticated ? (
    <ConnectScreen
      bootstrapReady={effectiveAuth?.bootstrap_init_done !== false}
      onLogin={() => void handleLogin()}
      onPasswordChange={setPasswordInput}
      onServerUrlChange={setServerUrlInput}
      onUsernameChange={setUsernameInput}
      password={passwordInput}
      pending={actionPending}
      serverUrl={serverUrlInput}
      username={usernameInput}
    />
  ) : activeTab === 'pulse' ? (
    <PulseScreen
      onOpenCapture={() => setActiveTab('capture')}
      primary={mobileCompanionView.primary}
      snapshot={snapshot}
      statusItems={mobileCompanionView.statusItems}
    />
  ) : activeTab === 'capture' ? (
    <CaptureScreen
      onCapturePhoto={() => void handleCapturePhoto()}
      onRecordAudio={() => void handleRecordAudio()}
      onRefreshLocation={() => void handleRefreshLocation()}
      pending={actionPending}
      snapshot={snapshot}
    />
  ) : activeTab === 'capabilities' ? (
    <CapabilitiesScreen items={mobileCompanionView.capabilities.items} online={Boolean(snapshot?.connection.online)} />
  ) : (
    <SettingsScreen
      auth={effectiveAuth}
      onCheckUpdate={() => void handleCheckClientUpdate()}
      onDownloadUpdate={() => void handleDownloadClientUpdate()}
      onLogout={() => void handleLogout()}
      onRebind={() => void handleRebind()}
      onUpdateProxyChange={setClientUpdateProxyInput}
      pending={actionPending}
      snapshot={snapshot}
      update={clientUpdate}
      updateError={clientUpdateError}
      updateMessage={clientUpdateMessage}
      updatePending={clientUpdatePending}
      updateProxy={clientUpdateProxyInput}
    />
  )

  return (
    <SafeAreaView style={[appStyles.safeArea, { backgroundColor: sharedCanvasColor || palette.canvas }]}>
      <StatusBar style="dark" />
      {flash ? <Notice message={flash} tone="success" /> : null}
      {error ? <Notice message={error} tone="error" /> : null}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={appStyles.content}>
        <ScrollView
          contentContainerStyle={appStyles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={appStyles.loading}>
              <ActivityIndicator color={palette.teal} size="small" />
              <Text style={appStyles.loadingText}>同步 Companion 状态</Text>
            </View>
          ) : null}
          {currentScreen}
        </ScrollView>
      </KeyboardAvoidingView>
      {authenticated ? <BottomNav activeTab={activeTab} onChange={setActiveTab} /> : null}
    </SafeAreaView>
  )
}

const appStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  content: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10 },
  loadingText: { color: palette.muted, fontSize: 12 },
})
