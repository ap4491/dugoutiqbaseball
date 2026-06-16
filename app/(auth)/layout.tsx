import { Video } from 'lucide-react'
import Link from 'next/link'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-900/10 via-transparent to-purple-900/10 pointer-events-none" />
      <nav className="relative z-10 p-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-700 rounded-lg flex items-center justify-center">
            <Video className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold text-white">VideoForge AI</span>
        </Link>
      </nav>
      <div className="relative z-10 flex-1 flex items-center justify-center p-4">
        {children}
      </div>
    </div>
  )
}
