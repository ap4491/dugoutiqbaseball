export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    credits: 3,
    videoLimit: 3,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 29,
    credits: 50,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
  },
  business: {
    id: 'business',
    name: 'Business',
    price: 99,
    credits: -1,
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID,
  },
} as const

export type PlanId = keyof typeof PLANS
export type Plan = typeof PLANS[PlanId]
