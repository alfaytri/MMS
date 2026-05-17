'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, MessageSquare, MapPin, User, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChatListView }        from './ChatListView'
import { ChatSection }         from './ChatSection'
import { ChatInputBar }        from './ChatInputBar'
import { CrmSection }          from './CrmSection'
import { AddressSection }      from './AddressSection'
import { useContactCenterState } from '@/hooks/contact-center/useContactCenterState'
import { useContactCenterContext } from '@/contexts/ContactCenterContext'
import type { ChatConversation } from '@/types/contact-center'

interface SectionHeaderProps {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}

function SectionHeader({ icon, label, children }: SectionHeaderProps) {
  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50">
        {icon}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      {children}
    </div>
  )
}

export function ContactCenterSidebar() {
  const state = useContactCenterState()
  const {
    sidebarView, conversations, convsLoading, messages, threadLoading,
    fetchingWati, canLoadMore, loadMore,
    windowStatus, customerData, chatMessages, addressState,
    activeConversationId, activeCustomerId, activePhone,
    openConversation, goToList, expandSidebar, collapseSidebar, openPhoneDirect, syncFromWati, syncProgress, triggerPoll,
    updateConversationStatus,
  } = state
  const { setCcSidebar, pendingPhone } = useContactCenterContext()
  const [showStatusPicker, setShowStatusPicker] = useState(false)
  const statusPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showStatusPicker) return
    function handleClickOutside(e: MouseEvent) {
      if (statusPickerRef.current && !statusPickerRef.current.contains(e.target as Node)) {
        setShowStatusPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showStatusPicker])

  function handleExpand() { setCcSidebar('expanded'); expandSidebar() }
  function handleCollapse() { setCcSidebar('collapsed'); collapseSidebar() }

  // When another part of the app sets pendingPhone, auto-expand and open the chat.
  // Depends on nonce so re-triggering with the same phone still fires the effect.
  useEffect(() => {
    if (!pendingPhone) return
    const { phone } = pendingPhone
    setCcSidebar('expanded')
    const convo = conversations.find((c) => c.wati_phone === phone)
    if (convo) {
      openConversation(convo.id, convo.customer_id ?? null, phone)
    } else {
      openPhoneDirect(phone)
    }
  }, [pendingPhone?.nonce])

  function handleSelectConversation(c: ChatConversation) {
    openConversation(c.id, c.customer_id, c.wati_phone)
  }

  // ── Collapsed state ────────────────────────────────────────────────────────
  if (sidebarView === 'collapsed') {
    return (
      <>
        {/* Desktop: fixed left strip */}
        <div className="hidden lg:flex fixed left-0 top-14 bottom-0 w-10 border-r border-border bg-background z-40 flex-col items-center pt-3 gap-3">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleExpand}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleExpand}>
            <MessageSquare className="h-4 w-4" />
          </Button>
        </div>

        {/* Mobile: FAB */}
        <button
          className="lg:hidden fixed bottom-4 left-4 z-50 h-12 w-12 rounded-full bg-primary shadow-lg flex items-center justify-center"
          onClick={handleExpand}
        >
          <MessageSquare className="h-5 w-5 text-primary-foreground" />
        </button>
      </>
    )
  }

  // ── Chat list view ─────────────────────────────────────────────────────────
  if (sidebarView === 'list') {
    return (
      <>
        {/* Desktop */}
        <div className="hidden lg:flex fixed left-0 top-14 bottom-0 w-80 border-r border-border bg-background z-40 flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold">Contact Centre</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCollapse}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatListView
              conversations={conversations}
              loading={convsLoading}
              onSelectConversation={handleSelectConversation}
              onSync={() => syncFromWati()}
              syncProgress={syncProgress}
            />
          </div>
        </div>

        {/* Mobile: slide-over drawer */}
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={handleCollapse}>
          <div
            className="absolute bottom-0 left-0 right-0 h-[85vh] bg-background rounded-t-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs font-semibold">Contact Centre</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCollapse}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatListView
                conversations={conversations}
                loading={convsLoading}
                onSelectConversation={handleSelectConversation}
              />
            </div>
          </div>
        </div>
      </>
    )
  }

  // ── Customer detail view ───────────────────────────────────────────────────
  const activeConvo = conversations.find((c) => c.id === activeConversationId)
  const displayName = customerData.customer?.name ?? activeConvo?.customer_name ?? activePhone ?? 'Unknown'

  const STATUS_CONFIG = {
    open:     { label: 'Open',    dot: 'bg-blue-500',    text: 'text-blue-600',   border: 'border-blue-200',   bg: 'bg-blue-50' },
    pending:  { label: 'Pending', dot: 'bg-amber-500',   text: 'text-amber-600',  border: 'border-amber-200',  bg: 'bg-amber-50' },
    resolved: { label: 'Solved',  dot: 'bg-emerald-500', text: 'text-emerald-600',border: 'border-emerald-200',bg: 'bg-emerald-50' },
  } as const

  const currentStatus = (activeConvo?.wati_status ?? 'open') as keyof typeof STATUS_CONFIG
  const statusCfg = STATUS_CONFIG[currentStatus] ?? STATUS_CONFIG.open

  async function handleStatusChange(status: 'open' | 'pending' | 'resolved') {
    setShowStatusPicker(false)
    await updateConversationStatus(status)
  }

  const DetailContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-shrink-0">
        <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={goToList}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{displayName}</p>
          {activePhone && <p className="text-xs text-muted-foreground font-mono">{activePhone}</p>}
        </div>
        {/* Status dropdown — only shown when a conversation is active */}
        {activeConversationId && (
          <div className="relative flex-shrink-0" ref={statusPickerRef}>
            <button
              onClick={() => setShowStatusPicker((p) => !p)}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors ${statusCfg.text} ${statusCfg.border} ${statusCfg.bg}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
              {statusCfg.label}
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </button>
            {showStatusPicker && (
              <div className="absolute right-0 top-full mt-1 w-32 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 overflow-hidden">
                {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map((s) => {
                  const cfg = STATUS_CONFIG[s]
                  return (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors ${s === currentStatus ? 'font-semibold' : ''}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* CRM + detail sections — scrollable, capped so chat always has room */}
      <div className="flex-shrink-0 max-h-[45%] overflow-y-auto overscroll-contain border-b border-border">
        <SectionHeader icon={<User className="h-3 w-3" />} label="Customer">
          <CrmSection
            customerData={customerData}
            pendingPhone={activePhone}
            onCustomerResolved={(id, name, phone) => {
              openConversation(activeConversationId ?? '', id, phone)
            }}
          />
        </SectionHeader>

        <SectionHeader icon={<MapPin className="h-3 w-3" />} label="Addresses">
          <AddressSection addressState={addressState} />
        </SectionHeader>

      </div>

      {/* Chat thread — takes all remaining height */}
      <div className="flex flex-col flex-1 min-h-0">
        <ChatSection
          messages={messages}
          loading={threadLoading}
          fetchingWati={fetchingWati}
          canLoadMore={canLoadMore}
          onLoadMore={loadMore}
          phone={activePhone ?? ''}
          chatMessages={chatMessages}
          onReact={(msgId, _extId, emoji) => chatMessages.reactToMessage(msgId, emoji, activePhone ?? '')}
        />
        {activeConversationId && activePhone && (
          <ChatInputBar
            conversationId={activeConversationId}
            phone={activePhone}
            customerName={displayName}
            windowStatus={windowStatus}
            chatMessages={chatMessages}
            onAfterSend={triggerPoll}
          />
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:flex fixed left-0 top-14 bottom-0 w-80 border-r border-border bg-background z-40 flex-col">
        {DetailContent}
      </div>

      {/* Mobile: slide-over drawer */}
      <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={goToList}>
        <div
          className="absolute bottom-0 left-0 right-0 h-[85vh] bg-background rounded-t-xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {DetailContent}
        </div>
      </div>
    </>
  )
}
