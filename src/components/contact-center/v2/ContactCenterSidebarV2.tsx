'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, MessageSquare, MapPin, Package, ListOrdered, Edit2, AlertTriangle, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useContactCenterState } from '@/hooks/contact-center/useContactCenterState'
import { useSyncWorker } from '@/hooks/contact-center/local/useSyncWorker'
import { useLocalConversations } from '@/hooks/contact-center/local/useLocalConversations'
import { useLocalCustomer } from '@/hooks/contact-center/local/useLocalCustomer'
import { SyncBanner } from './SyncBanner'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { useContactCenterContext } from '@/contexts/ContactCenterContext'
import { useLocalMessages } from '@/hooks/contact-center/local/useLocalMessages'
import { useProviderSuggest } from '@/hooks/contact-center/useProviderSuggest'
import { sendMessageLocal, sendFileLocal } from '@/lib/contact-center/local/mutations'
import { getDb } from '@/lib/contact-center/local/db'
import { ChatAttachmentDialog } from '@/components/contact-center/ChatAttachmentDialog'
import { ChatInstructionsDialog } from '@/components/contact-center/ChatInstructionsDialog'
import { ChatTemplateConfirmDialog } from '@/components/contact-center/ChatTemplateConfirmDialog'
import { CrmSection } from '@/components/contact-center/CrmSection'
import { AddressForm } from '@/components/contact-center/AddressSection'
import { ChatListV2 } from './ChatListV2'
import { SectionAccordion } from './SectionAccordion'
import { AddressStrip } from './AddressStrip'
import { UnifiedThread } from './UnifiedThread'
import { ComposerV2 } from './ComposerV2'
import { ProductsList } from '@/components/contact-center/ProductsList'
import { OrderHistoryV2 } from './OrderHistoryV2'
import type { WatiTemplate } from '@/types/contact-center'

