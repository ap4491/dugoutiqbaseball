export type AspectRatio = '9:16' | '16:9' | '1:1'
export type Duration = 5 | 10 | 15 | 30
export type VideoStyle = 'cinematic' | 'realistic' | 'anime' | 'product-demo' | 'social-media-ad' | 'sports-commercial' | 'documentary'
export type CameraMovement = 'static' | 'push-in' | 'handheld' | 'drone' | 'orbit' | 'tracking-shot'
export type AudioOption = 'none' | 'cinematic' | 'upbeat' | 'sports-crowd' | 'ambient'

export interface VideoGenerationProvider {
  name: string
  generateVideo(input: VideoGenerationInput): Promise<VideoGenerationResult>
  getGenerationStatus(jobId: string): Promise<VideoGenerationStatus>
}

export interface VideoGenerationInput {
  prompt: string
  aspectRatio: AspectRatio
  duration: Duration
  style: VideoStyle
  cameraMovement: CameraMovement
  audio: AudioOption
  captions: boolean
  userId: string
}

export interface VideoGenerationResult {
  jobId: string
  status: VideoGenerationStatus
  estimatedTime?: number
}

export type VideoGenerationStatus = 'pending' | 'processing' | 'completed' | 'failed'
