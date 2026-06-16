import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveProvider } from '@/lib/providers'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: video, error } = await supabase
      .from('videos')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (error || !video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    // If video has a job ID and is still processing, check status
    if (video.job_id && (video.status === 'pending' || video.status === 'processing')) {
      const provider = getActiveProvider()
      const status = await provider.getGenerationStatus(video.job_id)

      if (status !== video.status) {
        const videoUrl = status === 'completed' ? `https://storage.example.com/videos/${video.id}.mp4` : null
        const thumbnailUrl = status === 'completed' ? `https://storage.example.com/thumbnails/${video.id}.jpg` : null

        await supabase
          .from('videos')
          .update({
            status,
            updated_at: new Date().toISOString(),
            ...(videoUrl ? { video_url: videoUrl, thumbnail_url: thumbnailUrl } : {}),
          })
          .eq('id', video.id)

        return NextResponse.json({ ...video, status, video_url: videoUrl, thumbnail_url: thumbnailUrl })
      }
    }

    return NextResponse.json(video)
  } catch (error) {
    console.error('Video fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('videos')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Video delete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
