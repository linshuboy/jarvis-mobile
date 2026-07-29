import { nativeTokens } from '@agi/frontend/native'
import type { LucideIcon } from 'lucide-react-native'
import { Aperture, Gauge, Grid3X3, Settings2 } from 'lucide-react-native'
import { useEffect, type ReactNode } from 'react'
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'

export const palette = {
  canvas: nativeTokens.color.surface.canvas,
  surface: nativeTokens.color.surface.solid,
  surfaceSoft: nativeTokens.color.surface.subtle,
  line: nativeTokens.color.intent.neutral.border,
  lineStrong: nativeTokens.color.intent.autonomy.border,
  ink: nativeTokens.color.text.primary,
  muted: nativeTokens.color.text.muted,
  teal: nativeTokens.color.intent.autonomy.foreground,
  blue: nativeTokens.color.intent.execution.foreground,
  orange: nativeTokens.color.intent.human.foreground,
  red: nativeTokens.color.intent.danger.foreground,
  white: nativeTokens.color.text.inverse,
}

export type MobileTabId = 'pulse' | 'capture' | 'capabilities' | 'settings'

const tabs: Array<{ id: MobileTabId; label: string; icon: LucideIcon }> = [
  { id: 'pulse', label: 'Pulse', icon: Gauge },
  { id: 'capture', label: '采集', icon: Aperture },
  { id: 'capabilities', label: '能力', icon: Grid3X3 },
  { id: 'settings', label: '设置', icon: Settings2 },
]

export function ScreenHeader({
  online,
  title,
  eyebrow = 'SUNVISAI MOBILE COMPANION',
}: {
  online: boolean
  title: string
  eyebrow?: string
}) {
  return (
    <View style={styles.appHeader}>
      <View style={styles.brandMark}>
        <View style={styles.brandCore} />
      </View>
      <View style={styles.headerCopy}>
        <Text style={styles.headerEyebrow}>{eyebrow}</Text>
        <Text numberOfLines={2} style={styles.headerTitle}>{title}</Text>
      </View>
      <View style={styles.headerStatus}>
        <StatusDot active={online} tone={online ? 'teal' : 'orange'} />
        <Text style={styles.headerStatusText}>{online ? 'ONLINE' : 'OFFLINE'}</Text>
      </View>
    </View>
  )
}

