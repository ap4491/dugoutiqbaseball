'use client'

import { useState } from 'react'
import { useFormState } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { signup } from '@/lib/actions/auth'
import { Eye, EyeOff, CheckCircle } from 'lucide-react'

const initialState = { error: '', success: false }

export function SignupForm() {
  const [state, formAction] = useFormState(signup, initialState)
  const [showPassword, setShowPassword] = useState(false)

  if (state?.success) {
    return (
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="pt-6 text-center">
          <CheckCircle className="w-12 h-12 text-violet-400 mx-auto mb-4" />
          <h3 className="text-white font-semibold mb-2">Check your email</h3>
          <p className="text-gray-400 text-sm">
            We&apos;ve sent you a confirmation link. Please check your email to activate your account.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-4">
          {state?.error && (
            <div className="bg-red-900/20 border border-red-700/50 text-red-400 text-sm p-3 rounded-md">
              {state.error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-gray-300">Full Name</Label>
            <Input
              id="fullName"
              name="fullName"
              type="text"
              placeholder="John Doe"
              required
              className="bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-violet-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-gray-300">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              className="bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-violet-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-gray-300">Password</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 characters"
                required
                minLength={8}
                className="bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-violet-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button
            type="submit"
            className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
          >
            Create Account
          </Button>
          <p className="text-center text-xs text-gray-500">
            By signing up, you agree to our Terms of Service and Privacy Policy.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
