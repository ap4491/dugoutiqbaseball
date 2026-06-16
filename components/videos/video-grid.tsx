'use client'

import { useState } from 'react'
import { VideoCard } from './video-card'
import { Film } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface Video {
  id: string
  prompt: string
  status: string
  style: string
  duration: number
  aspect_ratio: string
  audio: string
  captions: boolean
  video_url?: string | null
  thumbnail_url?: string | null
  created_at: string
  error_message?: string | null
}

interface VideoGridProps {
  videos: Video[]
}

export function VideoGrid({ videos: initialVideos }: VideoGridProps) {
  const [videos, setVideos] = useState<Video[]>(initialVideos)

  const handleDelete = (id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id))
  }

  if (videos.length === 0) {
    return (
      <div className="text-center py-20">
        <Film className="w-16 h-16 text-gray-700 mx-auto mb-4" />
        <h3 className="text-white font-semibold mb-2">No videos yet</h3>
        <p className="text-gray-500 text-sm mb-6">Generate your first AI video to see it here</p>
        <Link href="/generate">
          <Button className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700">
            Generate Your First Video
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} onDelete={handleDelete} />
      ))}
    </div>
  )
}
