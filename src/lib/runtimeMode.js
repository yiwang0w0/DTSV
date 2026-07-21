export const FRONTEND_PREVIEW_USER = Object.freeze({
  id: 'frontend-preview',
  email: 'kanata@farstar.local',
  user_metadata: {
    username: 'kanata',
    groups: ['user'],
  },
  app_metadata: {
    provider: 'preview',
    providers: ['preview'],
  },
})

export function isFrontendPreviewMode(hasBackendConfig) {
  return process.env.NEXT_PUBLIC_APP_MODE === 'frontend' || !hasBackendConfig
}
