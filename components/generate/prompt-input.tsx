'use client'

import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface PromptInputProps {
  value: string
  onChange: (v: string) => void
  error?: string
}

export function PromptInput({ value, onChange, error }: PromptInputProps) {
  const charCount = value.length
  const maxChars = 1000

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-gray-300">Video Prompt</Label>
        <span className={`text-xs ${charCount > maxChars * 0.9 ? 'text-yellow-400' : 'text-gray-500'}`}>
          {charCount}/{maxChars}
        </span>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Describe the video you want to generate..."
        maxLength={maxChars}
        className="bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-violet-500 min-h-[120px] resize-none"
      />
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}
