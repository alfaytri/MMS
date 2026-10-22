import Dexie, { type Table } from 'dexie'
import type {
  LocalConversation, LocalMessage, LocalCustomer, LocalPhone,
  LocalAddress, LocalProduct, LocalOrder, PendingWrite, SyncRow,
} from './schema'

export class MmsCcDb extends Dexie {
  conversations!: Table<LocalConversation, string>
  messages!:      Table<LocalMessage, string>
  customers!:     Table<LocalCustomer, string>
  phones!:        Table<LocalPhone, string>
  addresses!:     Table<LocalAddress, string>
  products!:      Table<LocalProduct, string>
  orders!:        Table<LocalOrder, string>
  pendingWrites!: Table<PendingWrite, number>
  sync!:          Table<SyncRow, string>

  constructor(name: string) {
    super(name)

    this.version(1).stores({
      conversations:  '&id, customer_id, customer_id_v2, wati_phone, provider, last_message_at',
      messages:       '&id, conversation_id, created_at, [conversation_id+created_at], external_id, delivery_status, message_type',
      customers:      '&id, name',
      phones:         '&id, customer_id, phone, [customer_id+is_primary]',
      addresses:      '&id, customer_id, [customer_id+is_primary]',
      products:       '&id, customer_id',
      orders:         '&id, service_customer_id, scheduled_date, [service_customer_id+scheduled_date]',
      pendingWrites:  '++id, kind, status, createdAt',
      sync:           '&key',
    })

    // v2: revoked_at added to messages (WhatsApp "delete for everyone").
    // No index needed — the field is only read on the rendering path, not queried.
    this.version(2).upgrade(async (tx) => {
      await tx.table('messages').toCollection().modify((m: { revoked_at?: string | null }) => {
        if (m.revoked_at === undefined) m.revoked_at = null
      })
    })

    // v3 (Stage 5 customer consolidation): the CRM cache id-space moved from
    // service_customers.id to the unified customers.id. Re-key the orders store by
    // customer_id (was service_customer_id) and clear the re-keyed caches + their sync
    // cursors so they re-fetch cleanly from customers/customer_phones/customer_addresses.
    // conversations/messages/pendingWrites are unaffected.
    this.version(3).stores({
      conversations:  '&id, customer_id, customer_id_v2, wati_phone, provider, last_message_at',
      messages:       '&id, conversation_id, created_at, [conversation_id+created_at], external_id, delivery_status, message_type',
      customers:      '&id, name',
      phones:         '&id, customer_id, phone, [customer_id+is_primary]',
      addresses:      '&id, customer_id, [customer_id+is_primary]',
      products:       '&id, customer_id',
      orders:         '&id, customer_id, scheduled_date, [customer_id+scheduled_date]',
      pendingWrites:  '++id, kind, status, createdAt',
      sync:           '&key',
    }).upgrade(async (tx) => {
      await Promise.all([
        tx.table('customers').clear(),
        tx.table('phones').clear(),
        tx.table('addresses').clear(),
        tx.table('products').clear(),
        tx.table('orders').clear(),
      ])
      await tx.table('sync').where('key')
        .startsWithAnyOf(['lastCustomerSync:', 'lastPhonesSync:', 'lastAddressesSync:', 'lastOrdersSync:'])
        .delete()
    })
  }
}

const instances = new Map<string, MmsCcDb>()

export function getDb(authUserId: string): MmsCcDb {
  let db = instances.get(authUserId)
  if (!db) {
    db = new MmsCcDb(`mms-cc-cache-${authUserId}`)
    instances.set(authUserId, db)
  }
  return db
}

export function createDb(authUserId: string): MmsCcDb {
  return new MmsCcDb(`mms-cc-cache-${authUserId}`)
}

export function resetDb(): void {
  for (const db of instances.values()) {
    db.close()
  }
  instances.clear()
}
