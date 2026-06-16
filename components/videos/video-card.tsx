'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from './status-badge'
import { Film, Download, Trash2, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

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

interface VideoCardProps {
  video: Video
  onDelete?: (id: string) => void
}

export function VideoCard({ video, onDelete }: VideoCardProps) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this video?')) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/videos/${video.id}`, { method: 'DELETE' })
      if (response.ok) {
        toast.success('Video deleted')
        onDelete?.(video.id)
      } else {
        toast.error('Failed to delete video')
      }
    } catch {
      toast.error('Failed to delete video')
    } finally {
      setDeleting(false)
    }
  }

  const handleDownload = () => {
    if (video.video_url) {
      window.open(video.video_url, '_blank')
    }
  }

  return (
    <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors overflow-hidden">
      {/* Thumbnail */}
      <div className="aspect-video bg-gray-800 relative flex items-center justify-center">
        {video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail_url}
            alt={video.prompt}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Film className="w-8 h-8 text-gray-600" />
            {(video.status === 'pending' || video.status === 'processing') && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <Clock className="w-3 h-3 animate-spin" />
                Generating...
              </div>
            )}
          </div>
        )}
        <div className="absolute top-2 right-2">
          <StatusBadge status={video.status} />
        </div>
      </div>

      <CardContent className="p-4">
        <p className="text-white text-sm font-medium line-clamp-2 mb-2">{video.prompt}</p>

        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
          <span className="text-xs text-gray-500 capitalize">{video.style}</span>
          <span className="text-xs text-gray-600">·</span>
          <span className="text-xs text-gray-500">{video.duration}s</span>
          <span className="text-xs text-gray-600">·</span>
          <span className="text-xs text-gray-500">{video.aspect_ratio}</span>
          {video.captions && (
            <>
              <span className="text-xs text-gray-600">·</span>
              <span className="text-xs text-gray-500">CC</span>
            </>
          )}
        </div>

        {video.error_message && (
          <p className="text-xs text-red-400 mb-2 line-clamp-1">{video.error_message}</p>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">
            {formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}
          </span>
          <div className="flex items-center gap-1">
            {video.status === 'completed' && video.video_url && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDownload}
                className="h-7 px-2 text-gray-400 hover:text-white"
              >
                <Download className="w-3 h-3 mr-1" />
                <span className="text-xs">Download</span>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              disabled={deleting}
              className="h-7 px-2 text-gray-500 hover:text-red-400"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
