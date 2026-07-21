'use client'

import { useRouter } from 'next/navigation'
import KaleidoAvgView from '@/app/game/[id]/kaleido/KaleidoAvgView'

export default function FrontendPlayPage() {
  const router = useRouter()

  return (
    <div style={{ width: '100%', height: '100dvh', background: '#05070c' }}>
      <KaleidoAvgView onExit={() => router.push('/')} />
    </div>
  )
}
