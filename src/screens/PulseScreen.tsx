import { Activity, ArrowUpRight, CircleCheck, Radio } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { MobileCompanionSnapshot } from '../types'
import { DataRow, ScreenHeader, SurfacePanel, palette } from '../ui/spatial'

type StatusItem = { label: string; value: string; accent: string }

export function PulseScreen({
  snapshot,
  primary,
  statusItems,
  onOpenCapture,
}: {
  snapshot: MobileCompanionSnapshot | null
  primary: { label: string; value: string }
  statusItems: StatusItem[]
  onOpenCapture: () => void
}) {
  const online = Boolean(snapshot?.connection.online)

  return (
    <View style={screenStyles.screen}>
      <View style={screenStyles.screenHeader}>
        <ScreenHeader eyebrow="COMPANION PULSE" online={online} title="状态脉冲" />
      </View>

      <View accessible accessibilityLiveRegion="polite" style={screenStyles.runCue}>
        {snapshot ? <CircleCheck color={palette.teal} size={18} /> : <Radio color={palette.orange} size={18} />}
        <View style={screenStyles.runCueCopy}>
          <Text style={screenStyles.runCueEyebrow}>SYNC STATE</Text>
          <Text style={screenStyles.runCueTitle}>{snapshot ? '状态同步完成' : '等待状态同步'}</Text>
          <Text style={screenStyles.runCueDetail}>{primary.value}</Text>
        </View>
      </View>

      <SurfacePanel eyebrow="CAPABILITY SUMMARY" style={screenStyles.summarySheet} title="移动能力摘要">
        {statusItems.map((item) => (
          <View key={item.label} style={screenStyles.summaryRow}>
            <View style={[screenStyles.summarySignal, { backgroundColor: item.accent }]} />
            <Text style={screenStyles.summaryLabel}>{item.label}</Text>
            <Text numberOfLines={2} style={screenStyles.summaryValue}>{item.value}</Text>
          </View>
        ))}
        <DataRow label="Runtime" mono value={snapshot?.runtime.runtime_id || '正在生成'} />
        {snapshot?.connection.last_error ? <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={screenStyles.errorText}>{snapshot.connection.last_error}</Text> : null}
        <Pressable
          accessibilityHint="打开相机、音频或定位采集选项"
          accessibilityLabel="打开移动采集"
          accessibilityRole="button"
          onPress={onOpenCapture}
          style={({ pressed }) => [screenStyles.nextAction, pressed && { opacity: 0.5 }]}
        >
          <Activity color={palette.blue} size={16} />
          <View style={screenStyles.nextActionCopy}>
            <Text style={screenStyles.nextActionEyebrow}>NEXT ACTION</Text>
            <Text style={screenStyles.nextActionTitle}>打开移动采集</Text>
          </View>
          <ArrowUpRight color={palette.blue} size={17} />
        </Pressable>
      </SurfacePanel>
    </View>
  )
}

const screenStyles = StyleSheet.create({
  screen: { minHeight: 720, paddingHorizontal: 16, paddingBottom: 18 },
  screenHeader: { zIndex: 4, marginHorizontal: -16 },
  runCue: {
    zIndex: 2,
    alignSelf: 'flex-end',
    width: '52%',
    minWidth: 168,
    maxWidth: 220,
    flexDirection: 'row',
    gap: 9,
    marginTop: 24,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderLeftWidth: 1,
    borderLeftColor: palette.lineStrong,
    backgroundColor: 'rgba(255,255,255,0.58)',
  },
  runCueCopy: { flex: 1, minWidth: 0 },
  runCueEyebrow: { color: palette.teal, fontSize: 11, fontWeight: '700' },
  runCueTitle: { marginTop: 2, color: palette.ink, fontSize: 13, fontWeight: '700' },
  runCueDetail: { marginTop: 3, color: palette.muted, fontSize: 12 },
  summarySheet: { zIndex: 3, marginTop: 20, backgroundColor: 'rgba(255,255,255,0.9)' },
  summaryRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  summarySignal: { width: 4, height: 4, borderRadius: 2 },
  summaryLabel: { width: 62, color: palette.muted, fontSize: 11 },
  summaryValue: { flex: 1, color: palette.ink, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  errorText: { paddingVertical: 8, color: palette.red, fontSize: 12, lineHeight: 17 },
  nextAction: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  nextActionCopy: { flex: 1 },
  nextActionEyebrow: { color: palette.blue, fontSize: 11, fontWeight: '700' },
  nextActionTitle: { marginTop: 2, color: palette.ink, fontSize: 13, fontWeight: '600' },
})
