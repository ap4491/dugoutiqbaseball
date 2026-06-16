'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { openBillingPortal } from '@/lib/actions/billing'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface BillingPortalProps {
  className?: string
  label?: string
}

export function BillingPortal({ className, label = 'Manage Billing' }: BillingPortalProps) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    try {
      const result = await openBillingPortal()
      if (result?.url) {
        window.location.href = result.url
      } else if (result?.error) {
        toast.error(result.error)
      }
    } catch {
      toast.error('Failed to open billing portal')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      variant="outline"
      className={cn('border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800', className)}
    >
      <ExternalLink className="w-4 h-4 mr-2" />
      {loading ? 'Loading...' : label}
    </Button>
  )
}
