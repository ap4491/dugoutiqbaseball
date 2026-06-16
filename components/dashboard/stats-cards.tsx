import { Card, CardContent } from '@/components/ui/card'
import { Film, CheckCircle, Clock, Zap } from 'lucide-react'

interface StatsCardsProps {
  totalVideos: number
  completedVideos: number
  pendingVideos: number
  creditsRemaining: number
}

export function StatsCards({ totalVideos, completedVideos, pendingVideos, creditsRemaining }: StatsCardsProps) {
  const stats = [
    {
      label: 'Total Videos',
      value: totalVideos,
      icon: Film,
      color: 'text-violet-400',
      bg: 'bg-violet-900/20',
    },
    {
      label: 'Completed',
      value: completedVideos,
      icon: CheckCircle,
      color: 'text-green-400',
      bg: 'bg-green-900/20',
    },
    {
      label: 'Processing',
      value: pendingVideos,
      icon: Clock,
      color: 'text-yellow-400',
      bg: 'bg-yellow-900/20',
    },
    {
      label: 'Credits Left',
      value: creditsRemaining >= 9999 ? '∞' : creditsRemaining,
      icon: Zap,
      color: 'text-blue-400',
      bg: 'bg-blue-900/20',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="bg-gray-900 border-gray-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">{stat.label}</p>
                <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
