'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import KaleidoAvgView from '@/app/game/[id]/kaleido/KaleidoAvgView'
import { useAuth } from '@/app/_shell/RootShell'

export default function FrontendPlayPage() {
  const router = useRouter()
  const { user, loading, frontendOnly, logout } = useAuth()

  useEffect(() => {
    if (!loading && frontendOnly && !user) router.replace('/')
  }, [frontendOnly, loading, router, user])

  if (loading || (frontendOnly && !user)) {
    return <div style={{ width: '100%', height: '100dvh', background: '#05070c' }} />
  }

  async function handleExit() {
    await logout()
    router.replace('/')
  }

  return (
    <div style={{ width: '100%', height: '100dvh', background: '#05070c' }}>
      <KaleidoAvgView onExit={handleExit} />
    </div>
  )
}
