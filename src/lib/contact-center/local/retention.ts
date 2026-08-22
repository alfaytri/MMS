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

  const liveCustomerIds = new Set(
    (await db.conversations.toArray()).map((c) => c.customer_id).filter(Boolean) as string[],
  )
  const customers = await db.customers.toArray()
  const orphans = customers.filter((c) => !liveCustomerIds.has(c.id)).map((c) => c.id)
  if (orphans.length > 0) {
    await db.customers.bulkDelete(orphans)
    await db.phones.where('customer_id').anyOf(orphans).delete()
    await db.addresses.where('customer_id').anyOf(orphans).delete()
    await db.products.where('customer_id').anyOf(orphans).delete()
    await db.orders.where('service_customer_id').anyOf(orphans).delete()
  }
}
