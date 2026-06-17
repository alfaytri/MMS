'use client'

import * as React from 'react'
import {
  Dialog as BaseDialog,
  DialogTrigger as BaseDialogTrigger,
  DialogContent as BaseDialogContent,
  DialogHeader as BaseDialogHeader,
  DialogTitle as BaseDialogTitle,
  DialogDescription as BaseDialogDescription,
  DialogFooter as BaseDialogFooter,
  DialogClose as BaseDialogClose,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function ResponsiveDialog(props: React.ComponentProps<typeof BaseDialog>) {
  return <BaseDialog {...props} />
}

export const ResponsiveDialogTrigger = BaseDialogTrigger
export const ResponsiveDialogClose = BaseDialogClose

type ResponsiveDialogContentProps = React.ComponentProps<typeof BaseDialogContent> & {
  desktopMaxWidth?: string
}

export function ResponsiveDialogContent({
  className,
  desktopMaxWidth = 'md:max-w-lg',
  children,
  ...props
}: ResponsiveDialogContentProps) {
  return (
    <BaseDialogContent
      className={cn(
        'w-full h-full max-w-full sm:h-full rounded-none p-0 gap-0 flex flex-col',
        'md:h-auto md:max-h-[85vh] md:rounded-lg md:p-0',
        desktopMaxWidth,
        className,
      )}
      {...props}
    >
      {children}
    </BaseDialogContent>
  )
}

export function ResponsiveDialogHeader({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialogHeader>) {
  return (
    <BaseDialogHeader
      className={cn(
        'sticky top-0 z-10 bg-background border-b px-4 py-3 md:px-6',
        className,
      )}
      {...props}
    />
  )
}

export const ResponsiveDialogTitle = BaseDialogTitle
export const ResponsiveDialogDescription = BaseDialogDescription

export function ResponsiveDialogBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex-1 overflow-y-auto px-4 py-4 md:px-6', className)}
      {...props}
    />
  )
}

export function ResponsiveDialogFooter({
  className,
  ...props
}: React.ComponentProps<typeof BaseDialogFooter>) {
  return (
    <BaseDialogFooter
      className={cn(
        'sticky bottom-0 z-10 bg-background border-t px-4 py-3 md:px-6 gap-2',
        className,
      )}
      {...props}
    />
  )
}
