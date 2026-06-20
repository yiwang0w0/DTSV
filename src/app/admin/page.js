'use client'
import { Suspense } from 'react'
import { Spinner } from './_shared/ui'
import AdminPageInner from './AdminPageInner'

// 薄壳：把逻辑下沉到 AdminPageInner，并用 <Suspense> 包裹——AdminPageInner 用 useSearchParams
// 做 URL 同步（?tab=），Next.js App Router 要求其在 Suspense 边界内（根 layout 无 Suspense）。
export default function AdminPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AdminPageInner />
    </Suspense>
  )
}
