'use client'

import { useState, useRef } from 'react'
import { FileCheck, Upload, Loader2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

const ACCEPTED = '.pdf,.doc,.docx,.png,.jpg,.jpeg'
const MAX_SIZE = 10 * 1024 * 1024

interface Props {
  contractId: string
  onActivate: () => void
  isActivating: boolean
}

export function SignedDocUploadBanner({ contractId, onActivate, isActivating }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (!selected) return

    if (selected.size > MAX_SIZE) {
      toast.error('File too large. Maximum 10MB.')
      return
    }

    setFile(selected)
    setUploading(true)

    const ext = selected.name.split('.').pop()
    const path = `${contractId}/signed_${Date.now()}.${ext}`

    const { error } = await supabase.storage
      .from('contract-documents')
      .upload(path, selected)

    if (error) {
      toast.error('Upload failed. Please try again.')
      setFile(null)
      setUploading(false)
      return
    }

    await supabase
      .from('contracts')
      .update({ signed_doc_url: path })
      .eq('id', contractId)

    setUploading(false)
    setUploaded(true)
    toast.success('Document uploaded')
  }

  return (
    <div className="rounded-lg bg-success/10 border border-green-200 p-4 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <FileCheck className="h-5 w-5 text-success mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-green-800">
            Contract Approved — Upload signed contract to activate
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          onChange={handleFileChange}
          className="hidden"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          {uploading ? 'Uploading...' : 'Choose File'}
        </Button>
        {file && <span className="text-sm text-muted-foreground">{file.name}</span>}
      </div>

      <Button
        onClick={onActivate}
        disabled={!uploaded || isActivating}
        className="w-full sm:w-auto"
      >
        {isActivating ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <ArrowRight className="h-4 w-4 mr-2" />
        )}
        Activate Contract
      </Button>
    </div>
  )
}
