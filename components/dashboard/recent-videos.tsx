import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/videos/status-badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Film, ArrowRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Video {
  id: string
  prompt: string
  status: string
  style: string
  duration: number
  aspect_ratio: string
  created_at: string
}

interface RecentVideosProps {
  videos: Video[]
}

export function RecentVideos({ videos }: RecentVideosProps) {
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-white text-base">Recent Videos</CardTitle>
        <Link href="/videos">
          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
            View all
            <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {videos.length === 0 ? (
          <div className="text-center py-12">
            <Film className="w-12 h-12 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-400 mb-2">No videos yet</p>
            <p className="text-gray-600 text-sm mb-4">Generate your first AI video to get started</p>
            <Link href="/generate">
              <Button className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700">
                Generate Video
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {videos.map((video) => (
              <div
                key={video.id}
                className="flex items-center gap-4 p-3 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors"
              >
                {/* Thumbnail placeholder */}
                <div className="w-16 h-10 bg-gray-700 rounded flex items-center justify-center flex-shrink-0">
                  <Film className="w-4 h-4 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{video.prompt}</p>
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">
                    {video.style} · {video.duration}s · {video.aspect_ratio}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <StatusBadge status={video.status} />
                  <span className="text-xs text-gray-600 hidden sm:block">
                    {formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
