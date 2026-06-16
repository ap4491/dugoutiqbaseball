import { Video } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-gray-800 py-6 px-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-gradient-to-br from-violet-500 to-purple-700 rounded flex items-center justify-center">
            <Video className="w-2.5 h-2.5 text-white" />
          </div>
          <span className="text-xs text-gray-500">VideoForge AI</span>
        </div>
        <p className="text-xs text-gray-600">
          &copy; {new Date().getFullYear()} VideoForge AI. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
