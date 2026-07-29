import { createMobileCompanionView } from './mobileCompanionView'
import type { MobileCapabilityDescriptor } from './types'

const capabilities = [
  {
    method: 'mobile.status.snapshot',
    title: '状态',
    description: '读取移动端状态',
    platform: 'shared',
    status: 'ready',
    declare_on_runtime: true,
  },
  {
    method: 'host.exec.run',
    title: '命令',
    description: '桌面命令',
    platform: 'shared',
    status: 'ready',
    declare_on_runtime: true,
  },
] satisfies MobileCapabilityDescriptor[]

const companionView = createMobileCompanionView({
  authenticated: true,
  bound: true,
  online: true,
  connectionState: 'connected',
  capabilities,
})

if (companionView.primary.label !== '连接') {
  throw new Error('Mobile companion view did not prioritize connection state')
}

if (companionView.capabilities.items.some((item) => item.method.startsWith('host.'))) {
  throw new Error('Mobile companion view exposed host capabilities')
}

if (!companionView.capabilities.items.every((item) => item.method.startsWith('mobile.'))) {
  throw new Error('Mobile companion view must expose mobile-scoped capability semantics')
}
