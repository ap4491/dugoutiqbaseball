import { createClient } from '@/lib/supabase/server'
import { VideoGrid } from '@/components/videos/video-grid'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus } from 'lucide-react'

export default async function VideosPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: videos } = await supabase
    .from('videos')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Videos</h1>
          <p className="text-gray-400 text-sm mt-1">
            {videos?.length ?? 0} video{(videos?.length ?? 0) !== 1 ? 's' : ''} generated
          </p>
        </div>
        <Link href="/generate">
          <Button className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700">
            <Plus className="w-4 h-4 mr-2" />
            Generate New
          </Button>
        </Link>
      </div>
      <VideoGrid videos={videos || []} />
    </div>
  )
}
