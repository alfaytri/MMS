// src/components/services/InstructionsTab.tsx
'use client'

import { useState } from 'react'
import { Plus, Pencil, Archive, Link2, Unlink, FileText, Image, Video, AlignLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  useInstructionsFull, useArchiveInstruction, useAllServiceInstructionLinks,
  useLinkInstruction, useUnlinkInstruction,
  type InstructionFull, type ServiceInstructionLink,
} from '@/hooks/useServices'
import { InstructionEditDialog } from './InstructionEditDialog'

const CONTENT_ICON: Record<string, React.ReactNode> = {
  text: <AlignLeft className="h-3 w-3" />,
  pdf: <FileText className="h-3 w-3" />,
  image: <Image className="h-3 w-3" />,
  video: <Video className="h-3 w-3" />,
}

const CONTENT_COLOR: Record<string, string> = {
  text: 'bg-slate-100 text-slate-600',
  pdf: 'bg-red-100 text-red-600',
  image: 'bg-purple-100 text-purple-600',
  video: 'bg-orange-100 text-orange-600',
}

const TYPE_COLOR: Record<string, string> = {
  'pre-service': 'bg-blue-100 text-blue-700',
  'post-service': 'bg-green-100 text-green-700',
}

interface InstructionsTabProps {
  enabled: boolean
}

export function InstructionsTab({ enabled }: InstructionsTabProps) {
  const [editDialog, setEditDialog] = useState<{
    open: boolean; mode: 'new' | 'edit'; instruction: InstructionFull | null
  }>({ open: false, mode: 'new', instruction: null })

  return (
    <>
      <Tabs defaultValue="materials" className="flex flex-col h-full">
        <div className="px-4 pt-2 border-b border-border">
          <TabsList className="h-8 bg-transparent p-0 gap-4">
            <TabsTrigger value="materials" className="text-xs px-0 py-1.5 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none">
              Materials
            </TabsTrigger>
            <TabsTrigger value="links" className="text-xs px-0 py-1.5 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none">
              Service Links
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="materials" className="flex-1 overflow-auto m-0">
          <MaterialsSubTab
            enabled={enabled}
            onNew={() => setEditDialog({ open: true, mode: 'new', instruction: null })}
            onEdit={(i) => setEditDialog({ open: true, mode: 'edit', instruction: i })}
          />
        </TabsContent>

        <TabsContent value="links" className="flex-1 overflow-auto m-0">
          <ServiceLinksSubTab enabled={enabled} />
        </TabsContent>
      </Tabs>

      <InstructionEditDialog
        open={editDialog.open}
        onOpenChange={(open) => setEditDialog((s) => ({ ...s, open }))}
        mode={editDialog.mode}
        instruction={editDialog.instruction}
      />
    </>
  )
}

interface MaterialsSubTabProps {
  enabled: boolean
  onNew: () => void
  onEdit: (i: InstructionFull) => void
}

