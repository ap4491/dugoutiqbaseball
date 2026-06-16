import { VideoGenerationProvider, VideoGenerationInput, VideoGenerationResult, VideoGenerationStatus } from './types'
import { generateId } from '@/lib/utils'

// In-memory store to track job statuses
const jobStatuses = new Map<string, {
  status: VideoGenerationStatus
  createdAt: number
  completedAt?: number
}>()

export class MockVideoProvider implements VideoGenerationProvider {
  name = 'mock'

  async generateVideo(input: VideoGenerationInput): Promise<VideoGenerationResult> {
    const jobId = `mock_${generateId()}`

    // Store job as processing
    jobStatuses.set(jobId, {
      status: 'processing',
      createdAt: Date.now(),
    })

    // Simulate async completion after ~10 seconds
    // We don't await this — it runs in the background
    this.simulateCompletion(jobId, input.duration * 1000 + 5000)

    return {
      jobId,
      status: 'processing',
      estimatedTime: input.duration + 5,
    }
  }

  async getGenerationStatus(jobId: string): Promise<VideoGenerationStatus> {
    const job = jobStatuses.get(jobId)
    if (!job) return 'pending'
    return job.status
  }

  private async simulateCompletion(jobId: string, delayMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 10000)))
    const job = jobStatuses.get(jobId)
    if (job) {
      jobStatuses.set(jobId, {
        ...job,
        status: 'completed',
        completedAt: Date.now(),
      })
    }
  }
}
