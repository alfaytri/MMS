'use client'

import * as React from 'react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { CogsBreakdownContent } from './CogsBreakdownContent'

type Props = {
  variantId: string
  children: React.ReactNode
  onSelectLc: (lcId: string) => void
}

export function CogsBreakdownPopover({ variantId, children, onSelectLc }: Props) {
  const [open, setOpen] = React.useState(false)
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{children}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>COGS Breakdown</DrawerTitle>
          </DrawerHeader>
          <div className="pb-6">
            <CogsBreakdownContent
              variantId={variantId}
              enabled={open}
              onSelectLc={(lcId) => {
                setOpen(false)
                onSelectLc(lcId)
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <HoverCard openDelay={300} closeDelay={150} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="left" className="p-0 w-auto">
        <CogsBreakdownContent
          variantId={variantId}
          enabled={open}
          onSelectLc={onSelectLc}
        />
      </HoverCardContent>
    </HoverCard>
  )
}
