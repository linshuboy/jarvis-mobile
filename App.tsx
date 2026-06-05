import { StatusBar } from 'expo-status-bar'
import { nativeTokens } from '@agi/frontend'
import { startTransition, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  AppState,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import type { MobileClientUpdateCheck, MobileCompanionSnapshot, MobileCompanionState } from './src/types'
import { recordAudio, syncAudioState } from './src/services/audioFeature'
import { capturePhoto, syncCameraState } from './src/services/cameraFeature'
import {
  checkMobileClientUpdate,
  downloadMobileClientUpdate,
  releaseManifestUrl,
} from './src/services/clientUpdates'
import { subscribeGatewayConnection, syncMobileGatewayConnection } from './src/services/gatewaySocket'
import { syncLocationState } from './src/services/locationFeature'
import {
  bindCurrentMobileRuntime,
  getMobileSnapshot,
  loginMobileCompanion,
  logoutMobileCompanion,
  syncMobileAuthState,
} from './src/services/mobileCompanion'
import { createMobileCompanionView } from './src/mobileCompanionView'
import { readUpdateProxyUrl, writeUpdateProxyUrl } from './src/storage/session'

const sharedCanvasColor = nativeTokens.color.background.canvas

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '未绑定'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', { hour12: false })
}

type CapabilityDisplayItem = {
  method: string
  title: string
  description: string
  status: string
}

function CapabilityRow({ item }: { item: CapabilityDisplayItem }) {
  const tone =
    item.status === 'ready'
      ? styles.capabilityReady
      : item.status === 'planned'
        ? styles.capabilityPlanned
        : styles.capabilityUnsupported
  return (
    <View style={styles.capabilityRow}>
      <View style={styles.capabilityCopy}>
        <Text style={styles.capabilityTitle}>{item.title}</Text>
        <Text style={styles.capabilityMethod}>{item.method}</Text>
        <Text style={styles.capabilityDescription}>{item.description}</Text>
      </View>
      <View style={[styles.capabilityBadge, tone]}>
        <Text style={styles.capabilityBadgeText}>
          {item.status === 'ready' ? '已接线' : item.status === 'planned' ? '已规划' : '不支持'}
        </Text>
      </View>
    </View>
  )
}

