import { Download, Link2, LogOut, RefreshCw } from 'lucide-react-native'
import { StyleSheet, View } from 'react-native'

import type { MobileClientUpdateCheck, MobileCompanionSnapshot, MobileCompanionState } from '../types'
import { ActionButton, DataRow, FormField, Notice, ScreenHeader, SurfacePanel } from '../ui/spatial'

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '未记录'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

export function SettingsScreen({
  snapshot,
  auth,
  pending,
  update,
  updatePending,
  updateProxy,
  updateMessage,
  updateError,
  onUpdateProxyChange,
  onRebind,
  onLogout,
  onCheckUpdate,
  onDownloadUpdate,
}: {
  snapshot: MobileCompanionSnapshot | null
  auth: MobileCompanionState | null
  pending: boolean
  update: MobileClientUpdateCheck | null
  updatePending: boolean
  updateProxy: string
  updateMessage: string
  updateError: string
  onUpdateProxyChange: (value: string) => void
  onRebind: () => void
  onLogout: () => void
  onCheckUpdate: () => void
  onDownloadUpdate: () => void
}) {
  return (
    <View style={screenStyles.screen}>
      <View style={screenStyles.screenHeader}>
        <ScreenHeader eyebrow="COMPANION CONTROL" online={Boolean(snapshot?.connection.online)} title="连接与设置" />
      </View>

      <SurfacePanel eyebrow="ACCOUNT" title={auth?.user?.display_name || auth?.user?.username || '当前账号'}>
        <DataRow label="角色" value={auth?.user?.role || 'unknown'} />
        <DataRow label="服务地址" mono value={auth?.server_url || '未配置'} />
        <DataRow label="设备绑定" tone={snapshot?.binding ? 'teal' : 'orange'} value={snapshot?.binding?.pairing_state || '等待绑定'} />
        <DataRow label="最近连接" value={formatTimestamp(snapshot?.connection.last_connected_at)} />
        <View style={screenStyles.actionRow}>
          <ActionButton disabled={pending} icon={Link2} label="重新绑定" onPress={onRebind} />
          <ActionButton disabled={pending} icon={LogOut} label="退出账号" onPress={onLogout} tone="danger" />
        </View>
      </SurfacePanel>

      <SurfacePanel eyebrow="CLIENT UPDATE" title="客户端更新">
        <FormField keyboardType="url" label="更新代理 URL" onChangeText={onUpdateProxyChange} placeholder="https://proxy.example/{url}" value={updateProxy} />
        <DataRow label="当前版本" value={update?.current_version || '0.1.22'} />
        <DataRow label="最新版本" value={update?.latest_version || '尚未检查'} />
        <DataRow label="状态" tone={update?.update_available ? 'orange' : update ? 'teal' : undefined} value={update ? update.update_available ? '发现新版本' : '已是最新' : '未检查'} />
        <DataRow label="匹配安装包" mono value={update?.asset?.name || '未匹配'} />
        <View style={screenStyles.actionRow}>
          <ActionButton disabled={updatePending} icon={RefreshCw} label={updatePending ? '处理中' : '检查更新'} onPress={onCheckUpdate} />
          <ActionButton disabled={updatePending || !update?.asset} icon={Download} label="下载" onPress={onDownloadUpdate} tone="primary" />
        </View>
        {updateMessage ? <Notice message={updateMessage} tone="success" /> : null}
        {updateError ? <Notice message={updateError} tone="error" /> : null}
      </SurfacePanel>

      <SurfacePanel eyebrow="DEVICE IDENTITY" title="本机身份">
        <DataRow label="Runtime ID" mono value={snapshot?.runtime.runtime_id || '未生成'} />
        <DataRow label="平台" value={snapshot?.runtime.platform_label || 'Mobile Companion'} />
        <DataRow label="Gateway" mono value={snapshot?.connection.gateway_ws_url || '未派生'} />
        <DataRow label="心跳" value={`${snapshot?.connection.heartbeat_seconds || 0}s`} />
      </SurfacePanel>
    </View>
  )
}

const screenStyles = StyleSheet.create({
  screen: { gap: 12, paddingHorizontal: 16, paddingBottom: 24 },
  screenHeader: { marginHorizontal: -16 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 },
})
