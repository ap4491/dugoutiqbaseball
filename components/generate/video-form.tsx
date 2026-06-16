'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { Wand2, Zap, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

const schema = z.object({
  prompt: z.string().min(10, 'Prompt must be at least 10 characters').max(1000),
  aspectRatio: z.enum(['9:16', '16:9', '1:1']),
  duration: z.coerce.number().int().refine((v) => [5, 10, 15, 30].includes(v)),
  style: z.enum(['cinematic', 'realistic', 'anime', 'product-demo', 'social-media-ad', 'sports-commercial', 'documentary']),
  cameraMovement: z.enum(['static', 'push-in', 'handheld', 'drone', 'orbit', 'tracking-shot']),
  audio: z.enum(['none', 'cinematic', 'upbeat', 'sports-crowd', 'ambient']),
  captions: z.boolean(),
})

type FormValues = z.infer<typeof schema>

interface VideoFormProps {
  creditsRemaining: number
}

export function VideoForm({ creditsRemaining }: VideoFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      aspectRatio: '16:9',
      duration: 5,
      style: 'cinematic',
      cameraMovement: 'static',
      audio: 'none',
      captions: false,
    },
  })

  const captions = watch('captions')

  const onSubmit = async (data: FormValues) => {
    if (creditsRemaining <= 0) {
      toast.error('No credits remaining. Please upgrade your plan.')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Generation failed')
      }

      toast.success('Video generation started! Check My Videos for progress.')
      router.push('/videos')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start video generation')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {creditsRemaining <= 0 && (
        <div className="flex items-start gap-3 bg-yellow-900/20 border border-yellow-700/50 text-yellow-300 p-4 rounded-lg">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm">No credits remaining</p>
            <p className="text-xs text-yellow-400 mt-1">
              You&apos;ve used all your credits for this month.{' '}
              <Link href="/billing" className="underline hover:text-yellow-200">Upgrade your plan</Link>
              {' '}to generate more videos.
            </p>
          </div>
        </div>
      )}

      {/* Prompt */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white text-base">Video Prompt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            {...register('prompt')}
            placeholder="Describe your video in detail... e.g., 'A cinematic shot of a basketball player making a slam dunk in slow motion, dramatic lighting, packed stadium crowd'"
            className="bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-violet-500 min-h-[120px] resize-none"
          />
          {errors.prompt && (
            <p className="text-red-400 text-xs">{errors.prompt.message}</p>
          )}
          <p className="text-xs text-gray-500">
            Be descriptive — include scene, mood, lighting, and action details.
          </p>
        </CardContent>
      </Card>

      {/* Video Settings */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white text-base">Video Settings</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Aspect Ratio */}
          <div className="space-y-2">
            <Label className="text-gray-300 text-sm">Aspect Ratio</Label>
            <Select
              defaultValue="16:9"
              onValueChange={(v) => setValue('aspectRatio', v as '9:16' | '16:9' | '1:1')}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white focus:border-violet-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="16:9">16:9 — YouTube / Landscape</SelectItem>
                <SelectItem value="9:16">9:16 — TikTok / Reels / Portrait</SelectItem>
                <SelectItem value="1:1">1:1 — Instagram Square</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label className="text-gray-300 text-sm">Duration</Label>
            <Select
              defaultValue="5"
              onValueChange={(v) => setValue('duration', parseInt(v) as 5 | 10 | 15 | 30)}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white focus:border-violet-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 seconds</SelectItem>
                <SelectItem value="10">10 seconds</SelectItem>
                <SelectItem value="15">15 seconds</SelectItem>
                <SelectItem value="30">30 seconds</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Style */}
          <div className="space-y-2">
            <Label className="text-gray-300 text-sm">Video Style</Label>
            <Select
              defaultValue="cinematic"
              onValueChange={(v) => setValue('style', v as FormValues['style'])}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white focus:border-violet-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cinematic">Cinematic</SelectItem>
                <SelectItem value="realistic">Realistic</SelectItem>
                <SelectItem value="anime">Anime</SelectItem>
                <SelectItem value="product-demo">Product Demo</SelectItem>
                <SelectItem value="social-media-ad">Social Media Ad</SelectItem>
                <SelectItem value="sports-commercial">Sports Commercial</SelectItem>
                <SelectItem value="documentary">Documentary</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Camera Movement */}
          <div className="space-y-2">
            <Label className="text-gray-300 text-sm">Camera Movement</Label>
            <Select
              defaultValue="static"
              onValueChange={(v) => setValue('cameraMovement', v as FormValues['cameraMovement'])}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white focus:border-violet-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="static">Static</SelectItem>
                <SelectItem value="push-in">Push In</SelectItem>
                <SelectItem value="handheld">Handheld</SelectItem>
                <SelectItem value="drone">Drone Shot</SelectItem>
                <SelectItem value="orbit">Orbit</SelectItem>
                <SelectItem value="tracking-shot">Tracking Shot</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Audio */}
          <div className="space-y-2">
            <Label className="text-gray-300 text-sm">Background Audio</Label>
            <Select
              defaultValue="none"
              onValueChange={(v) => setValue('audio', v as FormValues['audio'])}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white focus:border-violet-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="cinematic">Cinematic</SelectItem>
                <SelectItem value="upbeat">Upbeat</SelectItem>
                <SelectItem value="sports-crowd">Sports Crowd</SelectItem>
                <SelectItem value="ambient">Ambient</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Captions */}
          <div className="space-y-2">
            <Label className="text-gray-300 text-sm">Auto Captions</Label>
            <div className="flex items-center gap-3 h-10 mt-0">
              <Switch
                checked={captions}
                onCheckedChange={(v) => setValue('captions', v)}
                className="data-[state=checked]:bg-violet-600"
              />
              <span className="text-sm text-gray-400">
                {captions ? 'Captions enabled' : 'No captions'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Zap className="w-4 h-4 text-violet-400" />
          <span>1 credit will be used</span>
          <span className="text-gray-600">·</span>
          <span>{creditsRemaining} remaining</span>
        </div>
        <Button
          type="submit"
          disabled={isSubmitting || creditsRemaining <= 0}
          className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 px-8"
        >
          <Wand2 className="w-4 h-4 mr-2" />
          {isSubmitting ? 'Generating...' : 'Generate Video'}
        </Button>
      </div>
    </form>
  )
}
