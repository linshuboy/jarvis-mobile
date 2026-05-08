import { createMobileCompanionSummary } from '@agi/frontend/native'

import type { MobileCapabilityDescriptor } from './types'

export type MobileCompanionViewInput = {
  authenticated: boolean
  bound: boolean
  online: boolean
  connectionState: string
  capabilities: MobileCapabilityDescriptor[]
}

export function createMobileCompanionView(input: MobileCompanionViewInput) {
  return createMobileCompanionSummary({
    status: {
      authenticated: input.authenticated,
      bound: input.bound,
      online: input.online,
      connectionState: input.connectionState,
      capabilityCount: input.capabilities.length,
    },
    capabilities: input.capabilities,
  })
}
