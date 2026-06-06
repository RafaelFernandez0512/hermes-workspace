'use client'

import { Dialog } from '@base-ui/react/dialog'
import { cn } from '@/lib/utils'

type SheetRootProps = React.ComponentProps<typeof Dialog.Root>

function Sheet({ children, ...props }: SheetRootProps) {
  return <Dialog.Root {...props}>{children}</Dialog.Root>
}

type SheetTriggerProps = React.ComponentProps<typeof Dialog.Trigger>

function SheetTrigger({ className, ...props }: SheetTriggerProps) {
  return <Dialog.Trigger className={cn(className)} {...props} />
}

type SheetContentProps = {
  className?: string
  children: React.ReactNode
  style?: React.CSSProperties
  side?: 'right' | 'left'
}

function SheetContent({ className, children, style, side = 'right' }: SheetContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop
        className="fixed inset-0 transition-all duration-200 data-[state=open]:opacity-100 data-[state=closed]:opacity-0"
        style={{ background: 'rgba(0,0,0,0.35)' }}
      />
      <Dialog.Popup
        className={cn(
          'fixed top-0 bottom-0 flex flex-col',
          side === 'right' ? 'right-0' : 'left-0',
          'w-[min(560px,92vw)]',
          'transition-all duration-200 ease-out',
          'data-[state=open]:opacity-100 data-[state=closed]:opacity-0',
          side === 'right'
            ? 'data-[state=open]:translate-x-0 data-[state=closed]:translate-x-full'
            : 'data-[state=open]:translate-x-0 data-[state=closed]:-translate-x-full',
          'overflow-hidden',
          className,
        )}
        style={{
          background: 'var(--theme-card)',
          border: side === 'right' ? '1px solid var(--theme-border)' : undefined,
          borderLeft: side === 'right' ? '1px solid var(--theme-border)' : undefined,
          boxShadow: 'var(--theme-shadow-3, 0 32px 80px rgba(0,0,0,0.3))',
          color: 'var(--theme-text)',
          ...style,
        }}
      >
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  )
}

type SheetHeaderProps = {
  className?: string
  children: React.ReactNode
}

function SheetHeader({ className, children }: SheetHeaderProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-start justify-between gap-3 border-b border-[var(--theme-border)] px-4 py-3',
        className,
      )}
    >
      {children}
    </div>
  )
}

type SheetTitleProps = React.ComponentProps<typeof Dialog.Title>

function SheetTitle({ className, ...props }: SheetTitleProps) {
  return (
    <Dialog.Title
      className={cn('text-base font-semibold leading-tight', className)}
      style={{ color: 'var(--theme-text)' }}
      {...props}
    />
  )
}

type SheetCloseProps = React.ComponentProps<typeof Dialog.Close>

function SheetClose({ className, children, ...props }: SheetCloseProps) {
  return (
    <Dialog.Close
      className={cn(
        'rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-sm text-[var(--theme-muted)] hover:text-[var(--theme-text)]',
        className,
      )}
      {...props}
    >
      {children ?? 'Close'}
    </Dialog.Close>
  )
}

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetClose }
