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
  const semanticCapabilities = input.capabilities.map((capability) => {
    if (capability.method.startsWith('host.') || capability.method.startsWith('mobile.')) {
      return capability
    }
    return {
      ...capability,
      method: `mobile.${capability.method}`,
    }
  })

  return createMobileCompanionSummary({
    status: {
      authenticated: input.authenticated,
      bound: input.bound,
      online: input.online,
      connectionState: input.connectionState,
      capabilityCount: input.capabilities.length,
    },
    capabilities: semanticCapabilities,
  })
}
