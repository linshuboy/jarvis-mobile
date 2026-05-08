import { nativeTokens, roleTones } from '@agi/frontend'

const mobileSharedImportSmoke = {
  canvas: nativeTokens.color.background.canvas,
  machineLabel: roleTones.machine.label,
}

if (!mobileSharedImportSmoke.canvas || mobileSharedImportSmoke.machineLabel !== '设备') {
  throw new Error('Mobile failed to consume shared frontend semantics')
}
