export const APP_NAME = 'VideoForge AI'
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export const PROTECTED_ROUTES = [
  '/dashboard',
  '/generate',
  '/videos',
  '/profile',
  '/billing',
]

export const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/auth/callback',
]

export const VIDEO_STYLES = [
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'realistic', label: 'Realistic' },
  { value: 'anime', label: 'Anime' },
  { value: 'product-demo', label: 'Product Demo' },
  { value: 'social-media-ad', label: 'Social Media Ad' },
  { value: 'sports-commercial', label: 'Sports Commercial' },
  { value: 'documentary', label: 'Documentary' },
]

export const CAMERA_MOVEMENTS = [
  { value: 'static', label: 'Static' },
  { value: 'push-in', label: 'Push In' },
  { value: 'handheld', label: 'Handheld' },
  { value: 'drone', label: 'Drone Shot' },
  { value: 'orbit', label: 'Orbit' },
  { value: 'tracking-shot', label: 'Tracking Shot' },
]

export const AUDIO_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'upbeat', label: 'Upbeat' },
  { value: 'sports-crowd', label: 'Sports Crowd' },
  { value: 'ambient', label: 'Ambient' },
]

export const ASPECT_RATIOS = [
  { value: '16:9', label: '16:9 — Landscape' },
  { value: '9:16', label: '9:16 — Portrait' },
  { value: '1:1', label: '1:1 — Square' },
]

export const DURATIONS = [
  { value: 5, label: '5 seconds' },
  { value: 10, label: '10 seconds' },
  { value: 15, label: '15 seconds' },
  { value: 30, label: '30 seconds' },
]