export function ContactCenterSidebarV2() {
  const state = useContactCenterState()
  const { setCcSidebar, pendingPhone, openCustomerById } = useContactCenterContext()
  const {
    sidebarView,
    windowStatus, customerData, chatMessages, addressState,
    activeConversationId, activeCustomerId, activePhone,
    openConversation, goToList, expandSidebar, collapseSidebar,
    syncFromProvider, syncProgress,
    provider, setProvider,
  } = state

  const [authUserId, setAuthUserId] = useState<string | null>(null)
  useEffect(() => {
    const supabase = createSupabaseClient()
    supabase.auth.getUser().then(({ data }) => {
      setAuthUserId(data.user?.id ?? null)
    })
  }, [])

  const { fileMap } = useSyncWorker(authUserId, provider)
  const { conversations, loading: convsLoading } = useLocalConversations(authUserId, provider)
  const local = useLocalCustomer(authUserId, activeCustomerId)

  const { messages: unifiedMessages, loading: unifiedLoading } = useLocalMessages(authUserId, activeCustomerId)
  const [composerFocused, setComposerFocused] = useState(false)

  const providerSuggest = useProviderSuggest({
    messages: unifiedMessages,
    provider,
    setProvider,
    composer: {
      isFocused: composerFocused,
      text: chatMessages.inputText,
    },
  })

  const [showAttach,       setShowAttach]       = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [confirmTemplate,  setConfirmTemplate]  = useState<WatiTemplate | null>(null)

  // Handle external "open customer" triggers from other modules
  useEffect(() => {
    if (!pendingPhone) return
    const match = conversations.find((c) => c.wati_phone === pendingPhone.phone)
    if (match) {
      openConversation(match.id, match.customer_id, match.wati_phone)
      setCcSidebar('expanded')
    }
  }, [pendingPhone, conversations, openConversation, setCcSidebar])

  function handleExpand()   { setCcSidebar('expanded');  expandSidebar() }
  function handleCollapse() { setCcSidebar('collapsed'); collapseSidebar() }

  function handleStartNewChat(phone: string, p: 'wati' | 'whapi') {
    setProvider(p)
    // Empty conversationId → openConversation will create the row
    openConversation('', null, phone)
  }

  async function handleSendFile(file: File, caption: string) {
    if (!activeConversationId || !activePhone || !authUserId || !fileMap) return
    try {
      await sendFileLocal(getDb(authUserId), fileMap, {
        conversationId: activeConversationId,
        phone: activePhone,
        file,
        caption: caption || undefined,
      })
      setShowAttach(false)
      toast.success('File queued for send')
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to queue file')
    }
  }

  async function handleSendInstruction(text: string) {
    if (!activeConversationId || !activePhone) return
    try {
      await chatMessages.sendSessionMessage({
        conversationId: activeConversationId,
        phone: activePhone,
        text,
      })
    } catch {
      toast.error('Failed to send instruction')
    }
  }

  async function handleSendTemplate(vars: string[], headerUrl: string) {
    if (!confirmTemplate || !activeConversationId || !activePhone) return
    try {
      await chatMessages.sendTemplate({
        conversationId: activeConversationId,
        phone: activePhone,
        template: confirmTemplate,
        variables: vars,
        headerUrl: headerUrl || undefined,
      })
      setConfirmTemplate(null)
      toast.success('Template sent')
    } catch {
      toast.error('Failed to send template')
    }
  }

  async function handleVoiceNote(file: File) {
    if (!activeConversationId || !activePhone || !authUserId || !fileMap) return
    await sendFileLocal(getDb(authUserId), fileMap, {
      conversationId: activeConversationId,
      phone: activePhone,
      file,
    })
  }

  // Collapsed strip
  if (sidebarView === 'collapsed') {
    return (
      <div className="hidden lg:flex fixed left-0 top-0 bottom-0 w-10 border-r border-border bg-background z-50 flex-col items-center pt-3 gap-3">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleExpand}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleExpand}>
          <MessageSquare className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  // List view
  if (sidebarView === 'list' || !activeConversationId) {
    return (
      <div className="hidden lg:flex fixed left-0 top-0 bottom-0 w-80 border-r border-border bg-background z-50 flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border h-10">
          <span className="text-xs font-semibold">Contact Centre</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCollapse}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="min-h-[20px]">
          {authUserId && <SyncBanner authUserId={authUserId} />}
        </div>
        <div className="flex-1 overflow-y-auto">
          <ChatListV2
            conversations={conversations}
            loading={convsLoading}
            onSelectConversation={(c) => openConversation(c.id, c.customer_id, c.wati_phone)}
            onStartNewChat={handleStartNewChat}
            onSync={syncFromProvider}
            syncProgress={syncProgress}
            provider={provider}
          />
        </div>
      </div>
    )
  }

  // Detail view
  const activeConversation = conversations.find((c) => c.id === activeConversationId)
  const customer = local.customer
  const displayName = customer?.name ?? activeConversation?.wati_contact_name ?? activePhone ?? 'Unknown'
  const phones = local.phones
  const primaryPhone = phones.find((p) => p.is_primary) ?? phones[0]
  const secondaryPhones = phones.filter((p) => p.id !== primaryPhone?.id)
  const addresses = local.addresses
  const headerPhone = primaryPhone?.phone ?? activePhone

  return (
    <div className="hidden lg:flex fixed left-0 top-0 bottom-0 w-80 border-r border-border bg-background z-50 flex-col">
      {/* Sync status banner */}
      <div className="min-h-[20px]">
        {authUserId && <SyncBanner authUserId={authUserId} />}
      </div>
      {/* Header — name + phone inline */}
      <div className="flex flex-col px-3 py-2 border-b border-border flex-shrink-0 gap-0.5">
        <div className="flex items-center gap-1.5 min-h-[28px]">
          <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={goToList}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs font-semibold truncate flex-1">{displayName}</span>
          {customer?.customer_type && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 uppercase flex-shrink-0">
              {customer.customer_type === 'business' ? 'BIZ' : 'IND'}
            </Badge>
          )}
          {customer ? (
            <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0" onClick={() => customerData.setCrmMode('edit')} title="Edit customer">
              <Edit2 className="h-3 w-3" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px] gap-1 flex-shrink-0"
              onClick={() => customerData.setCrmMode('unknown')}
              title="Add customer"
            >
              <UserPlus className="h-3 w-3" /> Add
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1.5 pl-9 flex-wrap">
          {headerPhone && (
            <span className="text-[11px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="primary" />
              {headerPhone}
            </span>
          )}
          {secondaryPhones.map((p) => (
            <span key={p.id} className="text-[11px] font-mono text-muted-foreground">{p.phone}</span>
          ))}
          {activeConversation?.wati_status && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-auto ${
              activeConversation.wati_status === 'open'    ? 'bg-emerald-100 text-emerald-700' :
              activeConversation.wati_status === 'pending' ? 'bg-amber-100 text-amber-700' :
              'bg-muted text-muted-foreground'
            }`}>
              {activeConversation.wati_status}
            </span>
          )}
        </div>
        {customer?.is_blocked && (
          <div className="flex items-center gap-1.5 pl-9 mt-0.5">
            <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />
            <span className="text-[10px] text-destructive font-medium">Blocked</span>
          </div>
        )}
        {customer && customer.pending_payment_amount > 0 && (
          <div className="pl-9 mt-0.5">
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 px-1 py-0">
              Pending: QAR {customer.pending_payment_amount.toFixed(2)}
            </Badge>
          </div>
        )}
      </div>

      {/* When no customer is linked OR we're in unknown-caller flow,
          render the v1 CrmSection's attach/create flow inline */}
      {(!customer || customerData.crmMode === 'unknown') && activePhone && (
        <div className="flex-shrink-0 border-b border-border">
          <CrmSection
            customerData={customerData}
            pendingPhone={activePhone}
            onCustomerResolved={(id, name, phone) => {
              // Link the resolved/new customer to the active conversation,
              // close the unknown-caller form, and broadcast to peer modules.
              openConversation(activeConversationId ?? '', id, phone)
              customerData.setCrmMode('view')
              openCustomerById(id, name, phone)
            }}
          />
        </div>
      )}

      {/* CRM sections — Addresses, Products, Orders (only when customer is linked) */}
      {customer && (
        <div className="flex-shrink-0 max-h-[38vh] overflow-y-auto overscroll-contain">
          <SectionAccordion id="addresses" label="Addresses" icon={<MapPin className="h-3 w-3 text-muted-foreground" />}>
            <AddressStrip
              addresses={addresses}
              onEdit={(id) => addressState.setEditingId(id)}
              onAdd={() => addressState.setAddingAddress(true)}
            />
            {addressState.addingAddress && (
              <div className="px-3 pb-2">
                <AddressForm
                  existingCount={addresses.length}
                  validateBluePlate={addressState.validateBluePlate}
                  saving={addressState.addAddress.isPending}
                  onCancel={() => addressState.setAddingAddress(false)}
                  onSave={async (form, resolved) => {
                    try {
                      await addressState.addAddress.mutateAsync({ ...form, resolvedCoords: resolved })
                      addressState.setAddingAddress(false)
                      toast.success('Address saved')
                    } catch {
                      toast.error('Failed to save address')
                    }
                  }}
                />
              </div>
            )}
            {addressState.editingId && (() => {
              const editAddr = addresses.find((a) => a.id === addressState.editingId)
              if (!editAddr) return null
              return (
                <div className="px-3 pb-2">
                  <AddressForm
                    initial={editAddr}
                    existingCount={addresses.length}
                    validateBluePlate={addressState.validateBluePlate}
                    saving={addressState.updateAddress.isPending}
                    onCancel={() => addressState.setEditingId(null)}
                    onSave={async (form, resolved) => {
                      try {
                        await addressState.updateAddress.mutateAsync({ id: editAddr.id, form, resolvedCoords: resolved })
                        addressState.setEditingId(null)
                        toast.success('Address updated')
                      } catch {
                        toast.error('Failed to update address')
                      }
                    }}
                  />
                </div>
              )
            })()}
          </SectionAccordion>
          <SectionAccordion id="products" label="Products" icon={<Package className="h-3 w-3 text-muted-foreground" />}>
            <ProductsList products={local.products} />
          </SectionAccordion>
          <SectionAccordion id="orders" label="Orders" icon={<ListOrdered className="h-3 w-3 text-muted-foreground" />}>
            <OrderHistoryV2 authUserId={authUserId} customerId={activeCustomerId} />
          </SectionAccordion>
        </div>
      )}

      {/* Chat thread + composer */}
      <div className="flex flex-col flex-1 min-h-0">
        <UnifiedThread
          messages={unifiedMessages}
          loading={unifiedLoading}
          phones={phones}
          onReact={(msgId, _extId, emoji) => {
            chatMessages.reactToMessage(msgId, emoji, activePhone ?? '')
            // WATI's REST API has no reaction endpoint — the emoji stays internal.
            // Flag it once so the agent isn't surprised it didn't reach WhatsApp.
            if (provider === 'wati') {
              toast.message('Reaction saved internally', {
                description: "WATI doesn't support sending reactions — switch to WHAPI for native delivery.",
              })
            }
          }}
        />
        <ComposerV2
          provider={provider}
          onProviderChange={setProvider}
          suggestedProvider={providerSuggest.suggested}
          onAcceptSuggest={providerSuggest.acceptSwitch}
          onDismissSuggest={providerSuggest.dismiss}
          windowStatus={windowStatus}
          sending={chatMessages.sending}
          onSend={(t) => {
            if (!activeConversationId || !activePhone || !authUserId) return
            void sendMessageLocal(getDb(authUserId), {
              conversationId: activeConversationId,
              phone: activePhone,
              text: t,
            })
          }}
          onAttachment={() => setShowAttach(true)}
          onInstructions={() => setShowInstructions(true)}
          onSelectTemplate={(t) => setConfirmTemplate(t)}
          onVoiceNote={handleVoiceNote}
          templates={chatMessages.templates}
          templatesLoading={chatMessages.templatesLoading}
          onLoadTemplates={chatMessages.loadTemplates}
          onFocus={() => setComposerFocused(true)}
          onBlur={() => setComposerFocused(false)}
          onTextChange={chatMessages.setInputText}
          text={chatMessages.inputText}
        />
      </div>

      {/* Dialogs */}
      <ChatAttachmentDialog
        open={showAttach}
        sending={chatMessages.sending}
        onSend={handleSendFile}
        onClose={() => setShowAttach(false)}
      />
      <ChatInstructionsDialog
        open={showInstructions}
        sending={chatMessages.sending}
        onSend={handleSendInstruction}
        onClose={() => setShowInstructions(false)}
      />
      {confirmTemplate && (
        <ChatTemplateConfirmDialog
          template={confirmTemplate}
          sending={chatMessages.sending}
          onSend={handleSendTemplate}
          onClose={() => setConfirmTemplate(null)}
        />
      )}
    </div>
  )
}
