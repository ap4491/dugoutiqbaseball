import { createClient } from '@/lib/supabase/server'
import { VideoForm } from '@/components/generate/video-form'
import { redirect } from 'next/navigation'

export default async function GeneratePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('credits_remaining')
    .eq('id', user.id)
    .single()

  const creditsRemaining = profile?.credits_remaining ?? 0

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Generate Video</h1>
        <p className="text-gray-400 text-sm mt-1">
          Describe your video and customize the generation options.
        </p>
      </div>
      <VideoForm creditsRemaining={creditsRemaining} />
    </div>
  )
}