function MaterialsSubTab({ enabled, onNew, onEdit }: MaterialsSubTabProps) {
  const { data: instructions = [], isLoading } = useInstructionsFull(enabled)
  const archiveInstruction = useArchiveInstruction()
  const [archiveTarget, setArchiveTarget] = useState<InstructionFull | null>(null)
  const [search, setSearch] = useState('')

  const filtered = instructions.filter((i) =>
    i.name_en.toLowerCase().includes(search.toLowerCase()) ||
    (i.name_ar ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Input
          placeholder="Search instructions…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs w-64"
        />
        <Button size="sm" className="h-7 text-[11px] gap-1 ml-auto" onClick={onNew}>
          <Plus className="h-3.5 w-3.5" />New Instruction
        </Button>
      </div>

      <div className="p-4">
        <div className="rounded border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-[11px] h-8">Name</TableHead>
                <TableHead className="text-[11px] h-8">Type</TableHead>
                <TableHead className="text-[11px] h-8">Content</TableHead>
                <TableHead className="text-[11px] h-8">Status</TableHead>
                <TableHead className="text-[11px] h-8 w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                    {search ? 'No instructions match your search' : 'No instructions yet'}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((instruction) => (
                <TableRow key={instruction.id} className="text-xs">
                  <TableCell>
                    <div className="font-medium">{instruction.name_en}</div>
                    {instruction.name_ar && (
                      <div className="text-[10px] text-muted-foreground" dir="rtl">{instruction.name_ar}</div>
                    )}
                    {instruction.content_preview && (
                      <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                        {instruction.content_preview}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`text-[10px] px-1.5 py-0 border-0 ${TYPE_COLOR[instruction.type] ?? ''}`}
                    >
                      {instruction.type === 'pre-service' ? 'Pre' : 'Post'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`text-[10px] px-1.5 py-0 gap-1 border-0 ${CONTENT_COLOR[instruction.content_type ?? 'text'] ?? ''}`}
                    >
                      {CONTENT_ICON[instruction.content_type ?? 'text']}
                      {instruction.content_type ?? 'text'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={instruction.status === 'active'
                        ? 'border-green-500 text-green-600 text-[10px]'
                        : 'text-[10px] text-muted-foreground'}
                    >
                      {instruction.status ?? 'active'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => onEdit(instruction)}
                        aria-label="Edit instruction"
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => setArchiveTarget(instruction)}
                        aria-label="Archive instruction"
                      >
                        <Archive className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Instruction</AlertDialogTitle>
            <AlertDialogDescription>
              Archive &ldquo;{archiveTarget?.name_en}&rdquo;? It will be deactivated and hidden from active lists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!archiveTarget) return
                archiveInstruction.mutate(archiveTarget.id, {
                  onSuccess: () => toast.success('Instruction archived'),
                  onError: () => toast.error('Failed to archive'),
                })
                setArchiveTarget(null)
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ServiceLinksSubTab({ enabled }: { enabled: boolean }) {
  const { data: links = [], isLoading } = useAllServiceInstructionLinks(enabled)
  const unlinkInstruction = useUnlinkInstruction()
  const { data: instructions = [] } = useInstructionsFull(enabled)
  const [search, setSearch] = useState('')
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [newServiceId, setNewServiceId] = useState('')
  const [newInstructionId, setNewInstructionId] = useState('')
  const linkInstruction = useLinkInstruction()

  const filtered = links.filter((l) => {
    const instrName = (l.instructions as { name_en?: string } | null)?.name_en?.toLowerCase() ?? ''
    const svcName = (l.services as { name_en?: string } | null)?.name_en?.toLowerCase() ?? ''
    const q = search.toLowerCase()
    return instrName.includes(q) || svcName.includes(q)
  })

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Input
          placeholder="Search by instruction or service name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs w-72"
        />
        <Button size="sm" className="h-7 text-[11px] gap-1 ml-auto" onClick={() => setLinkDialogOpen(true)}>
          <Link2 className="h-3.5 w-3.5" />New Link
        </Button>
      </div>

      <div className="p-4">
        <div className="rounded border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-[11px] h-8">Instruction</TableHead>
                <TableHead className="text-[11px] h-8">Type</TableHead>
                <TableHead className="text-[11px] h-8">Service</TableHead>
                <TableHead className="text-[11px] h-8">Tree</TableHead>
                <TableHead className="text-[11px] h-8 w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                    {search ? 'No links match your search' : 'No service-instruction links yet'}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((link: ServiceInstructionLink) => {
                const instr = link.instructions as { id?: string; name_en?: string; type?: string; content_type?: string } | null
                const svc = link.services as { id?: string; name_en?: string; tree_type?: string } | null
                return (
                  <TableRow key={`${link.service_id}-${link.instruction_id}`} className="text-xs">
                    <TableCell className="font-medium">{instr?.name_en ?? '—'}</TableCell>
                    <TableCell>
                      {instr?.type && (
                        <Badge className={`text-[10px] px-1.5 py-0 border-0 ${TYPE_COLOR[instr.type] ?? ''}`}>
                          {instr.type === 'pre-service' ? 'Pre' : 'Post'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{svc?.name_en ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground capitalize">{svc?.tree_type ?? '—'}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6"
                        aria-label="Remove link"
                        onClick={() =>
                          unlinkInstruction.mutate(
                            { serviceId: link.service_id, instructionId: link.instruction_id },
                            {
                              onSuccess: () => toast.success('Link removed'),
                              onError: () => toast.error('Failed to remove link'),
                            },
                          )
                        }
                      >
                        <Unlink className="h-3 w-3 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Quick link dialog — paste service ID + pick instruction */}
      <AlertDialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Link Instruction to Service</AlertDialogTitle>
            <AlertDialogDescription>
              Enter the Service ID and select an instruction to link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 my-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Service ID (UUID)</label>
              <Input
                className="h-8 text-xs font-mono"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={newServiceId}
                onChange={(e) => setNewServiceId(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Instruction</label>
              <select
                className="w-full h-8 rounded border border-input bg-background text-xs px-2"
                value={newInstructionId}
                onChange={(e) => setNewInstructionId(e.target.value)}
              >
                <option value="">Select instruction…</option>
                {instructions.map((i) => (
                  <option key={i.id} value={i.id}>{i.name_en} ({i.type})</option>
                ))}
              </select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setNewServiceId(''); setNewInstructionId('') }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!newServiceId || !newInstructionId) return
                linkInstruction.mutate(
                  { serviceId: newServiceId, instructionId: newInstructionId },
                  {
                    onSuccess: () => { toast.success('Link created'); setLinkDialogOpen(false); setNewServiceId(''); setNewInstructionId('') },
                    onError: () => toast.error('Failed to create link'),
                  },
                )
              }}
            >
              Link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
