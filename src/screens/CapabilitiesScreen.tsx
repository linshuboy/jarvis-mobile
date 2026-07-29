import { CheckCircle2, Clock3, MinusCircle } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'

import { ScreenHeader, SurfacePanel, palette } from '../ui/spatial'

type CapabilityItem = {
  method: string
  title: string
  description: string
  status: string
}

export function CapabilitiesScreen({ items, online }: { items: CapabilityItem[]; online: boolean }) {
  return (
    <View style={screenStyles.screen}>
      <View style={screenStyles.screenHeader}>
        <ScreenHeader eyebrow="MOBILE SURFACE" online={online} title="能力边界" />
      </View>

      <View style={screenStyles.matrix}>
        {items.map((item) => {
          const ready = item.status === 'ready'
          const planned = item.status === 'planned'
          const Icon = ready ? CheckCircle2 : planned ? Clock3 : MinusCircle
          const tone = ready ? palette.teal : planned ? palette.blue : palette.muted
          return (
            <SurfacePanel key={item.method} style={screenStyles.item}>
              <View style={screenStyles.itemHeader}>
                <Icon color={tone} size={17} strokeWidth={1.8} />
                <Text style={screenStyles.itemTitle}>{item.title}</Text>
                <Text style={[screenStyles.itemStatus, { color: tone }]}>{ready ? 'READY' : planned ? 'PLANNED' : 'UNAVAILABLE'}</Text>
              </View>
              <Text style={screenStyles.itemMethod}>{item.method}</Text>
              <Text style={screenStyles.itemDescription}>{item.description}</Text>
            </SurfacePanel>
          )
        })}
      </View>
      {items.length === 0 ? <Text style={screenStyles.empty}>没有可展示的移动能力</Text> : null}
    </View>
  )
}

const screenStyles = StyleSheet.create({
  screen: { paddingHorizontal: 16, paddingBottom: 24 },
  screenHeader: { marginHorizontal: -16, marginBottom: 14 },
  matrix: { gap: 9 },
  item: { paddingVertical: 14 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTitle: { flex: 1, color: palette.ink, fontSize: 12, fontWeight: '700' },
  itemStatus: { fontSize: 8, fontWeight: '700' },
  itemMethod: { marginTop: 11, color: palette.teal, fontSize: 9, fontFamily: 'monospace' },
  itemDescription: { marginTop: 7, color: palette.muted, fontSize: 10, lineHeight: 16 },
  empty: { paddingVertical: 48, color: palette.muted, fontSize: 11, textAlign: 'center' },
})
