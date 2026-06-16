import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config: Record<string, { label: string; classes: string }> = {
    pending: {
      label: 'Pending',
      classes: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
    },
    processing: {
      label: 'Processing',
      classes: 'bg-blue-900/50 text-blue-300 border-blue-700',
    },
    completed: {
      label: 'Completed',
      classes: 'bg-green-900/50 text-green-300 border-green-700',
    },
    failed: {
      label: 'Failed',
      classes: 'bg-red-900/50 text-red-300 border-red-700',
    },
  }

  const { label, classes } = config[status] ?? {
    label: status,
    classes: 'bg-gray-800 text-gray-400 border-gray-700',
  }

  return (
    <Badge className={cn(classes, 'border text-xs font-medium capitalize', className)}>
      {status === 'processing' && (
        <span className="inline-block w-1.5 h-1.5 bg-blue-400 rounded-full mr-1.5 animate-pulse" />
      )}
      {label}
    </Badge>
  )
}