export function BottomNav({ activeTab, onChange }: { activeTab: MobileTabId; onChange: (tab: MobileTabId) => void }) {
  return (
    <View accessibilityRole="tablist" style={styles.bottomNav}>
      {tabs.map(({ id, label, icon: Icon }) => {
        const active = id === activeTab
        return (
          <Pressable
            accessibilityLabel={label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={id}
            onPress={() => onChange(id)}
            style={({ pressed }) => [styles.navItem, active && styles.navItemActive, pressed && styles.pressed]}
          >
            <Icon color={active ? palette.teal : '#819390'} size={19} strokeWidth={1.8} />
            <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function SurfacePanel({
  eyebrow,
  title,
  children,
  style,
}: {
  eyebrow?: string
  title?: string
  children: ReactNode
  style?: object
}) {
  return (
    <View style={[styles.glassPanel, style]}>
      {eyebrow || title ? (
        <View style={styles.panelHeader}>
          {eyebrow ? <Text style={styles.panelEyebrow}>{eyebrow}</Text> : null}
          {title ? <Text style={styles.panelTitle}>{title}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  )
}

export function StatusDot({ active, tone = 'teal' }: { active: boolean; tone?: 'teal' | 'blue' | 'orange' | 'red' }) {
  const color = tone === 'blue' ? palette.blue : tone === 'orange' ? palette.orange : tone === 'red' ? palette.red : palette.teal
  return <View style={[styles.statusDot, { borderColor: color }, active && { backgroundColor: color, shadowColor: color }]} />
}

export function ActionButton({
  icon: Icon,
  label,
  onPress,
  disabled = false,
  tone = 'secondary',
}: {
  icon: LucideIcon
  label: string
  onPress: () => void
  disabled?: boolean
  tone?: 'primary' | 'secondary' | 'danger'
}) {
  const primary = tone === 'primary'
  const danger = tone === 'danger'
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        primary && styles.actionButtonPrimary,
        danger && styles.actionButtonDanger,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <Icon color={primary ? palette.white : danger ? palette.red : palette.ink} size={17} strokeWidth={1.9} />
      <Text style={[styles.actionButtonText, primary && styles.actionButtonTextPrimary, danger && styles.actionButtonTextDanger]}>{label}</Text>
    </Pressable>
  )
}

export function IconAction({
  icon: Icon,
  label,
  onPress,
  disabled = false,
  tone = 'teal',
}: {
  icon: LucideIcon
  label: string
  onPress: () => void
  disabled?: boolean
  tone?: 'teal' | 'blue' | 'orange'
}) {
  const color = tone === 'blue' ? palette.blue : tone === 'orange' ? palette.orange : palette.teal
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.iconAction, { borderColor: `${color}42` }, (pressed || disabled) && styles.pressed]}
    >
      <Icon color={color} size={18} strokeWidth={1.9} />
    </Pressable>
  )
}

export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  secureTextEntry?: boolean
  keyboardType?: 'default' | 'url'
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8da09d"
        secureTextEntry={secureTextEntry}
        style={styles.input}
        value={value}
      />
    </View>
  )
}

export function DataRow({ label, value, mono = false, tone }: { label: string; value: string; mono?: boolean; tone?: 'teal' | 'orange' | 'red' }) {
  const color = tone === 'teal' ? palette.teal : tone === 'orange' ? palette.orange : tone === 'red' ? palette.red : palette.ink
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text numberOfLines={2} style={[styles.dataValue, mono && styles.mono, { color }]}>{value}</Text>
    </View>
  )
}

export function Notice({ message, tone }: { message: string; tone: 'success' | 'error' }) {
  useEffect(() => {
    if (Platform.OS === 'ios' && tone === 'success' && message) {
      AccessibilityInfo.announceForAccessibility(message)
    }
  }, [message, tone])

  return (
    <View
      accessibilityLiveRegion={tone === 'error' ? 'assertive' : 'polite'}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={[styles.notice, tone === 'error' ? styles.noticeError : styles.noticeSuccess]}
    >
      <Text style={[styles.noticeText, tone === 'error' ? styles.noticeTextError : styles.noticeTextSuccess]}>{message}</Text>
    </View>
  )
}

export const styles = StyleSheet.create({
  appHeader: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
    backgroundColor: 'rgba(247,252,251,0.88)',
  },
  brandMark: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.lineStrong, borderRadius: 6 },
  brandCore: { width: 7, height: 7, backgroundColor: palette.teal, borderRadius: 2, transform: [{ rotate: '45deg' }] },
  headerCopy: { flex: 1, minWidth: 0, marginLeft: 10 },
  headerEyebrow: { color: palette.teal, fontSize: 11, fontWeight: '700' },
  headerTitle: { marginTop: 1, color: palette.ink, fontSize: 14, fontWeight: '600' },
  headerStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerStatusText: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  bottomNav: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 10,
    paddingTop: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
    backgroundColor: 'rgba(249,253,252,0.96)',
  },
  navItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 3, borderTopWidth: 2, borderTopColor: 'transparent' },
  navItemActive: { borderTopColor: palette.teal },
  navLabel: { color: '#667a77', fontSize: 11, fontWeight: '600' },
  navLabelActive: { color: palette.teal },
  glassPanel: {
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
    borderRadius: 8,
    backgroundColor: palette.surface,
    shadowColor: '#315d59',
    shadowOpacity: 0.09,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  panelHeader: { marginBottom: 13 },
  panelEyebrow: { color: palette.teal, fontSize: 11, fontWeight: '700' },
  panelTitle: { marginTop: 3, color: palette.ink, fontSize: 16, fontWeight: '700', letterSpacing: 0 },
  statusDot: { width: 7, height: 7, borderWidth: 1, borderRadius: 4, shadowOpacity: 0.5, shadowRadius: 6 },
  actionButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 6,
    backgroundColor: palette.surfaceSoft,
  },
  actionButtonPrimary: { borderColor: palette.teal, backgroundColor: palette.teal, shadowColor: palette.teal, shadowOpacity: 0.19, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  actionButtonDanger: { borderColor: 'rgba(195,59,72,0.22)', backgroundColor: 'rgba(195,59,72,0.06)' },
  actionButtonText: { color: palette.ink, fontSize: 12, fontWeight: '600' },
  actionButtonTextPrimary: { color: palette.white },
  actionButtonTextDanger: { color: palette.red },
  iconAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.7)' },
  pressed: { opacity: 0.48 },
  field: { gap: 6, marginBottom: 11 },
  fieldLabel: { color: palette.muted, fontSize: 12, fontWeight: '500' },
  input: { height: 48, paddingHorizontal: 11, borderWidth: 1, borderColor: palette.line, borderRadius: 5, color: palette.ink, backgroundColor: 'rgba(255,255,255,0.76)', fontSize: 13 },
  dataRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line },
  dataLabel: { color: palette.muted, fontSize: 12 },
  dataValue: { flex: 1, textAlign: 'right', color: palette.ink, fontSize: 12, fontWeight: '600' },
  mono: { fontFamily: 'monospace', fontSize: 11 },
  notice: { marginHorizontal: 16, marginTop: 8, paddingHorizontal: 12, paddingVertical: 9, borderLeftWidth: 2 },
  noticeSuccess: { borderLeftColor: palette.teal, backgroundColor: 'rgba(0,148,140,0.07)' },
  noticeError: { borderLeftColor: palette.red, backgroundColor: 'rgba(195,59,72,0.07)' },
  noticeText: { fontSize: 12, lineHeight: 17 },
  noticeTextSuccess: { color: '#08746d' },
  noticeTextError: { color: '#a8323d' },
})
