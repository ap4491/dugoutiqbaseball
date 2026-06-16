'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Video,
  LayoutDashboard,
  Wand2,
  Film,
  CreditCard,
  User,
} from 'lucide-react'

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/generate',
    label: 'Generate Video',
    icon: Wand2,
  },
  {
    href: '/videos',
    label: 'My Videos',
    icon: Film,
  },
  {
    href: '/billing',
    label: 'Billing',
    icon: CreditCard,
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: User,
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
      {/* Logo */}
      <div className="p-6 border-b border-gray-800">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-purple-700 rounded-lg flex items-center justify-center">
            <Video className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-white">VideoForge AI</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-violet-900/50 text-violet-300 border border-violet-700/50'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              )}
            >
              <item.icon className={cn('w-4 h-4', isActive ? 'text-violet-400' : '')} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom info */}
      <div className="p-4 border-t border-gray-800">
        <div className="text-xs text-gray-600 text-center">
          VideoForge AI v0.1.0
        </div>
      </div>
    </aside>
  )
}
