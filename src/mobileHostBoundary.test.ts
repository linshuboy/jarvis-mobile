import { createMobileCompanionView } from './mobileCompanionView'

const view = createMobileCompanionView({
  authenticated: true,
  bound: true,
  online: true,
  connectionState: 'connected',
  capabilities: [
    {
      method: 'host.fs.read',
      title: '读取文件',
      description: '桌面文件能力',
      platform: 'shared',
      status: 'ready',
      declare_on_runtime: true,
    },
    {
      method: 'host.exec.run',
      title: '运行命令',
      description: '桌面命令能力',
      platform: 'shared',
      status: 'ready',
      declare_on_runtime: true,
    },
  ],
})

if (JSON.stringify(view).includes('host.fs') || JSON.stringify(view).includes('host.exec')) {
  throw new Error('Mobile summary must not expose desktop host actions')
}
