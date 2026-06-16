'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { createCheckoutSession } from '@/lib/actions/billing'

interface Plan {
  id: string
  name: string
  price: number
  credits: number
  priceId?: string
}

interface PlanCardProps {
  plan: Plan
  currentPlanId: string
  userId: string
  stripeCustomerId?: string | null
}

const planFeatures: Record<string, string[]> = {
  free: ['3 videos per month', 'All styles', 'Up to 15s duration', 'Standard quality'],
  pro: ['50 videos per month', 'All styles', 'Up to 30s duration', 'HD quality', 'Priority processing'],
  business: ['Unlimited videos', 'All styles', 'Up to 30s duration', '4K quality', 'Priority + API access'],
}

export function PlanCard({ plan, currentPlanId, userId, stripeCustomerId }: PlanCardProps) {
  const [loading, setLoading] = useState(false)
  const isCurrentPlan = plan.id === currentPlanId
  const isFree = plan.id === 'free'

  const handleUpgrade = async () => {
    if (isFree || isCurrentPlan) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.set('planId', plan.id)
      formData.set('userId', userId)
      if (stripeCustomerId) {
        formData.set('customerId', stripeCustomerId)
      }
      const result = await createCheckoutSession(formData)
      if (result?.url) {
        window.location.href = result.url
      } else if (result?.error) {
        toast.error(result.error)
      }
    } catch {
      toast.error('Failed to start checkout')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card
      className={`relative ${
        isCurrentPlan
          ? 'border-violet-500 bg-violet-900/10'
          : 'border-gray-800 bg-gray-900 hover:border-gray-700'
      } transition-colors`}
    >
      {isCurrentPlan && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-violet-600 text-white border-0 text-xs px-3">Current Plan</Badge>
        </div>
      )}
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-base">{plan.name}</CardTitle>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-white">${plan.price}</span>
          {plan.price > 0 && <span className="text-gray-400 text-sm">/mo</span>}
        </div>
        <p className="text-xs text-violet-400">
          {plan.credits === -1 ? 'Unlimited' : plan.credits} videos/month
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 mb-4">
          {(planFeatures[plan.id] || []).map((f) => (
            <li key={f} className="flex items-center gap-2 text-xs text-gray-300">
              <Check className="w-3 h-3 text-violet-400 flex-shrink-0" />
              {f}
            </li>
          ))}
        </ul>
        {isCurrentPlan ? (
          <Button disabled className="w-full bg-gray-800 text-gray-500 cursor-not-allowed text-sm">
            Current Plan
          </Button>
        ) : isFree ? (
          <Button disabled className="w-full bg-gray-800 text-gray-500 cursor-not-allowed text-sm">
            Downgrade
          </Button>
        ) : (
          <Button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-sm"
          >
            {loading ? 'Loading...' : `Upgrade to ${plan.name}`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
