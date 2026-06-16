import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { stripe } from '@/lib/stripe/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { PLANS } from '@/lib/stripe/plans'
import Stripe from 'stripe'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = headers().get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set() {},
        remove() {},
      },
    }
  )

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const customerId = session.customer as string
        const subscriptionId = session.subscription as string
        const userId = session.metadata?.userId

        if (!userId) break

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const priceId = subscription.items.data[0]?.price.id

        let planId = 'free'
        for (const [key, plan] of Object.entries(PLANS)) {
          if ('priceId' in plan && plan.priceId === priceId) {
            planId = key
            break
          }
        }

        const planDetails = PLANS[planId as keyof typeof PLANS]
        const credits = planDetails.credits

        await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan_id: planId,
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })

        if (credits !== -1) {
          await supabase
            .from('profiles')
            .update({ credits_remaining: credits, updated_at: new Date().toISOString() })
            .eq('id', userId)
        } else {
          await supabase
            .from('profiles')
            .update({ credits_remaining: 9999, updated_at: new Date().toISOString() })
            .eq('id', userId)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        const { data: subRecord } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (!subRecord) break

        const priceId = subscription.items.data[0]?.price.id
        let planId = 'free'
        for (const [key, plan] of Object.entries(PLANS)) {
          if ('priceId' in plan && plan.priceId === priceId) {
            planId = key
            break
          }
        }

        await supabase
          .from('subscriptions')
          .update({
            plan_id: planId,
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        const { data: subRecord } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (!subRecord) break

        await supabase
          .from('subscriptions')
          .update({
            plan_id: 'free',
            status: 'canceled',
            stripe_subscription_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId)

        await supabase
          .from('profiles')
          .update({ credits_remaining: PLANS.free.credits, updated_at: new Date().toISOString() })
          .eq('id', subRecord.user_id)
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        const { data: subRecord } = await supabase
          .from('subscriptions')
          .select('user_id, plan_id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (!subRecord) break

        const planDetails = PLANS[subRecord.plan_id as keyof typeof PLANS]
        const credits = planDetails?.credits ?? PLANS.free.credits

        if (credits !== -1) {
          await supabase
            .from('profiles')
            .update({ credits_remaining: credits, updated_at: new Date().toISOString() })
            .eq('id', subRecord.user_id)
        }
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }
  } catch (error) {
    console.error('Error processing webhook:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
