'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveProvider } from '@/lib/providers'
import type { VideoGenerationInput } from '@/lib/providers/types'

export async function generateVideo(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Check credits
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits_remaining')
    .eq('id', user.id)
    .single()

  if (!profile || profile.credits_remaining <= 0) {
    throw new Error('Insufficient credits')
  }

  const prompt = formData.get('prompt') as string
  const aspectRatio = formData.get('aspectRatio') as VideoGenerationInput['aspectRatio']
  const duration = parseInt(formData.get('duration') as string) as VideoGenerationInput['duration']
  const style = formData.get('style') as VideoGenerationInput['style']
  const cameraMovement = formData.get('cameraMovement') as VideoGenerationInput['cameraMovement']
  const audio = formData.get('audio') as VideoGenerationInput['audio']
  const captions = formData.get('captions') === 'true'

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
    throw new Error('Failed to create video record')
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

  try {
    const result = await provider.generateVideo(input)

    await supabase
      .from('videos')
      .update({
        job_id: result.jobId,
        status: result.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', video.id)
  } catch (error) {
    await supabase
      .from('videos')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        updated_at: new Date().toISOString(),
      })
      .eq('id', video.id)
  }

  revalidatePath('/videos')
  revalidatePath('/dashboard')
  redirect('/videos')
}

export async function deleteVideo(videoId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { error } = await supabase
    .from('videos')
    .delete()
    .eq('id', videoId)
    .eq('user_id', user.id)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/videos')
  revalidatePath('/dashboard')
}

export async function checkVideoStatus(videoId: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: video } = await supabase
    .from('videos')
    .select('*')
    .eq('id', videoId)
    .eq('user_id', user.id)
    .single()

  if (!video || !video.job_id) return video

  // Check with provider
  if (video.status === 'pending' || video.status === 'processing') {
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

      return { ...video, status, video_url: videoUrl, thumbnail_url: thumbnailUrl }
    }
  }

  return video
}
