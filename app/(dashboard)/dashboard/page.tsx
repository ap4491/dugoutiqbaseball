import { createClient } from '@/lib/supabase/server'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { RecentVideos } from '@/components/dashboard/recent-videos'
import { CreditDisplay } from '@/components/dashboard/credit-display'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [profileResult, videosResult, subscriptionResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase.from('videos').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(10),
    supabase.from('subscriptions').select('*').eq('user_id', user!.id).single(),
  ])

  const profile = profileResult.data
  const videos = videosResult.data || []
  const subscription = subscriptionResult.data

  const totalVideos = videos.length
  const completedVideos = videos.filter(v => v.status === 'completed').length
  const pendingVideos = videos.filter(v => v.status === 'pending' || v.status === 'processing').length

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            Welcome back, {profile?.full_name || user?.email?.split('@')[0]}!
          </p>
        </div>
        <Link href="/generate">
          <Button className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700">
            <Plus className="w-4 h-4 mr-2" />
            Generate Video
          </Button>
        </Link>
      </div>

      <CreditDisplay
        creditsRemaining={profile?.credits_remaining ?? 0}
        planId={subscription?.plan_id ?? 'free'}
      />

      <StatsCards
        totalVideos={totalVideos}
        completedVideos={completedVideos}
        pendingVideos={pendingVideos}
        creditsRemaining={profile?.credits_remaining ?? 0}
      />

      <RecentVideos videos={videos} />
    </div>
  )
}
