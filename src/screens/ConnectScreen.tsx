import { LockKeyhole, LogIn, ShieldCheck } from 'lucide-react-native'
import { StyleSheet, Text, View } from 'react-native'

import { ActionButton, FormField, ScreenHeader, StatusDot, SurfacePanel, palette } from '../ui/spatial'

export type ConnectScreenProps = {
  serverUrl: string
  username: string
  password: string
  pending: boolean
  bootstrapReady: boolean
  onServerUrlChange: (value: string) => void
  onUsernameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onLogin: () => void
}

export function ConnectScreen({
  serverUrl,
  username,
  password,
  pending,
  bootstrapReady,
  onServerUrlChange,
  onUsernameChange,
  onPasswordChange,
  onLogin,
}: ConnectScreenProps) {
  const canSubmit = bootstrapReady && serverUrl.trim().length > 0 && username.trim().length > 0 && password.length > 0 && !pending

  return (
    <View style={screenStyles.screen}>
      <View style={screenStyles.screenHeader}>
        <ScreenHeader eyebrow="CONNECT & BIND" online={false} title="连接与绑定" />
      </View>
      <View style={screenStyles.connectionCue}>
        <StatusDot active={false} tone="orange" />
        <View>
          <Text style={screenStyles.cueLabel}>CONNECTION CUE</Text>
          <Text style={screenStyles.cueValue}>等待账号与设备绑定</Text>
        </View>
      </View>

      <SurfacePanel eyebrow="CONNECT & BIND" style={screenStyles.sheet} title="连接控制面">
        <FormField keyboardType="url" label="Server" onChangeText={onServerUrlChange} placeholder="https://sunvisai.example.com" value={serverUrl} />
        <FormField label="Account" onChangeText={onUsernameChange} placeholder="账号" value={username} />
        <FormField label="Password" onChangeText={onPasswordChange} placeholder="密码" secureTextEntry value={password} />
        {!bootstrapReady ? <Text style={screenStyles.warning}>服务端尚未初始化，请先在 Web 完成初始化。</Text> : null}
        <ActionButton disabled={!canSubmit} icon={LogIn} label={pending ? '正在连接' : '登录并自动绑定'} onPress={onLogin} tone="primary" />
        <View style={screenStyles.securityLine}>
          <ShieldCheck color={palette.teal} size={15} strokeWidth={1.8} />
          <Text style={screenStyles.securityText}>本地安全存储</Text>
          <LockKeyhole color={palette.muted} size={13} strokeWidth={1.8} />
        </View>
      </SurfacePanel>
    </View>
  )
}

const screenStyles = StyleSheet.create({
  screen: { minHeight: 820, paddingHorizontal: 16, paddingBottom: 24 },
  screenHeader: { zIndex: 4, marginHorizontal: -16 },
  connectionCue: {
    zIndex: 2,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 24,
    marginLeft: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderLeftWidth: 1,
    borderLeftColor: palette.lineStrong,
    backgroundColor: 'rgba(255,255,255,0.48)',
  },
  cueLabel: { color: palette.teal, fontSize: 8, fontWeight: '700' },
  cueValue: { marginTop: 2, color: palette.ink, fontSize: 10, fontWeight: '600' },
  sheet: { zIndex: 3, marginTop: 16, backgroundColor: 'rgba(255,255,255,0.9)' },
  warning: { marginBottom: 12, color: palette.orange, fontSize: 10, lineHeight: 15 },
  securityLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 13 },
  securityText: { color: palette.muted, fontSize: 9 },
})
