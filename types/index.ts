export type { Profile, Subscription, Video, Database, Tables, TablesInsert, TablesUpdate } from './database'
export type {
  VideoGenerationStatus,
  AspectRatio,
  Duration,
  VideoStyle,
  CameraMovement,
  AudioOption,
  VideoGenerationInput,
  VideoGenerationResult,
  VideoGenerationProvider,
} from '@/lib/providers/types'
export type { Plan, PlanId } from '@/lib/stripe/plans'

export interface ActionResult<T = unknown> {
  success: boolean
  error?: string
  data?: T
}

export interface DashboardStats {
  totalVideos: number
  completedVideos: number
  processingVideos: number
  creditsRemaining: number
  planName: string
}
