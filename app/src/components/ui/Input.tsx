import React, { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, disabled, ...props }, ref) => {
    return (
      <div className="relative flex items-center w-full">
        {icon && <div className="absolute left-2.5 text-[var(--text-muted)] pointer-events-none flex items-center">{icon}</div>}
        <input
          ref={ref}
          disabled={disabled}
          className={cn(
            'w-full h-8 px-2.5 text-xs rounded-md border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors focus-visible:border-[var(--accent)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed',
            icon ? 'pl-8' : '',
            className
          )}
          {...props}
        />
      </div>
    )
  }
)

Input.displayName = 'Input'
