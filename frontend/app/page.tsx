'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    authApi.checkSetup()
      .then((res) => {
        if (res.data.has_users) {
          router.replace('/login')
        } else {
          router.replace('/register?setup=true')
        }
      })
      .catch(() => {
        router.replace('/login')
      })
  }, [router])

  return null
}
