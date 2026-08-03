import { useTenantFeature } from '../hooks/useTenantFeature'

export function FeatureGate({ feature, children, fallback = null }) {
  const enabled = useTenantFeature(feature)

  return enabled ? children : fallback
}
