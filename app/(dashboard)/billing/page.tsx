import { createClient } from '@/lib/supabase/server'
import { PlanCard } from '@/components/billing/plan-card'
import { BillingPortal } from '@/components/billing/billing-portal'
import { PLANS } from '@/lib/stripe/plans'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { CreditCard, Calendar } from 'lucide-react'

export default async function BillingPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user!.id)
    .single()

  const { data: profile } = await supabase
    .from('profiles')
    .select('credits_remaining')
    .eq('id', user!.id)
    .single()

  const currentPlan = subscription?.plan_id ?? 'free'

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="text-gray-400 text-sm mt-1">Manage your subscription and billing details</p>
      </div>

      {/* Current Subscription */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white text-base">Current Subscription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-white font-semibold capitalize">{currentPlan} Plan</span>
                <Badge
                  className={`text-xs ${
                    subscription?.status === 'active'
                      ? 'bg-green-900/50 text-green-300 border-green-700'
                      : 'bg-gray-800 text-gray-400 border-gray-700'
                  }`}
                >
                  {subscription?.status ?? 'active'}
                </Badge>
              </div>
              <p className="text-gray-400 text-sm mt-1">
                {profile?.credits_remaining ?? 0} credits remaining this month
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                ${PLANS[currentPlan as keyof typeof PLANS]?.price ?? 0}
                <span className="text-gray-400 text-sm font-normal">/mo</span>
              </div>
            </div>
          </div>

          {subscription?.current_period_end && (
            <div className="flex items-center gap-2 text-sm text-gray-400 pt-2 border-t border-gray-800">
              <Calendar className="w-4 h-4" />
              <span>
                {subscription.status === 'active' ? 'Renews' : 'Expires'} on{' '}
                {format(new Date(subscription.current_period_end), 'MMMM d, yyyy')}
              </span>
            </div>
          )}

          {subscription?.stripe_customer_id && (
            <div className="pt-2 border-t border-gray-800">
              <BillingPortal />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plans */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.values(PLANS).map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentPlanId={currentPlan}
              userId={user!.id}
              stripeCustomerId={subscription?.stripe_customer_id}
            />
          ))}
        </div>
      </div>

      {/* Payment Method */}
      {subscription?.stripe_customer_id && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Payment Method
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-400 text-sm">
              Manage your payment method through the billing portal.
            </p>
            <BillingPortal className="mt-3" label="Manage Payment Method" />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
