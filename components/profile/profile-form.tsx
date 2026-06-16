'use client'

import { useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateProfile } from '@/lib/actions/auth'

export function ProfileForm({
  fullName,
  email,
}: {
  fullName: string | null
  email: string
}) {
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateProfile(formData)
      if (res.success) {
        toast.success(res.data?.message ?? 'Profile updated.')
      } else {
        toast.error(res.error ?? 'Could not update profile.')
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          defaultValue={fullName ?? ''}
          placeholder="Your name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} disabled readOnly />
        <p className="text-xs text-gray-500">Email cannot be changed.</p>
      </div>
      <Button
        type="submit"
        disabled={isPending}
        className="bg-gradient-to-r from-purple-600 to-violet-600 text-white hover:opacity-90"
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save changes
      </Button>
    </form>
  )
}
