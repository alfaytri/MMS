// src/lib/visitDrafts.ts
// Crash-safe persistence for visit drafts (photos, signatures).
// Written on every capture; purged only after server confirms success.
import { openDB, type DBSchema } from 'idb'

interface VisitDraftDB extends DBSchema {
  photos: {
    key: string     // visitId
    value: Blob[]
  }
  signatures: {
    key: string     // visitId
    value: Blob
  }
}

const DB_NAME = 'tl-visit-drafts'
const DB_VERSION = 1

function getDb() {
  return openDB<VisitDraftDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('photos')) {
        db.createObjectStore('photos')
      }
      if (!db.objectStoreNames.contains('signatures')) {
        db.createObjectStore('signatures')
      }
    },
  })
}

export async function saveDraftPhotos(visitId: string, photos: Blob[]): Promise<void> {
  const db = await getDb()
  await db.put('photos', photos, visitId)
}

export async function getDraftPhotos(visitId: string): Promise<Blob[]> {
  const db = await getDb()
  return (await db.get('photos', visitId)) ?? []
}

export async function saveDraftSignature(visitId: string, sig: Blob): Promise<void> {
  const db = await getDb()
  await db.put('signatures', sig, visitId)
}

export async function getDraftSignature(visitId: string): Promise<Blob | null> {
  const db = await getDb()
  return (await db.get('signatures', visitId)) ?? null
}

export async function clearDraft(visitId: string): Promise<void> {
  const db = await getDb()
  await Promise.all([
    db.delete('photos', visitId),
    db.delete('signatures', visitId),
  ])
}
