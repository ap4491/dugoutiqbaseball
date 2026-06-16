import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveProvider } from '@/lib/providers'
import { VideoGenerationInput } from '@/lib/providers/types'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { prompt, aspectRatio, duration, style, cameraMovement, audio, captions } = body

    // Check credits
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits_remaining')
      .eq('id', user.id)
      .single()

    if (!profile || profile.credits_remaining <= 0) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 })
    }

    // Create video record
    const { data: video, error: insertError } = await supabase
      .from('videos')
      .insert({
        user_id: user.id,
        prompt,
        aspect_ratio: aspectRatio,
        duration,
        style,
        camera_movement: cameraMovement,
        audio,
        captions,
        status: 'pending',
        provider: 'mock',
        credits_used: 1,
      })
      .select()
      .single()

    if (insertError || !video) {
      return NextResponse.json({ error: 'Failed to create video record' }, { status: 500 })
    }

    // Decrement credits
    await supabase
      .from('profiles')
      .update({
        credits_remaining: profile.credits_remaining - 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    // Call provider
    const provider = getActiveProvider()
    const input: VideoGenerationInput = {
      prompt,
      aspectRatio,
      duration,
      style,
      cameraMovement,
      audio,
      captions,
      userId: user.id,
    }

    const result = await provider.generateVideo(input)

    // Update video with job ID
    await supabase
      .from('videos')
      .update({
        job_id: result.jobId,
        status: result.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', video.id)

    return NextResponse.json({
      videoId: video.id,
      jobId: result.jobId,
      status: result.status,
      estimatedTime: result.estimatedTime,
    })
  } catch (error) {
    console.error('Generate error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
