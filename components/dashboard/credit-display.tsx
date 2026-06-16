import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Zap, ArrowRight } from 'lucide-react'
import { PLANS } from '@/lib/stripe/plans'

interface CreditDisplayProps {
  creditsRemaining: number
  planId: string
}

export function CreditDisplay({ creditsRemaining, planId }: CreditDisplayProps) {
  const plan = PLANS[planId as keyof typeof PLANS] ?? PLANS.free
  const totalCredits = plan.credits === -1 ? 9999 : plan.credits
  const displayCredits = creditsRemaining >= 9999 ? '∞' : creditsRemaining
  const percentage = totalCredits === 9999 ? 100 : Math.min(100, (creditsRemaining / totalCredits) * 100)

  return (
    <Card className="bg-gradient-to-r from-violet-900/20 to-purple-900/20 border-violet-700/30">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-violet-900/50 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Credits Remaining</p>
              <p className="text-2xl font-bold text-white">
                {displayCredits}
                {plan.credits !== -1 && (
                  <span className="text-sm text-gray-500 font-normal ml-1">/ {plan.credits}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-gray-500">Current Plan</p>
              <p className="text-sm font-semibold text-violet-300 capitalize">{plan.name}</p>
            </div>
            {planId === 'free' && (
              <Link href="/billing">
                <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white">
                  Upgrade
                  <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            )}
          </div>
        </div>
        {plan.credits !== -1 && (
          <div className="mt-4">
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
