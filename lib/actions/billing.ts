'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe/server'
import { PLANS } from '@/lib/stripe/plans'

export async function createCheckoutSession(
  formData: FormData
): Promise<{ url?: string; error?: string } | undefined> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const planId = formData.get('planId') as string
  const existingCustomerId = formData.get('customerId') as string | null

  const plan = PLANS[planId as keyof typeof PLANS]
  if (!plan || !('priceId' in plan) || !plan.priceId) {
    return { error: 'Invalid plan or price not configured' }
  }

  try {
    let customerId = existingCustomerId

    if (!customerId) {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      })
      customerId = customer.id
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: plan.priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?canceled=true`,
      metadata: {
        userId: user.id,
        planId,
      },
    })

    return { url: session.url ?? undefined }
  } catch (error) {
    console.error('Checkout session error:', error)
    return { error: 'Failed to create checkout session' }
  }
}

export async function openBillingPortal(): Promise<{ url?: string; error?: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single()

  if (!subscription?.stripe_customer_id) {
    return { error: 'No billing account found' }
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
    })

    return { url: session.url }
  } catch (error) {
    console.error('Billing portal error:', error)
    return { error: 'Failed to open billing portal' }
  }
}
