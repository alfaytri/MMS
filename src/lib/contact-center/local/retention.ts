import type { MmsCcDb } from './db'

const RETENTION_DAYS = 30
const KEEP_PER_CONVERSATION = 20

export async function prune(db: MmsCcDb): Promise<void> {
  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString()

  const allConvIds = await db.messages.orderBy('conversation_id').uniqueKeys()
  for (const cid of allConvIds as string[]) {
    const rowsAsc = await db.messages
      .where('[conversation_id+created_at]')
      .between([cid, ''], [cid, '￿'])
      .toArray()

    if (rowsAsc.length <= KEEP_PER_CONVERSATION) continue

    const keepIds = new Set(rowsAsc.slice(-KEEP_PER_CONVERSATION).map((m) => m.id))
    const dropIds: string[] = []
    for (const m of rowsAsc) {
      if (keepIds.has(m.id)) continue
      if (m.created_at < cutoffIso) dropIds.push(m.id)
    }
    if (dropIds.length > 0) await db.messages.bulkDelete(dropIds)
  }

  const conversations = await db.conversations.toArray()
  for (const conv of conversations) {
    const hasMessages = await db.messages.where('conversation_id').equals(conv.id).count() > 0
    const isStale = !conv.last_message_at || conv.last_message_at < cutoffIso
    if (isStale && !hasMessages) {
      await db.conversations.delete(conv.id)
      await db.sync.delete(`lastMessageSync:${conv.id}`)
    }
  }

  // Customer-orphan prune is intentionally disabled during the consolidation cutover.
  // The local CRM cache (customers/phones/addresses/orders/products) is keyed by
  // service_customers.id, but chat_conversations.customer_id now holds a unified
  // customers.id (the FK was re-pointed to customers). The two id-spaces no longer
  // align, so a conversation-based liveness check would flag every cached customer as
  // an orphan and wipe the cache on each run. The cache is bounded (only customers the
  // agent has opened) and self-heals via the repos' lazyFetch, so leaving it unpruned is
  // safe. Re-enable with a customers-native liveness check when the CC CRM panel moves
  // to customers ids (the deferred field-unification step).
}
