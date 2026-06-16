import { VideoGenerationProvider } from './types'
import { MockVideoProvider } from './mock-provider'
import { RunwayProvider } from './runway-provider'

export { MockVideoProvider, RunwayProvider }
export type { VideoGenerationProvider }
export * from './types'

let activeProvider: VideoGenerationProvider | null = null

export function getActiveProvider(): VideoGenerationProvider {
  if (!activeProvider) {
    // Use Runway if API key is set, otherwise use Mock
    if (process.env.RUNWAY_API_KEY) {
      activeProvider = new RunwayProvider(process.env.RUNWAY_API_KEY)
    } else {
      activeProvider = new MockVideoProvider()
    }
  }
  return activeProvider
}

export function setActiveProvider(provider: VideoGenerationProvider): void {
  activeProvider = provider
}
