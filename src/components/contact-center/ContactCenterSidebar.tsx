'use client'

import { ChevronLeft, ChevronRight, MessageSquare, MapPin, Package, Clock, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChatListView }        from './ChatListView'
import { ChatSection }         from './ChatSection'
import { ChatInputBar }        from './ChatInputBar'
import { CrmSection }          from './CrmSection'
import { AddressSection }      from './AddressSection'
import { ProductsList }        from './ProductsList'
import { OrderHistorySection } from './OrderHistorySection'
import { useContactCenterState } from '@/hooks/contact-center/useContactCenterState'
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
    openConversation, goToList, expandSidebar, collapseSidebar, syncFromWati, syncProgress,
  } = state

  function handleSelectConversation(c: ChatConversation) {
    openConversation(c.id, c.customer_id, c.wati_phone)
  }

  // ── Collapsed state ────────────────────────────────────────────────────────
  if (sidebarView === 'collapsed') {
    return (
      <>
        {/* Desktop: fixed left strip */}
        <div className="hidden lg:flex fixed left-0 top-14 bottom-0 w-10 border-r border-border bg-background z-40 flex-col items-center pt-3 gap-3">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={expandSidebar}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={expandSidebar}>
            <MessageSquare className="h-4 w-4" />
          </Button>
        </div>

        {/* Mobile: FAB */}
        <button
          className="lg:hidden fixed bottom-4 left-4 z-50 h-12 w-12 rounded-full bg-primary shadow-lg flex items-center justify-center"
          onClick={expandSidebar}
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
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={collapseSidebar}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatListView
              conversations={conversations}
              loading={convsLoading}
              onSelectConversation={handleSelectConversation}
              onSync={(full) => syncFromWati(full)}
              syncProgress={syncProgress}
            />
          </div>
        </div>

        {/* Mobile: slide-over drawer */}
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={collapseSidebar}>
          <div
            className="absolute bottom-0 left-0 right-0 h-[85vh] bg-background rounded-t-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs font-semibold">Contact Centre</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={collapseSidebar}>
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
      </div>

      {/* Chat thread — takes 55% of sidebar height */}
      <div className="flex flex-col flex-shrink-0" style={{ height: '55%' }}>
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
          />
        )}
      </div>

      {/* CRM + detail sections */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
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

        <SectionHeader icon={<Package className="h-3 w-3" />} label="Products">
          <ProductsList products={customerData.products} />
        </SectionHeader>

        <SectionHeader icon={<Clock className="h-3 w-3" />} label="Order History">
          <OrderHistorySection customerId={activeCustomerId} />
        </SectionHeader>
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