function Card({
  title,
  eyebrow,
  children,
}: {
  title: string
  eyebrow?: string
  children: ReactNode
}) {
  return (
    <View style={styles.card}>
      {eyebrow ? <Text style={styles.cardEyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  )
}

export default function App() {
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

  async function refreshSnapshot() {
    const next = await getMobileSnapshot()
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
        if (disposed) {
          return
        }
        startTransition(() => {
          setAuthState(nextAuth)
          setLoading(false)
        })
      })
      .catch((nextError: unknown) => {
        if (disposed) {
          return
        }
        setError(nextError instanceof Error ? nextError.message : '加载移动端状态失败')
        setLoading(false)
      })
    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    let disposed = false
    readUpdateProxyUrl()
      .then((value) => {
        if (!disposed) {
          setClientUpdateProxyInput(value)
        }
      })
      .catch(() => {
        return
      })
    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeGatewayConnection(() => {
      refreshSnapshot().catch(() => {
        return
      })
    })
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncMobileGatewayConnection()
          .then(() => refreshSnapshot())
          .catch(() => {
            return
          })
      }
    })
    return () => {
      unsubscribe()
      subscription.remove()
    }
  }, [])

  const effectiveAuth = authState ?? snapshot?.auth ?? null

  useEffect(() => {
    if (effectiveAuth?.server_url && serverUrlInput.trim() === '') {
      setServerUrlInput(effectiveAuth.server_url)
    }
  }, [effectiveAuth?.server_url, serverUrlInput])

  const headerMetrics = useMemo(() => {
    if (!snapshot) {
      return []
    }
    return [
      { label: 'Runtime ID', value: snapshot.runtime.runtime_id },
      { label: '平台', value: snapshot.runtime.platform_label },
      { label: '服务地址', value: effectiveAuth?.server_url || '未配置' },
      { label: 'Gateway WS', value: snapshot.connection.gateway_ws_url || '未派生' },
      { label: '在线状态', value: snapshot.connection.connection_state || 'offline' },
      { label: '最近绑定', value: formatTimestamp(snapshot.binding?.bound_at) },
    ]
  }, [effectiveAuth?.server_url, snapshot])

  const capabilities = snapshot?.capabilities ?? []
  const mobileCompanionView = useMemo(
    () =>
      createMobileCompanionView({
        authenticated: Boolean(effectiveAuth?.authenticated),
        bound: Boolean(snapshot?.binding?.runtime_token),
        online: Boolean(snapshot?.connection.online),
        connectionState: snapshot?.connection.connection_state || 'loading',
        capabilities,
      }),
    [capabilities, effectiveAuth?.authenticated, snapshot?.binding?.runtime_token, snapshot?.connection.connection_state, snapshot?.connection.online],
  )

  async function handleLogin() {
    setActionPending(true)
    setFlash('')
    setError('')
    try {
      const next = await loginMobileCompanion(serverUrlInput, usernameInput, passwordInput)
      setAuthState(next.auth)
      setPasswordInput('')
      if (next.binding) {
        setFlash('登录成功，当前移动设备已自动绑定')
      } else {
        setFlash('登录成功，但当前设备尚未完成绑定')
      }
      await refreshSnapshot()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '登录失败')
    } finally {
      setActionPending(false)
    }
  }

  async function handleRebind() {
    setActionPending(true)
    setFlash('')
    setError('')
    try {
      const next = await bindCurrentMobileRuntime()
      setFlash(`当前设备已重新绑定，状态：${next.pairing_state}`)
      await refreshSnapshot()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '重新绑定失败')
    } finally {
      setActionPending(false)
    }
  }

  async function handleLogout() {
    setActionPending(true)
    setFlash('')
    setError('')
    try {
      const next = await logoutMobileCompanion()
      setAuthState(next)
      setFlash('账号已退出，移动端绑定 token 已清除')
      await refreshSnapshot()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '退出失败')
    } finally {
      setActionPending(false)
    }
  }

  async function handleRefreshLocation() {
    setActionPending(true)
    setFlash('')
    setError('')
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
      setClientUpdateMessage('已交给系统浏览器/安装器处理，文件会进入系统默认下载位置')
    } catch (nextError) {
      setClientUpdateError(nextError instanceof Error ? nextError.message : '打开客户端下载地址失败')
    } finally {
      setClientUpdatePending(false)
    }
  }

  async function handleCapturePhoto() {
    setActionPending(true)
    setFlash('')
    setError('')
    try {
      await syncCameraState({ interactive: true })
      await capturePhoto({ interactivePermission: false })
      setFlash('拍照成功，最近一次采集结果已更新')
      await refreshSnapshot()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '拍照失败')
    } finally {
      setActionPending(false)
    }
  }

  async function handleRecordAudio() {
    setActionPending(true)
    setFlash('')
    setError('')
    try {
      await syncAudioState({ interactive: true })
      await recordAudio({ interactivePermission: false, durationMs: 5000 })
      setFlash('录音成功，最近一次录音结果已更新')
      await refreshSnapshot()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '录音失败')
    } finally {
      setActionPending(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.backgroundTop} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Sunvisai Mobile Companion</Text>
          <Text style={styles.heroTitle}>移动端伴随终端，不伪装成桌面执行设备。</Text>
          <Text style={styles.heroBody}>
            当前前端壳已重新设计：登录、自动绑定、连接状态和 mobile.* 能力聚合到同一条状态语义里；文件与命令执行仍属于桌面/server host。
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color="#9b4d1a" />
            <Text style={styles.loadingText}>正在加载移动端状态…</Text>
          </View>
        ) : null}

        {flash ? <Text style={styles.flash}>{flash}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.mobileStatusDeck}>
          <View style={styles.mobileStatusPrimary}>
            <Text style={styles.mobileStatusEyebrow}>当前焦点</Text>
            <Text style={styles.mobileStatusValue}>{mobileCompanionView.primary.value}</Text>
            <Text style={styles.mobileStatusLabel}>{mobileCompanionView.primary.label}</Text>
          </View>
          <View style={styles.mobileStatusGrid}>
            {mobileCompanionView.statusItems.map((item) => (
              <View key={item.label} style={styles.mobileStatusItem}>
                <View style={[styles.mobileStatusDot, { backgroundColor: item.accent }]} />
                <View style={styles.mobileStatusCopy}>
                  <Text style={styles.mobileStatusItemLabel}>{item.label}</Text>
                  <Text style={styles.mobileStatusItemValue}>{item.value}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <Card title="设备概览" eyebrow="Snapshot">
          <View style={styles.metricsGrid}>
            {headerMetrics.map((item) => (
              <Metric key={item.label} label={item.label} value={item.value} />
            ))}
          </View>
          {snapshot?.binding ? (
            <View style={styles.inlinePanel}>
              <Text style={styles.inlinePanelTitle}>绑定状态</Text>
              <Text style={styles.inlinePanelBody}>
                pairing_state={snapshot.binding.pairing_state}，owner_user_id={snapshot.binding.owner_user_id || '未写入'}
              </Text>
              <Text style={styles.inlinePanelBody}>
                runtime_token={snapshot.binding.runtime_token ? '已保存到本地安全存储' : '未保存'}
              </Text>
              <Text style={styles.inlinePanelBody}>
                online={snapshot.connection.online ? 'true' : 'false'}，last_connected_at={formatTimestamp(snapshot.connection.last_connected_at)}
              </Text>
              {snapshot.connection.last_error ? (
                <Text style={styles.inlinePanelBody}>last_error={snapshot.connection.last_error}</Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.inlinePanel}>
              <Text style={styles.inlinePanelTitle}>绑定状态</Text>
              <Text style={styles.inlinePanelBody}>当前设备尚未绑定到任何账号。</Text>
            </View>
          )}
        </Card>

        <Card title="服务端与账号" eyebrow="Auth">
          <Text style={styles.fieldLabel}>Server URL</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setServerUrlInput}
            placeholder="https://sunvisai.example.com"
            placeholderTextColor="#8d7f74"
            style={styles.input}
            value={serverUrlInput}
          />

          <Text style={styles.fieldLabel}>用户名</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setUsernameInput}
            placeholder="admin"
            placeholderTextColor="#8d7f74"
            style={styles.input}
            value={usernameInput}
          />

          <Text style={styles.fieldLabel}>密码</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setPasswordInput}
            placeholder="••••••••"
            placeholderTextColor="#8d7f74"
            secureTextEntry
            style={styles.input}
            value={passwordInput}
          />

          {effectiveAuth?.bootstrap_init_done === false ? (
            <Text style={styles.warning}>
              服务端尚未初始化。移动端不提供初始化流程，请先在 Web 端完成管理员初始化。
            </Text>
          ) : null}
          {effectiveAuth?.user ? (
            <Text style={styles.loggedInText}>
              当前登录：{effectiveAuth.user.display_name || effectiveAuth.user.username} ({effectiveAuth.user.role || 'unknown'})
            </Text>
          ) : null}

          <View style={styles.buttonRow}>
            <Pressable
              disabled={actionPending || effectiveAuth?.bootstrap_init_done === false}
              onPress={handleLogin}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || actionPending || effectiveAuth?.bootstrap_init_done === false) && styles.buttonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>{actionPending ? '处理中…' : '登录并自动绑定'}</Text>
            </Pressable>
            <Pressable
              disabled={actionPending || !effectiveAuth?.authenticated}
              onPress={handleLogout}
              style={({ pressed }) => [
                styles.secondaryButton,
                (pressed || actionPending || !effectiveAuth?.authenticated) && styles.buttonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>退出账号</Text>
            </Pressable>
          </View>
        </Card>

        <Card title="当前设备绑定" eyebrow="Runtime Bind">
          <Text style={styles.cardBody}>
            移动端复用和桌面端相同的 invite 真相层，但不暴露手工 invite link。登录后会自动 create + claim 当前移动设备。
          </Text>
          <View style={styles.buttonRow}>
            <Pressable
              disabled={actionPending || !effectiveAuth?.authenticated}
              onPress={handleRebind}
              style={({ pressed }) => [
                styles.secondaryButton,
                (pressed || actionPending || !effectiveAuth?.authenticated) && styles.buttonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>重新绑定当前设备</Text>
            </Pressable>
          </View>
        </Card>

        <Card title="客户端更新" eyebrow="Client Update">
          <Text style={styles.cardBody}>
            移动端不执行后台静默安装。检查到新包后会打开系统下载地址，由系统浏览器或安装器保存到默认下载位置。GitHub 慢时可配置 URL 代理模板。
          </Text>
          <Text style={styles.fieldLabel}>更新代理 URL</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={setClientUpdateProxyInput}
            placeholder="https://gh-proxy.example/{url}"
            placeholderTextColor="#8d7f74"
            style={styles.input}
            value={clientUpdateProxyInput}
          />
          <View style={styles.inlinePanel}>
            <Text style={styles.inlinePanelTitle}>更新状态</Text>
            <Text style={styles.inlinePanelBody}>
              current={clientUpdate?.current_version || '0.1.13'}，latest={clientUpdate?.latest_version || '尚未检查'}
            </Text>
            <Text style={styles.inlinePanelBody}>
              status=
              {clientUpdate ? (clientUpdate.update_available ? '发现新版本' : '已是最新') : '未检查'}
            </Text>
            <Text style={styles.inlinePanelBody}>asset={clientUpdate?.asset?.name || '未匹配'}</Text>
            <Text style={styles.inlinePanelBody}>manifest={releaseManifestUrl()}</Text>
            <Text style={styles.inlinePanelBody}>proxy={clientUpdateProxyInput.trim() || '未配置'}</Text>
            <Text style={styles.inlinePanelBody}>
              checked_at={formatTimestamp(clientUpdate?.checked_at)}
            </Text>
          </View>
          <View style={styles.buttonRow}>
            <Pressable
              disabled={clientUpdatePending}
              onPress={handleCheckClientUpdate}
              style={({ pressed }) => [
                styles.secondaryButton,
                (pressed || clientUpdatePending) && styles.buttonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>{clientUpdatePending ? '处理中…' : '手动检查更新'}</Text>
            </Pressable>
            <Pressable
              disabled={clientUpdatePending || !clientUpdate?.asset}
              onPress={handleDownloadClientUpdate}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || clientUpdatePending || !clientUpdate?.asset) && styles.buttonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>下载客户端文件</Text>
            </Pressable>
          </View>
          {clientUpdateMessage ? <Text style={styles.flash}>{clientUpdateMessage}</Text> : null}
          {clientUpdateError ? <Text style={styles.error}>{clientUpdateError}</Text> : null}
        </Card>

        <Card title="定位能力" eyebrow="location.get">
          <Text style={styles.cardBody}>
            `location.get` 已经接入真实实现。Gateway 请求时不会主动弹权限框；你需要先在前台显式授权。
          </Text>
          <View style={styles.inlinePanel}>
            <Text style={styles.inlinePanelTitle}>定位状态</Text>
            <Text style={styles.inlinePanelBody}>
              permission_status={snapshot?.location.permission_status || 'unknown'}，services_enabled=
              {snapshot?.location.services_enabled === null ? 'unknown' : snapshot?.location.services_enabled ? 'true' : 'false'}
            </Text>
            <Text style={styles.inlinePanelBody}>
              updated_at={formatTimestamp(snapshot?.location.updated_at)}
            </Text>
            {snapshot?.location.last_fix ? (
              <>
                <Text style={styles.inlinePanelBody}>
                  lat={snapshot.location.last_fix.latitude.toFixed(6)}，lng={snapshot.location.last_fix.longitude.toFixed(6)}
                </Text>
                <Text style={styles.inlinePanelBody}>
                  accuracy={snapshot.location.last_fix.accuracy_meters ?? 'unknown'}m，captured_at={formatTimestamp(snapshot.location.last_fix.captured_at)}
                </Text>
              </>
            ) : null}
            {snapshot?.location.last_error ? (
              <Text style={styles.inlinePanelBody}>last_error={snapshot.location.last_error}</Text>
            ) : null}
          </View>
          <View style={styles.buttonRow}>
            <Pressable
              disabled={actionPending}
              onPress={handleRefreshLocation}
              style={({ pressed }) => [
                styles.secondaryButton,
                (pressed || actionPending) && styles.buttonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>请求权限并刷新定位</Text>
            </Pressable>
          </View>
        </Card>

        <Card title="相机能力" eyebrow="camera.capture">
          <Text style={styles.cardBody}>
            `camera.capture` 已接入真实实现。它是前台交互能力：远程 `req` 只有在 App 保持前台时才允许打开相机，不支持后台静默拍照。
          </Text>
          <View style={styles.inlinePanel}>
            <Text style={styles.inlinePanelTitle}>相机状态</Text>
            <Text style={styles.inlinePanelBody}>
              permission_status={snapshot?.camera.permission_status || 'unknown'}，foreground_required=
              {snapshot?.camera.foreground_required ? 'true' : 'false'}
            </Text>
            <Text style={styles.inlinePanelBody}>
              updated_at={formatTimestamp(snapshot?.camera.updated_at)}
            </Text>
            {snapshot?.camera.last_capture ? (
              <>
                <Text style={styles.inlinePanelBody}>
                  size={snapshot.camera.last_capture.width ?? 'unknown'}x{snapshot.camera.last_capture.height ?? 'unknown'}，
                  mime={snapshot.camera.last_capture.mime_type || 'unknown'}
                </Text>
                <Text style={styles.inlinePanelBody}>
                  file={snapshot.camera.last_capture.file_name || snapshot.camera.last_capture.local_uri}
                </Text>
                <Text style={styles.inlinePanelBody}>
                  captured_at={formatTimestamp(snapshot.camera.last_capture.captured_at)}
                </Text>
              </>
            ) : null}
            {snapshot?.camera.last_error ? (
              <Text style={styles.inlinePanelBody}>last_error={snapshot.camera.last_error}</Text>
            ) : null}
          </View>
          <View style={styles.buttonRow}>
            <Pressable
              disabled={actionPending}
              onPress={handleCapturePhoto}
              style={({ pressed }) => [
                styles.secondaryButton,
                (pressed || actionPending) && styles.buttonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>请求权限并打开相机</Text>
            </Pressable>
          </View>
        </Card>

        <Card title="录音能力" eyebrow="audio.record">
          <Text style={styles.cardBody}>
            `audio.record` 已接入真实实现，默认录制 5 秒短音频。它和相机一样属于前台交互能力，不支持后台静默录音。
          </Text>
          <View style={styles.inlinePanel}>
            <Text style={styles.inlinePanelTitle}>录音状态</Text>
            <Text style={styles.inlinePanelBody}>
              permission_status={snapshot?.audio.permission_status || 'unknown'}，foreground_required=
              {snapshot?.audio.foreground_required ? 'true' : 'false'}，is_recording=
              {snapshot?.audio.is_recording ? 'true' : 'false'}
            </Text>
            <Text style={styles.inlinePanelBody}>
              updated_at={formatTimestamp(snapshot?.audio.updated_at)}
            </Text>
            {snapshot?.audio.last_capture ? (
              <>
                <Text style={styles.inlinePanelBody}>
                  duration_ms={snapshot.audio.last_capture.duration_ms ?? 'unknown'}，mime=
                  {snapshot.audio.last_capture.mime_type || 'unknown'}
                </Text>
                <Text style={styles.inlinePanelBody}>
                  file={snapshot.audio.last_capture.file_name || snapshot.audio.last_capture.local_uri}
                </Text>
                <Text style={styles.inlinePanelBody}>
                  recorded_at={formatTimestamp(snapshot.audio.last_capture.recorded_at)}
                </Text>
              </>
            ) : null}
            {snapshot?.audio.last_error ? (
              <Text style={styles.inlinePanelBody}>last_error={snapshot.audio.last_error}</Text>
            ) : null}
          </View>
          <View style={styles.buttonRow}>
            <Pressable
              disabled={actionPending}
              onPress={handleRecordAudio}
              style={({ pressed }) => [
                styles.secondaryButton,
                (pressed || actionPending) && styles.buttonPressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>请求权限并录制 5 秒</Text>
            </Pressable>
          </View>
        </Card>

        <Card title="能力矩阵" eyebrow="Platform Surface">
          <Text style={styles.cardBody}>
            共享业务层只展示 mobile companion 能力。已过滤 {mobileCompanionView.capabilities.hostFilteredCount} 项桌面 host 能力，避免把手机端伪装成文件/命令执行设备。
          </Text>
          <View style={styles.capabilityList}>
            {mobileCompanionView.capabilities.items.map((item) => (
              <CapabilityRow key={item.method} item={item} />
            ))}
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: sharedCanvasColor,
  },
  backgroundTop: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 260,
    backgroundColor: '#cbd9c6',
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 36,
    gap: 16,
  },
  hero: {
    backgroundColor: '#1e2523',
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingVertical: 24,
    gap: 10,
  },
  kicker: {
    color: '#a9c4ae',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#fff7ef',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
  },
  heroBody: {
    color: '#d5ded5',
    fontSize: 15,
    lineHeight: 22,
  },
  mobileStatusDeck: {
    backgroundColor: '#fffaf0',
    borderColor: '#ded6c8',
    borderWidth: 1,
    borderRadius: 26,
    padding: 16,
    gap: 14,
  },
  mobileStatusPrimary: {
    backgroundColor: '#e7efe6',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  mobileStatusEyebrow: {
    color: '#556b2f',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  mobileStatusValue: {
    color: '#1e2523',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 6,
  },
  mobileStatusLabel: {
    color: '#52605b',
    fontSize: 13,
    marginTop: 4,
  },
  mobileStatusGrid: {
    gap: 10,
  },
  mobileStatusItem: {
    alignItems: 'center',
    backgroundColor: '#f7f1e7',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  mobileStatusDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  mobileStatusCopy: {
    flex: 1,
  },
  mobileStatusItemLabel: {
    color: '#7b8680',
    fontSize: 12,
    fontWeight: '700',
  },
  mobileStatusItemValue: {
    color: '#1e2523',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  loadingBlock: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#5d4738',
    fontSize: 14,
  },
  flash: {
    borderRadius: 16,
    backgroundColor: '#e3f0df',
    color: '#204725',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
  },
  error: {
    borderRadius: 16,
    backgroundColor: '#f6dbd6',
    color: '#7d2817',
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
  },
  warning: {
    borderRadius: 16,
    backgroundColor: '#fae8ca',
    color: '#74490d',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderRadius: 24,
    backgroundColor: '#fff9f3',
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 14,
    shadowColor: '#5f3d20',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  cardEyebrow: {
    color: '#9b4d1a',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: '#23120a',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
  },
  cardBody: {
    color: '#5b473b',
    fontSize: 15,
    lineHeight: 22,
  },
  metricsGrid: {
    gap: 10,
  },
  metric: {
    borderRadius: 18,
    backgroundColor: '#f3e5d6',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  metricLabel: {
    color: '#7d6454',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: '#1f140e',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  inlinePanel: {
    borderRadius: 18,
    backgroundColor: '#fff2e0',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  inlinePanelTitle: {
    color: '#6f3510',
    fontSize: 14,
    fontWeight: '700',
  },
  inlinePanelBody: {
    color: '#5d4738',
    fontSize: 14,
    lineHeight: 20,
  },
  fieldLabel: {
    color: '#573e30',
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    borderRadius: 16,
    backgroundColor: '#f3ece4',
    borderWidth: 1,
    borderColor: '#decebf',
    color: '#1f140e',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  buttonRow: {
    gap: 12,
  },
  primaryButton: {
    borderRadius: 18,
    backgroundColor: '#23120a',
    paddingHorizontal: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff8f0',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 18,
    backgroundColor: '#ead5c3',
    paddingHorizontal: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#412617',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.6,
  },
  loggedInText: {
    color: '#4e382b',
    fontSize: 14,
    lineHeight: 20,
  },
  capabilityList: {
    gap: 12,
  },
  capabilityRow: {
    borderRadius: 18,
    backgroundColor: '#f7ede2',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  capabilityCopy: {
    gap: 4,
  },
  capabilityTitle: {
    color: '#1f140e',
    fontSize: 16,
    fontWeight: '700',
  },
  capabilityMethod: {
    color: '#8a5d38',
    fontSize: 12,
    fontWeight: '700',
  },
  capabilityDescription: {
    color: '#5c473a',
    fontSize: 14,
    lineHeight: 20,
  },
  capabilityBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  capabilityReady: {
    backgroundColor: '#d6ecda',
  },
  capabilityPlanned: {
    backgroundColor: '#f3e3b9',
  },
  capabilityUnsupported: {
    backgroundColor: '#efd7d1',
  },
  capabilityBadgeText: {
    color: '#42281b',
    fontSize: 12,
    fontWeight: '700',
  },
})
