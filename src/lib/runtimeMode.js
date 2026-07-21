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

export const FRONTEND_PREVIEW_SESSION_KEY = 'dtsv.frontend-preview.session'

export function createFrontendPreviewUser({ email, username } = {}) {
  const safeEmail = String(email || FRONTEND_PREVIEW_USER.email).trim()
  const safeUsername = String(username || safeEmail.split('@')[0] || 'kanata').trim()

  return {
    ...FRONTEND_PREVIEW_USER,
    email: safeEmail,
    user_metadata: {
      ...FRONTEND_PREVIEW_USER.user_metadata,
      username: safeUsername,
    },
  }
}

export function isFrontendPreviewMode(hasBackendConfig) {
  return process.env.NEXT_PUBLIC_APP_MODE === 'frontend' || !hasBackendConfig
}
