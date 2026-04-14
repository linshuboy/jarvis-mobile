import { Platform } from 'react-native'

import type { MobileCapabilityDescriptor } from '../types'

const SHARED_CAPABILITIES: MobileCapabilityDescriptor[] = [
  {
    method: 'mobile.status.snapshot',
    title: '设备状态快照',
    description: '当前工程已接线的最小 companion 面，用于上报当前设备运行状态与能力摘要。',
    platform: 'shared',
    status: 'ready',
    declare_on_runtime: true,
  },
  {
    method: 'notify.push',
    title: '推送通知',
    description: '后续用于任务完成通知、审批通知和拉起移动端交互入口。',
    platform: 'shared',
    status: 'planned',
    declare_on_runtime: false,
  },
  {
    method: 'approval.respond',
    title: '审批响应',
    description: '移动端作为通知与审批终端，后续会在同一 companion 工程里接入。',
    platform: 'shared',
    status: 'planned',
    declare_on_runtime: false,
  },
  {
    method: 'location.get',
    title: '单次定位',
    description: '作为轻量采集能力保留在 mobile component，不进入 hostd 执行面。',
    platform: 'shared',
    status: 'ready',
    declare_on_runtime: true,
  },
  {
    method: 'camera.capture',
    title: '拍照',
    description: '拍照属于移动伴随能力，会在相机权限接线后开放。',
    platform: 'shared',
    status: 'ready',
    declare_on_runtime: true,
  },
  {
    method: 'photo.pick',
    title: '相册选择',
    description: '用于从本机媒体库选择图片，不承担文件系统主机职责。',
    platform: 'shared',
    status: 'planned',
    declare_on_runtime: false,
  },
  {
    method: 'audio.record',
    title: '录音',
    description: '后续用于短时语音输入或辅助采集，不做后台长期录制代理。',
    platform: 'shared',
    status: 'ready',
    declare_on_runtime: true,
  },
]

const IOS_CAPABILITIES: MobileCapabilityDescriptor[] = [
  {
    method: 'screen.capture',
    title: '系统级截图',
    description: 'iOS 不承诺通用全局截图能力，不作为正式 mobile surface。',
    platform: 'ios',
    status: 'unsupported',
    declare_on_runtime: false,
  },
  {
    method: 'notifications.read',
    title: '读取其他 App 通知',
    description: 'iOS 不提供通用通知读取能力，不进入统一 companion 承诺面。',
    platform: 'ios',
    status: 'unsupported',
    declare_on_runtime: false,
  },
]

const ANDROID_CAPABILITIES: MobileCapabilityDescriptor[] = [
  {
    method: 'screen.capture',
    title: '屏幕捕获',
    description: 'Android 后续可在显式授权后接入 MediaProjection，但不作为首批必做能力。',
    platform: 'android',
    status: 'planned',
    declare_on_runtime: false,
  },
  {
    method: 'notifications.read',
    title: '通知读取',
    description: 'Android 后续可通过 NotificationListenerService 接入，和 iOS 分层处理。',
    platform: 'android',
    status: 'planned',
    declare_on_runtime: false,
  },
]

export function platformLabel(): string {
  switch (Platform.OS) {
    case 'ios':
      return 'iOS Companion'
    case 'android':
      return 'Android Companion'
    default:
      return 'Mobile Companion'
  }
}

export function mobileCapabilities(): MobileCapabilityDescriptor[] {
  if (Platform.OS === 'ios') {
    return [...SHARED_CAPABILITIES, ...IOS_CAPABILITIES]
  }
  if (Platform.OS === 'android') {
    return [...SHARED_CAPABILITIES, ...ANDROID_CAPABILITIES]
  }
  return [...SHARED_CAPABILITIES]
}

export function declaredRuntimeMethods(): string[] {
  return mobileCapabilities()
    .filter((item) => item.declare_on_runtime)
    .map((item) => item.method)
}
