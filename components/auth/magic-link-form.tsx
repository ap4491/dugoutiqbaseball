'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { sendMagicLink } from '@/lib/actions/auth'
import { Mail, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

export function MagicLinkForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const formData = new FormData()
      formData.set('email', email)
      const result = await sendMagicLink(formData)
      if (result?.error) {
        toast.error(result.error)
      } else {
        setSent(true)
        toast.success('Magic link sent!')
      }
    } catch {
      toast.error('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardContent className="pt-6">
        {sent ? (
          <div className="text-center py-4">
            <CheckCircle className="w-12 h-12 text-violet-400 mx-auto mb-4" />
            <h3 className="text-white font-semibold mb-2">Magic link sent!</h3>
            <p className="text-gray-400 text-sm">
              Check <strong className="text-gray-300">{email}</strong> for your sign-in link.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="magic-email" className="text-gray-300">Email Address</Label>
              <Input
                id="magic-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-violet-500"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
            >
              <Mail className="w-4 h-4 mr-2" />
              {loading ? 'Sending...' : 'Send Magic Link'}
            </Button>
            <p className="text-center text-xs text-gray-500">
              We&apos;ll send you a secure link to sign in without a password.
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
