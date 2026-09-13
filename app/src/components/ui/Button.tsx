import React, { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'icon'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'sm', loading = false, disabled, icon, children, ...props }, ref) => {
    const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md transition-all select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 disabled:pointer-events-none cursor-pointer active:scale-[0.98]'

    const variantClasses: Record<ButtonVariant, string> = {
      primary: 'bg-[var(--accent)] text-[var(--bg-primary)] hover:opacity-90 shadow-sm',
      secondary: 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--border)]/50',
      outline: 'bg-transparent text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-secondary)]',
      ghost: 'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]',
      danger: 'bg-transparent text-[var(--error)] border border-[var(--error)]/30 hover:bg-[var(--error)]/10',
    }

    const sizeClasses: Record<ButtonSize, string> = {
      xs: 'text-[11px] h-6 px-2 gap-1',
      sm: 'text-xs h-7 px-2.5 gap-1.5',
      md: 'text-xs h-8 px-3 gap-2',
      icon: 'h-7 w-7 p-0',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
        {...props}
      >
        {loading ? <Loader2 size={size === 'xs' ? 10 : 12} className="animate-spin shrink-0" /> : icon}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
