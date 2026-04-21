// src/components/services/InstructionEditDialog.tsx
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCreateInstruction, useUpdateInstruction, type InstructionFull } from '@/hooks/useServices'

const instructionSchema = z.object({
  name_en: z.string().min(1, 'Name (EN) is required'),
  name_ar: z.string().nullable(),
  type: z.enum(['pre-service', 'post-service']),
  content_type: z.enum(['text', 'pdf']),
  content_preview: z.string().nullable(),
  full_content: z.string().nullable(),
  pdf_file_name: z.string().nullable().or(z.literal('')),
  status: z.enum(['active', 'inactive']),
})

type InstructionFormValues = z.infer<typeof instructionSchema>

function toDefaults(instruction: InstructionFull | null): InstructionFormValues {
  return {
    name_en: instruction?.name_en ?? '',
    name_ar: instruction?.name_ar ?? null,
    type: (instruction?.type as InstructionFormValues['type']) ?? 'pre-service',
    content_type: (instruction?.content_type as InstructionFormValues['content_type']) ?? 'text',
    content_preview: instruction?.content_preview ?? null,
    full_content: instruction?.full_content ?? null,
    pdf_file_name: instruction?.pdf_file_name ?? null,
    status: (instruction?.status as InstructionFormValues['status']) ?? 'active',
  }
}

interface InstructionEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'new' | 'edit'
  instruction: InstructionFull | null
}

export function InstructionEditDialog({
  open,
  onOpenChange,
  mode,
  instruction,
}: InstructionEditDialogProps) {
  const createInstruction = useCreateInstruction()
  const updateInstruction = useUpdateInstruction()

  const form = useForm<InstructionFormValues>({
    resolver: zodResolver(instructionSchema),
    defaultValues: toDefaults(instruction),
  })

  useEffect(() => {
    if (open) form.reset(toDefaults(instruction))
  }, [open, instruction]) // eslint-disable-line react-hooks/exhaustive-deps

  const contentType = form.watch('content_type')

  async function onSubmit(values: InstructionFormValues) {
    try {
      const payload = {
        name_en: values.name_en,
        name_ar: values.name_ar || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        type: values.type as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content_type: values.content_type as any,
        content_preview: values.content_preview || null,
        full_content: contentType === 'text' ? values.full_content || null : null,
        pdf_file_name: contentType === 'pdf' ? values.pdf_file_name || null : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: values.status as any,
      }
      if (mode === 'new') {
        await createInstruction.mutateAsync(payload)
      } else if (instruction) {
        await updateInstruction.mutateAsync({ id: instruction.id, ...payload })
      }
      toast.success('Instruction saved')
      onOpenChange(false)
    } catch {
      toast.error('Failed to save instruction')
    }
  }

  const isSaving = createInstruction.isPending || updateInstruction.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'new' ? 'New Instruction' : 'Edit Instruction'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="name_en" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name (EN) <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="name_ar" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name (AR)</FormLabel>
                  <FormControl><Input dir="rtl" {...field} value={field.value ?? ''} /></FormControl>
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="pre-service">Pre-service</SelectItem>
                      <SelectItem value="post-service">Post-service</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="content_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Content Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="pdf">PDF</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>

            <FormField control={form.control} name="content_preview" render={({ field }) => (
              <FormItem>
                <FormLabel>Content Preview (short summary)</FormLabel>
                <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
              </FormItem>
            )} />

            {contentType === 'text' && (
              <FormField control={form.control} name="full_content" render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Text Content</FormLabel>
                  <FormControl><Textarea rows={4} {...field} value={field.value ?? ''} /></FormControl>
                </FormItem>
              )} />
            )}

            {contentType === 'pdf' && (
              <FormField control={form.control} name="pdf_file_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>PDF File Name</FormLabel>
                  <FormControl><Input placeholder="document.pdf" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
