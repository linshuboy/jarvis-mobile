import { nativeTokens, roleTones } from '@agi/frontend/native'

const mobileSharedImportSmoke = {
  canvas: nativeTokens.color.surface.canvas,
  machineLabel: roleTones.machine.label,
}

if (!mobileSharedImportSmoke.canvas || mobileSharedImportSmoke.machineLabel !== '设备') {
  throw new Error('Mobile failed to consume shared frontend semantics')
}
