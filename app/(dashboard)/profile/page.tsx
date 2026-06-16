import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ProfileForm } from '@/components/profile/profile-form'
import { Calendar } from 'lucide-react'
import { format } from 'date-fns'

export default async function ProfilePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user!.id)
    .single()

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()
    : user?.email?.[0].toUpperCase() ?? 'U'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Profile</h1>
        <p className="text-gray-400 text-sm mt-1">Manage your account information</p>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-violet-900 text-violet-200 text-xl">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-white">{profile?.full_name || 'Anonymous User'}</CardTitle>
              <CardDescription className="text-gray-400">{user?.email}</CardDescription>
              <Badge className="mt-1 bg-violet-900/50 text-violet-300 border-violet-700 capitalize">
                {subscription?.plan_id ?? 'free'} plan
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ProfileForm
            fullName={profile?.full_name ?? null}
            email={user?.email ?? ''}
          />
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white text-base">Account Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400 flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              Member since
            </span>
            <span className="text-white">
              {profile?.created_at ? format(new Date(profile.created_at), 'MMMM d, yyyy') : 'Unknown'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Credits remaining</span>
            <span className="text-white font-medium">{profile?.credits_remaining ?? 0}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Current plan</span>
            <span className="text-white capitalize">{subscription?.plan_id ?? 'Free'}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
