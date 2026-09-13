import React from 'react'
import { cn } from '@/lib/utils'

export type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'error' | 'outline'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: 'xs' | 'sm'
  icon?: React.ReactNode
}

export function Badge({ className, variant = 'secondary', size = 'xs', icon, children, ...props }: BadgeProps) {
  const baseClasses = 'inline-flex items-center font-medium rounded-md tracking-tight tabular-nums select-none'

  const variantClasses: Record<BadgeVariant, string> = {
    default: 'bg-[var(--accent)] text-[var(--bg-primary)]',
    secondary: 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)]',
    outline: 'bg-transparent text-[var(--text-secondary)] border border-[var(--border)]',
    success: 'bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20',
    warning: 'bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20',
    error: 'bg-[var(--error)]/10 text-[var(--error)] border border-[var(--error)]/20',
  }

  const sizeClasses = {
    xs: 'text-[10px] px-1.5 py-0.5 gap-1',
    sm: 'text-xs px-2 py-0.5 gap-1.5',
  }

  return (
    <span className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)} {...props}>
      {icon}
      {children}
    </span>
  )
}
