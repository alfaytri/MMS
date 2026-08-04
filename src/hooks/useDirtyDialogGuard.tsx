'use client'

import { useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface UseDirtyDialogGuardArgs {
  isDirty: boolean
  onOpenChange: (open: boolean) => void
  /** Text for the confirm-title. Defaults to "Discard unsaved changes?" */
  title?: string
  /** Text for the confirm-body. Defaults to a sensible one. */
  description?: string
  /** Label for the destructive action. Defaults to "Discard". */
  discardLabel?: string
  /** Label for the safe action. Defaults to "Keep editing". */
  keepLabel?: string
}

interface UseDirtyDialogGuardResult {
  /** Wire this to `<Dialog onOpenChange={...}>` and to your Cancel button. */
  guardedOnOpenChange: (open: boolean) => void
  /** Render this JSX inside your component (usually right after `<Dialog>`). */
  confirmDialog: ReactNode
  /**
   * Force-close without prompting. Use inside your submit success handler
   * so a successful save closes the dialog cleanly.
   */
  closeWithoutPrompt: () => void
}

/**
 * Prompt "Discard unsaved changes?" when the user tries to dismiss a dialog
 * (click outside, Escape, Cancel button, X icon) while `isDirty` is true.
 *
 * Usage:
 *   const { guardedOnOpenChange, confirmDialog, closeWithoutPrompt } =
 *     useDirtyDialogGuard({ isDirty: form.formState.isDirty, onOpenChange })
 *
 *   return (
 *     <>
 *       <Dialog open={open} onOpenChange={guardedOnOpenChange}>
 *         ...
 *         <Button onClick={() => guardedOnOpenChange(false)}>Cancel</Button>
 *       </Dialog>
 *       {confirmDialog}
 *     </>
 *   )
 *
 * In your submit onSuccess, call `closeWithoutPrompt()` instead of
 * `onOpenChange(false)` so a real save closes without asking.
 */
export function useDirtyDialogGuard({
  isDirty,
  onOpenChange,
  title = 'Discard unsaved changes?',
  description = 'You have unsaved changes. If you close now, they will be lost.',
  discardLabel = 'Discard',
  keepLabel = 'Keep editing',
}: UseDirtyDialogGuardArgs): UseDirtyDialogGuardResult {
  const [confirmOpen, setConfirmOpen] = useState(false)

  function guardedOnOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true)
      return
    }
    if (isDirty) {
      setConfirmOpen(true)
      return
    }
    onOpenChange(false)
  }

  function closeWithoutPrompt() {
    setConfirmOpen(false)
    onOpenChange(false)
  }

  const confirmDialog = (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{keepLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setConfirmOpen(false)
              onOpenChange(false)
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {discardLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return { guardedOnOpenChange, confirmDialog, closeWithoutPrompt }
}
