import { Camera, LocateFixed, MapPin, Mic, ShieldAlert } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'

import type { MobileCompanionSnapshot } from '../types'
import { IconAction, ScreenHeader, SurfacePanel, palette } from '../ui/spatial'

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '未采集'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function featureIssue(supported: boolean | undefined, value: string | null | undefined): string {
  if (!value) return ''
  if (supported === false) return '当前平台不可用'
  return value
    .replaceAll('location.get', 'mobile.location.get')
    .replaceAll('camera.capture', 'mobile.camera.capture')
    .replaceAll('audio.record', 'mobile.audio.record')
}

export function CaptureScreen({
  snapshot,
  pending,
  onRefreshLocation,
  onCapturePhoto,
  onRecordAudio,
}: {
  snapshot: MobileCompanionSnapshot | null
  pending: boolean
  onRefreshLocation: () => void
  onCapturePhoto: () => void
  onRecordAudio: () => void
}) {
  return (
    <View style={screenStyles.screen}>
      <View style={screenStyles.screenHeader}>
        <ScreenHeader eyebrow="CAPTURE & DECIDE" online={Boolean(snapshot?.connection.online)} title="采集与决策" />
      </View>

      <SurfacePanel eyebrow="CAPTURE CONSOLE" style={screenStyles.console} title="前台能力">
        <View style={screenStyles.capabilityRow}>
          <View style={screenStyles.capabilityIcon}><MapPin color={palette.teal} size={19} /></View>
          <View style={screenStyles.capabilityCopy}>
            <Text style={screenStyles.capabilityMethod}>mobile.location.get</Text>
            <Text style={screenStyles.capabilityState}>{snapshot?.location.permission_status === 'granted' ? '前台可用' : '需要授权'}</Text>
            <Text numberOfLines={1} style={screenStyles.capabilityTime}>
              {snapshot?.location.last_fix ? `${snapshot.location.last_fix.latitude.toFixed(4)}, ${snapshot.location.last_fix.longitude.toFixed(4)}` : formatTimestamp(snapshot?.location.updated_at)}
            </Text>
          </View>
          <IconAction disabled={pending} icon={LocateFixed} label="授权并刷新位置" onPress={onRefreshLocation} />
          {featureIssue(snapshot?.location.supported, snapshot?.location.last_error) ? <Text style={screenStyles.capabilityError}>{featureIssue(snapshot?.location.supported, snapshot?.location.last_error)}</Text> : null}
        </View>

        <View style={screenStyles.capabilityRow}>
          <View style={screenStyles.capabilityIcon}><Camera color={palette.blue} size={19} /></View>
          <View style={screenStyles.capabilityCopy}>
            <Text style={screenStyles.capabilityMethod}>mobile.camera.capture</Text>
            <Text style={screenStyles.capabilityState}>{snapshot?.camera.permission_status === 'granted' ? '前台可用' : '需要授权'}</Text>
            <Text numberOfLines={1} style={screenStyles.capabilityTime}>
              {snapshot?.camera.last_capture?.file_name || formatTimestamp(snapshot?.camera.updated_at)}
            </Text>
          </View>
          <IconAction disabled={pending} icon={Camera} label="打开相机" onPress={onCapturePhoto} tone="blue" />
          {featureIssue(snapshot?.camera.supported, snapshot?.camera.last_error) ? <Text style={screenStyles.capabilityError}>{featureIssue(snapshot?.camera.supported, snapshot?.camera.last_error)}</Text> : null}
        </View>

        <View style={screenStyles.capabilityRow}>
          <View style={screenStyles.capabilityIcon}><Mic color={palette.orange} size={19} /></View>
          <View style={screenStyles.capabilityCopy}>
            <Text style={screenStyles.capabilityMethod}>mobile.audio.record</Text>
            <Text style={screenStyles.capabilityState}>{snapshot?.audio.permission_status === 'granted' ? '前台可用' : '需要授权'}</Text>
            <Text numberOfLines={1} style={screenStyles.capabilityTime}>
              {snapshot?.audio.last_capture ? `${snapshot.audio.last_capture.duration_ms || 0} ms` : formatTimestamp(snapshot?.audio.updated_at)}
            </Text>
          </View>
          <IconAction disabled={pending} icon={Mic} label="录制 5 秒" onPress={onRecordAudio} tone="orange" />
          {featureIssue(snapshot?.audio.supported, snapshot?.audio.last_error) ? <Text style={screenStyles.capabilityError}>{featureIssue(snapshot?.audio.supported, snapshot?.audio.last_error)}</Text> : null}
        </View>
      </SurfacePanel>

      <View style={screenStyles.decisionBoundary}>
        <ShieldAlert color={palette.orange} size={18} strokeWidth={1.8} />
        <View style={screenStyles.decisionCopy}>
          <Text style={screenStyles.decisionEyebrow}>APPROVAL SUMMARY</Text>
          <Text style={screenStyles.decisionText}>移动端暂不直接批准生产发布</Text>
        </View>
      </View>
    </View>
  )
}

const screenStyles = StyleSheet.create({
  screen: { minHeight: 720, gap: 12, paddingHorizontal: 16, paddingBottom: 18 },
  screenHeader: { zIndex: 4, marginHorizontal: -16 },
  console: { zIndex: 3, marginTop: 20, backgroundColor: 'rgba(255,255,255,0.9)' },
  capabilityRow: { minHeight: 88, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  capabilityIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.55)' },
  capabilityCopy: { flex: 1 },
  capabilityMethod: { color: palette.teal, fontSize: 8, fontFamily: 'monospace' },
  capabilityState: { marginTop: 2, color: palette.ink, fontSize: 11, fontWeight: '700' },
  capabilityTime: { marginTop: 2, color: palette.muted, fontSize: 8, fontFamily: 'monospace' },
  capabilityError: { width: '100%', marginLeft: 46, color: palette.red, fontSize: 8, lineHeight: 12 },
  decisionBoundary: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderLeftWidth: 2, borderLeftColor: palette.orange, backgroundColor: 'rgba(255,255,255,0.58)' },
  decisionCopy: { flex: 1 },
  decisionEyebrow: { color: palette.orange, fontSize: 8, fontWeight: '700' },
  decisionText: { marginTop: 3, color: palette.ink, fontSize: 10, fontWeight: '600' },
})
