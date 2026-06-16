import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Zap,
  Video,
  Shield,
  Sparkles,
  ArrowRight,
  Check,
  Play,
  Star,
  Film,
  Globe,
  Wand2,
} from 'lucide-react'

const features = [
  {
    icon: Wand2,
    title: 'AI-Powered Generation',
    description: 'Transform your text prompts into stunning, professional-quality videos using state-of-the-art AI models.',
  },
  {
    icon: Film,
    title: 'Multiple Styles',
    description: 'Choose from cinematic, realistic, anime, product demos, social media ads, sports commercials, and more.',
  },
  {
    icon: Zap,
    title: 'Lightning Fast',
    description: 'Generate videos in seconds, not hours. Our optimized pipeline delivers results when you need them.',
  },
  {
    icon: Globe,
    title: 'Any Aspect Ratio',
    description: 'Create videos optimized for any platform - 9:16 for TikTok/Reels, 16:9 for YouTube, 1:1 for Instagram.',
  },
  {
    icon: Sparkles,
    title: 'Camera Control',
    description: 'Direct your AI with cinematic camera movements: push-in, drone shots, orbits, tracking, and more.',
  },
  {
    icon: Shield,
    title: 'Enterprise Ready',
    description: 'Built with security-first principles. Your data is protected with row-level security and encryption.',
  },
]

const plans = [
  {
    name: 'Free',
    price: 0,
    description: 'Perfect for trying out VideoForge AI',
    credits: 3,
    features: [
      '3 videos per month',
      'All styles available',
      'Up to 15s duration',
      'Standard quality',
      'Community support',
    ],
    cta: 'Get Started Free',
    href: '/signup',
    popular: false,
  },
  {
    name: 'Pro',
    price: 29,
    description: 'For creators and small businesses',
    credits: 50,
    features: [
      '50 videos per month',
      'All styles available',
      'Up to 30s duration',
      'HD quality',
      'Priority processing',
      'Email support',
    ],
    cta: 'Start Pro Trial',
    href: '/signup?plan=pro',
    popular: true,
  },
  {
    name: 'Business',
    price: 99,
    description: 'Unlimited videos for teams',
    credits: -1,
    features: [
      'Unlimited videos',
      'All styles available',
      'Up to 30s duration',
      '4K quality',
      'Priority processing',
      'API access',
      'Dedicated support',
    ],
    cta: 'Start Business Trial',
    href: '/signup?plan=business',
    popular: false,
  },
]

const testimonials = [
  {
    name: 'Sarah Johnson',
    role: 'Content Creator',
    content: 'VideoForge AI has completely transformed my workflow. I can produce professional videos in minutes.',
    rating: 5,
  },
  {
    name: 'Marcus Chen',
    role: 'Marketing Director',
    content: 'The quality of AI-generated videos is incredible. Our ad campaigns have never looked better.',
    rating: 5,
  },
  {
    name: 'Alex Rodriguez',
    role: 'Sports Brand Manager',
    content: 'The sports commercial style is perfect for our brand. Cinematic quality at a fraction of the cost.',
    rating: 5,
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Navigation */}
      <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-700 rounded-lg flex items-center justify-center">
                <Video className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold text-white">VideoForge AI</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-400 hover:text-white transition-colors text-sm">Features</a>
              <a href="#pricing" className="text-gray-400 hover:text-white transition-colors text-sm">Pricing</a>
              <a href="#testimonials" className="text-gray-400 hover:text-white transition-colors text-sm">Testimonials</a>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button variant="ghost" className="text-gray-400 hover:text-white">Sign In</Button>
              </Link>
              <Link href="/signup">
                <Button className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-900/20 via-transparent to-purple-900/20" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-violet-600/10 rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 text-center">
          <Badge className="mb-6 bg-violet-900/50 text-violet-300 border-violet-700 hover:bg-violet-900/50">
            <Sparkles className="w-3 h-3 mr-1" />
            Powered by Runway ML & Advanced AI
          </Badge>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            Generate Stunning
            <span className="block bg-gradient-to-r from-violet-400 via-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
              AI Videos
            </span>
            in Seconds
          </h1>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Transform your ideas into professional-quality videos with just a text prompt.
            Cinematic styles, custom camera movements, and instant generation.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <Button size="lg" className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-lg px-8 py-6 h-auto">
                Start Creating Free
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline" className="border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800 text-lg px-8 py-6 h-auto">
                <Play className="mr-2 w-5 h-5" />
                Watch Demo
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-gray-500">No credit card required · 3 free videos included</p>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-gray-800 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '50K+', label: 'Videos Generated' },
              { value: '10K+', label: 'Active Creators' },
              { value: '7', label: 'Video Styles' },
              { value: '< 30s', label: 'Generation Time' },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Everything You Need to Create</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              A complete AI video generation platform with all the tools professionals need.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="bg-gray-900 border-gray-800 hover:border-violet-700/50 transition-colors">
                <CardHeader>
                  <div className="w-10 h-10 bg-violet-900/50 rounded-lg flex items-center justify-center mb-3">
                    <feature.icon className="w-5 h-5 text-violet-400" />
                  </div>
                  <CardTitle className="text-white">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-gray-400 text-sm leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 bg-gray-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Start free and scale as you grow. No hidden fees.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl border p-8 ${
                  plan.popular
                    ? 'border-violet-500 bg-gradient-to-b from-violet-900/20 to-gray-900'
                    : 'border-gray-800 bg-gray-900'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <Badge className="bg-violet-600 text-white border-0 px-4 py-1">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                  <p className="text-gray-400 text-sm mb-4">{plan.description}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">${plan.price}</span>
                    {plan.price > 0 && <span className="text-gray-400">/month</span>}
                  </div>
                  <p className="text-sm text-violet-400 mt-1">
                    {plan.credits === -1 ? 'Unlimited videos' : `${plan.credits} videos/month`}
                  </p>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm text-gray-300">
                      <Check className="w-4 h-4 text-violet-400 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href={plan.href} className="block">
                  <Button
                    className={`w-full ${
                      plan.popular
                        ? 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700'
                        : 'bg-gray-800 hover:bg-gray-700 text-white'
                    }`}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Loved by Creators</h2>
            <p className="text-gray-400 text-lg">See what people are saying about VideoForge AI</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((testimonial) => (
              <Card key={testimonial.name} className="bg-gray-900 border-gray-800">
                <CardContent className="pt-6">
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: testimonial.rating }).map((_, i) => (
                      <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    ))}
                  </div>
                  <p className="text-gray-300 text-sm leading-relaxed mb-4">
                    &ldquo;{testimonial.content}&rdquo;
                  </p>
                  <div>
                    <div className="font-semibold text-white text-sm">{testimonial.name}</div>
                    <div className="text-gray-500 text-xs">{testimonial.role}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-gradient-to-r from-violet-900/20 to-purple-900/20 border-y border-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to Create Amazing Videos?</h2>
          <p className="text-gray-400 text-lg mb-8">
            Join thousands of creators using VideoForge AI to produce stunning content.
          </p>
          <Link href="/signup">
            <Button size="lg" className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-lg px-10 py-6 h-auto">
              Start Creating for Free
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-gradient-to-br from-violet-500 to-purple-700 rounded flex items-center justify-center">
                <Video className="w-3 h-3 text-white" />
              </div>
              <span className="text-gray-400 text-sm">VideoForge AI</span>
            </div>
            <p className="text-gray-600 text-sm">
              &copy; {new Date().getFullYear()} VideoForge AI. All rights reserved.
            </p>
            <div className="flex gap-6 text-sm text-gray-500">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="#" className="hover:text-white transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
