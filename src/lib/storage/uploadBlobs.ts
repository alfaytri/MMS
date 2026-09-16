// src/lib/storage/uploadBlobs.ts
// Upload image/file Blobs to a public storage bucket and return their public URLs.
// Mirrors the field-completion upload (bucket + path shape) so QC photos land in
// the same place as visit-completion photos.
import type { SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_BUCKET = 'visit-completions'

export async function uploadBlobs(
  supabase: SupabaseClient,
  keyPrefix: string,
  blobs: Blob[],
  label: string,
  bucket: string = DEFAULT_BUCKET,
): Promise<string[]> {
  const urls: string[] = []
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i]
    const ext = ((b.type?.split('/')[1] || 'jpg').replace('jpeg', 'jpg')) || 'jpg'
    const path = `${keyPrefix}/${label}-${Date.now()}-${i}.${ext}`
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, b, { contentType: b.type || 'image/jpeg', upsert: false })
    if (error) { console.warn('[uploadBlobs]', label, error.message); continue }
    urls.push(supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl)
  }
  return urls
}
