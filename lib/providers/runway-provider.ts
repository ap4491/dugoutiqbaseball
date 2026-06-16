import { VideoGenerationProvider, VideoGenerationInput, VideoGenerationResult, VideoGenerationStatus } from './types'

// Runway ML API documentation: https://docs.runwayml.com/
// This is a stub implementation. Set RUNWAY_API_KEY in your .env to use the real API.

const RUNWAY_API_BASE = 'https://api.runwayml.com/v1'

export class RunwayProvider implements VideoGenerationProvider {
  name = 'runway'
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async generateVideo(input: VideoGenerationInput): Promise<VideoGenerationResult> {
    const response = await fetch(`${RUNWAY_API_BASE}/image_to_video`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': '2024-11-06',
      },
      body: JSON.stringify({
        model: 'gen3a_turbo',
        promptText: this.buildPrompt(input),
        duration: input.duration,
        ratio: input.aspectRatio,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Runway API error: ${response.status} - ${error}`)
    }

    const data = await response.json()

    return {
      jobId: data.id,
      status: 'processing',
      estimatedTime: input.duration * 3,
    }
  }

  async getGenerationStatus(jobId: string): Promise<VideoGenerationStatus> {
    const response = await fetch(`${RUNWAY_API_BASE}/tasks/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Runway-Version': '2024-11-06',
      },
    })

    if (!response.ok) {
      throw new Error(`Runway status check failed: ${response.status}`)
    }

    const data = await response.json()

    switch (data.status) {
      case 'PENDING':
        return 'pending'
      case 'RUNNING':
        return 'processing'
      case 'SUCCEEDED':
        return 'completed'
      case 'FAILED':
        return 'failed'
      default:
        return 'pending'
    }
  }

  private buildPrompt(input: VideoGenerationInput): string {
    const parts = [input.prompt]

    const styleDescriptions: Record<string, string> = {
      'cinematic': 'cinematic film quality, dramatic lighting',
      'realistic': 'photorealistic, true to life',
      'anime': 'anime art style, vibrant colors',
      'product-demo': 'clean product demonstration, professional',
      'social-media-ad': 'eye-catching social media advertisement style',
      'sports-commercial': 'dynamic sports commercial, high energy',
      'documentary': 'documentary style, authentic',
    }

    const cameraDescriptions: Record<string, string> = {
      'static': 'static camera shot',
      'push-in': 'slow push-in camera movement',
      'handheld': 'handheld camera movement',
      'drone': 'aerial drone shot',
      'orbit': 'orbiting camera movement',
      'tracking-shot': 'smooth tracking shot',
    }

    if (styleDescriptions[input.style]) {
      parts.push(styleDescriptions[input.style])
    }

    if (cameraDescriptions[input.cameraMovement]) {
      parts.push(cameraDescriptions[input.cameraMovement])
    }

    return parts.join(', ')
  }
}
