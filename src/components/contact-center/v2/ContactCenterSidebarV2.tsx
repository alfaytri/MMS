'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, MessageSquare, MapPin, Package, ListOrdered, Edit2, AlertTriangle, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useCountryCodes } from '@/hooks/useCountryCodes'
import { splitPhone } from '@/components/shared/PhoneInputWithCode'
import { useContactCenterState } from '@/hooks/contact-center/useContactCenterState'
import { useSyncWorker } from '@/hooks/contact-center/local/useSyncWorker'
import { useLocalConversations } from '@/hooks/contact-center/local/useLocalConversations'
import { useLocalCustomer } from '@/hooks/contact-center/local/useLocalCustomer'
import { SyncBanner } from './SyncBanner'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { useContactCenterContext } from '@/contexts/ContactCenterContext'
import { useLocalMessages } from '@/hooks/contact-center/local/useLocalMessages'
import { useProviderSuggest } from '@/hooks/contact-center/useProviderSuggest'
import { sendMessageLocal, sendFileLocal, sendTemplateLocal, reactLocal, addAddressLocal, updateAddressLocal, markReadLocal, markOpenedLocal } from '@/lib/contact-center/local/mutations'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { getDb } from '@/lib/contact-center/local/db'
import { ChatAttachmentDialog } from '@/components/contact-center/ChatAttachmentDialog'
import { ChatInstructionsDialog } from '@/components/contact-center/ChatInstructionsDialog'
import { ChatTemplateConfirmDialog } from '@/components/contact-center/ChatTemplateConfirmDialog'
import { CrmSection } from '@/components/contact-center/CrmSection'
import { tryNormalisePhone } from '@/lib/contact-center/normalise-phone'
import { AddressForm } from '@/components/contact-center/AddressSection'
import { ChatListV2 } from './ChatListV2'
import { DialPad } from './DialPad'
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
    teamPhones, divisions,
    ensureAndOpenTeamConversation, markConversationResolved,
  } = state

  const [authUserId, setAuthUserId] = useState<string | null>(null)
  useEffect(() => {
    const supabase = createSupabaseClient()
    supabase.auth.getUser().then(({ data }) => {
      setAuthUserId(data.user?.id ?? null)
    })
  }, [])

  const { fileMap } = useSyncWorker(authUserId, provider)
  const { conversations, loading: convsLoading } = useLocalConversations(authUserId)
  const local = useLocalCustomer(authUserId, activeCustomerId)
  const { data: myProfile } = useCurrentUserProfile()
  const { data: countryCodes = [] } = useCountryCodes()

  const { messages: unifiedMessages, loading: unifiedLoading } = useLocalMessages(authUserId, activeCustomerId, activeConversationId)
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

  // Handle external "open customer" triggers from other modules.
  // We track the last-handled trigger nonce so the auto-expand fires ONCE per
  // lookup — if we depended on `conversations` here, every realtime sync tick
  // would re-expand the sidebar and the user couldn't collapse it.
  const handledNonceRef = useRef<number | null>(null)
  useEffect(() => {
    if (!pendingPhone) return
    if (handledNonceRef.current === pendingPhone.nonce) return
    handledNonceRef.current = pendingPhone.nonce

    // Normalise both sides — wati_phone may be stored without the leading "+".
    const target = tryNormalisePhone(pendingPhone.phone) ?? pendingPhone.phone
    const match = conversations.find((c) => {
      const cNorm = tryNormalisePhone(c.wati_phone ?? '') ?? c.wati_phone
      return cNorm === target
    })
    if (match) {
      openConversation(match.id, match.customer_id, match.wati_phone)
    } else {
      // No existing conversation — open with empty conversationId so the
      // sidebar enters the "unknown caller / attach" flow with this phone.
      openConversation('', null, target)
    }
    setCcSidebar('expanded')
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
        agentProfileId: myProfile?.id ?? null,
        agentName: myProfile?.full_name ?? null,
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
    if (!confirmTemplate || !activeConversationId || !activePhone || !authUserId) return
    try {
      const bodyText = confirmTemplate.paramNames.reduce(
        (t, name, i) => t.replace(`{{${name}}}`, vars[i] ?? ''),
        confirmTemplate.bodyOriginal || confirmTemplate.elementName,
      )
      await sendTemplateLocal(getDb(authUserId), {
        conversationId: activeConversationId,
        phone: activePhone,
        templateName: confirmTemplate.elementName,
        broadcastName: `mms_${confirmTemplate.elementName}_${Date.now()}`,
        bodyText,
        variables: vars,
        headerUrl: headerUrl || undefined,
      })
      setConfirmTemplate(null)
      toast.success('Template queued for send')
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
      agentProfileId: myProfile?.id ?? null,
      agentName: myProfile?.full_name ?? null,
    })
  }

  // Collapsed strip
  if (sidebarView === 'collapsed') {
    return (
      <div className="hidden lg:flex fixed left-0 top-0 bottom-0 w-10 border-r border-border bg-background z-[60] flex-col items-center pt-3 gap-3">
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
      <div className="hidden lg:flex fixed left-0 top-0 bottom-0 w-80 border-r border-border bg-background z-[60] flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border h-10">
          <span className="text-xs font-semibold">Contact Centre</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCollapse}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
        </div>
        {myProfile?.threecx_extension && <DialPad />}
        <div className="min-h-[20px]">
          {authUserId && <SyncBanner authUserId={authUserId} />}
        </div>
        <div className="flex-1 overflow-y-auto">
          <ChatListV2
            conversations={conversations}
            loading={convsLoading}
            onSelectConversation={(c) => {
              if (c.provider && c.provider !== provider) setProvider(c.provider)
              openConversation(c.id, c.customer_id, c.wati_phone)
              if (authUserId && c.id) {
                void markReadLocal(getDb(authUserId), c.id)
                if (!c.is_opened) void markOpenedLocal(getDb(authUserId), c.id)
              }
            }}
            onStartNewChat={handleStartNewChat}
            onSync={syncFromProvider}
            syncProgress={syncProgress}
            provider={provider}
            teamPhones={teamPhones}
            divisions={divisions}
            onOpenTeam={async (team) => {
              if (!team.phone) return
              try {
                await ensureAndOpenTeamConversation({
                  id:      team.id,
                  phone:   team.phone,
                  name_en: team.name_en,
                })
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Could not open team chat')
              }
            }}
            onMarkResolved={async (conversationId) => {
              try {
                await markConversationResolved(conversationId, authUserId)
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Couldn't mark as resolved")
                throw err
              }
            }}
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
  function flagFor(phone: string | null | undefined): string | null {
    if (!phone) return null
    const { code } = splitPhone(phone)
    return countryCodes.find((c) => c.code === code)?.flag ?? null
  }

  return (
    <div className="hidden lg:flex fixed left-0 top-0 bottom-0 w-80 border-r border-border bg-background z-50 flex-col">
      {/* Sync status banner */}
      <div className="min-h-[20px]">
        {authUserId && <SyncBanner authUserId={authUserId} />}
      </div>
      {/* Header — compact: name row, then phone+status inline (no left indent) */}
      <div className="flex flex-col px-2 py-1 border-b border-border flex-shrink-0 gap-0.5">
        {/* Row 1: back + name + type badge + edit */}
        <div className="flex items-center gap-1 min-h-[24px]">
          <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0" onClick={goToList}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs font-semibold truncate flex-1 min-w-0">{displayName}</span>
          {customer?.customer_type && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 uppercase flex-shrink-0">
              {customer.customer_type === 'business' ? 'BIZ' : 'IND'}
            </Badge>
          )}
          {customer?.is_blocked && (
            <span title="Blocked"><AlertTriangle className="h-3.5 w-3.5 text-destructive flex-shrink-0" /></span>
          )}
          {customer ? (
            <Button size="icon" variant="ghost" className="h-5 w-5 flex-shrink-0" onClick={() => customerData.setCrmMode('edit')} title="Edit customer">
              <Edit2 className="h-3 w-3" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-5 px-1.5 text-[10px] gap-1 flex-shrink-0"
              onClick={() => customerData.setCrmMode('unknown')}
              title="Add customer"
            >
              <UserPlus className="h-3 w-3" /> Add
            </Button>
          )}
        </div>
        {/* Row 2: flag + phone + status (tight, no big indent) */}
        <div className="flex items-center gap-1 pl-7 min-h-[18px]">
          {(() => {
            const phoneForFlag = activePhone ?? headerPhone
            const flag = flagFor(phoneForFlag)
            return flag ? <span className="text-sm leading-none">{flag}</span> : null
          })()}
          {phones.length > 1 ? (
            <select
              className="text-[11px] font-mono text-muted-foreground bg-transparent border rounded px-1 py-0 h-5 outline-none cursor-pointer"
              value={activePhone ?? headerPhone ?? ''}
              onChange={(e) => {
                const phone = e.target.value
                if (phone && phone !== activePhone) {
                  const conv = conversations.find((c) => c.wati_phone === phone)
                  if (conv) {
                    if (conv.provider && conv.provider !== provider) setProvider(conv.provider)
                    openConversation(conv.id, conv.customer_id, phone)
                  }
                }
              }}
            >
              {phones.map((p) => (
                <option key={p.id} value={p.phone}>{p.phone}</option>
              ))}
            </select>
          ) : headerPhone ? (
            <span className="text-[11px] font-mono text-muted-foreground">{headerPhone}</span>
          ) : null}
          {activeConversation?.wati_status && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              activeConversation.wati_status === 'open'    ? 'bg-emerald-100 text-emerald-700' :
              activeConversation.wati_status === 'pending' ? 'bg-amber-100 text-amber-700' :
              'bg-muted text-muted-foreground'
            }`}>
              {activeConversation.wati_status}
            </span>
          )}
          {customer && customer.pending_payment_amount > 0 && (
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 px-1 py-0">
              QAR {customer.pending_payment_amount.toFixed(2)}
            </Badge>
          )}
        </div>
      </div>

      {myProfile?.threecx_extension && <DialPad />}

      {/* When no customer is linked OR we're in unknown-caller flow,
          render the v1 CrmSection's attach/create flow inline */}
      {(!customer || customerData.crmMode === 'unknown' || customerData.crmMode === 'edit') && activePhone && (
        <div className="flex-shrink-0 border-b border-border">
          <CrmSection
            customerData={customerData}
            pendingPhone={activePhone}
            onCustomerResolved={(id, name, phone) => {
              if (authUserId) {
                void getDb(authUserId).customers.put({
                  id, name, name_ar: null, customer_type: 'individual',
                  is_blocked: false, pending_payment_amount: 0,
                  created_at: new Date().toISOString(),
                })
              }
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
                    if (!authUserId || !activeCustomerId) return
                    try {
                      await addAddressLocal(getDb(authUserId), {
                        customerId: activeCustomerId,
                        type: form.type,
                        unit: form.unit, building: form.building,
                        street: form.street, zone: form.zone,
                        lat: resolved?.lat, lng: resolved?.lng,
                        label: form.label, wazeLink: resolved?.waze_link,
                        isPrimary: addresses.length === 0,
                      })
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
                      if (!authUserId) return
                      try {
                        await updateAddressLocal(getDb(authUserId), {
                          addressId: editAddr.id,
                          patch: {
                            label: form.label ?? null,
                            unit: form.unit ?? null, building: form.building ?? null,
                            street: form.street ?? null, zone: form.zone ?? null,
                            lat: resolved?.lat ?? null, lng: resolved?.lng ?? null,
                            wazeLink: resolved?.waze_link ?? null,
                          },
                        })
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
            if (!authUserId || !activePhone) return
            void reactLocal(getDb(authUserId), {
              messageId: msgId, emoji, phone: activePhone, provider,
            })
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
              agentName: myProfile?.full_name ?? null,
              agentProfileId: myProfile?.id ?? null,
            })
            chatMessages.setInputText('')
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
