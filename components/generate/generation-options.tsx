import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

interface GenerationOptionsProps {
  aspectRatio: string
  duration: number
  style: string
  cameraMovement: string
  audio: string
  captions: boolean
  onAspectRatioChange: (v: string) => void
  onDurationChange: (v: number) => void
  onStyleChange: (v: string) => void
  onCameraMovementChange: (v: string) => void
  onAudioChange: (v: string) => void
  onCaptionsChange: (v: boolean) => void
}

export function GenerationOptions({
  aspectRatio,
  duration,
  style,
  cameraMovement,
  audio,
  captions,
  onAspectRatioChange,
  onDurationChange,
  onStyleChange,
  onCameraMovementChange,
  onAudioChange,
  onCaptionsChange,
}: GenerationOptionsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label className="text-gray-300 text-sm">Aspect Ratio</Label>
        <Select value={aspectRatio} onValueChange={onAspectRatioChange}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="16:9">16:9 — Landscape</SelectItem>
            <SelectItem value="9:16">9:16 — Portrait</SelectItem>
            <SelectItem value="1:1">1:1 — Square</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-gray-300 text-sm">Duration</Label>
        <Select value={String(duration)} onValueChange={(v) => onDurationChange(parseInt(v))}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
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
      <div className="space-y-2">
        <Label className="text-gray-300 text-sm">Style</Label>
        <Select value={style} onValueChange={onStyleChange}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
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
      <div className="space-y-2">
        <Label className="text-gray-300 text-sm">Camera</Label>
        <Select value={cameraMovement} onValueChange={onCameraMovementChange}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="static">Static</SelectItem>
            <SelectItem value="push-in">Push In</SelectItem>
            <SelectItem value="handheld">Handheld</SelectItem>
            <SelectItem value="drone">Drone</SelectItem>
            <SelectItem value="orbit">Orbit</SelectItem>
            <SelectItem value="tracking-shot">Tracking Shot</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-gray-300 text-sm">Audio</Label>
        <Select value={audio} onValueChange={onAudioChange}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
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
      <div className="space-y-2">
        <Label className="text-gray-300 text-sm">Captions</Label>
        <div className="flex items-center gap-3 h-10">
          <Switch
            checked={captions}
            onCheckedChange={onCaptionsChange}
            className="data-[state=checked]:bg-violet-600"
          />
          <span className="text-sm text-gray-400">{captions ? 'Enabled' : 'Disabled'}</span>
        </div>
      </div>
    </div>
  )
}
