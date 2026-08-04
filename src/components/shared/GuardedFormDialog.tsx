'use client'

import {
  forwardRef,
  useImperativeHandle,
  type ReactNode,
} from 'react'
import { useWatch, type FieldValues, type UseFormReturn } from 'react-hook-form'
import { Dialog } from '@/components/ui/dialog'
import { useDirtyDialogGuard } from '@/hooks/useDirtyDialogGuard'

export interface GuardedFormDialogHandle {
  /**
   * Route a close request through the guard — shows the "Discard?" prompt
   * if the form is dirty, otherwise closes silently. Wire this to your
   * Cancel button: `onClick={() => guardRef.current?.requestClose()}`.
   */
  requestClose: () => void
  /**
   * Force-close without prompting. Use this in submit onSuccess so a
   * successful save closes the dialog cleanly without triggering the guard.
   */
  closeAfterSubmit: () => void
}

interface GuardedFormDialogProps<TValues extends FieldValues> {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * The react-hook-form instance whose `formState.isDirty` gates the prompt.
   * `useWatch` under the hood keeps `isDirty` fresh across every keystroke.
   */
  form: UseFormReturn<TValues>
  /** Optional extra dirty signal — OR'd with `form.formState.isDirty`. */
  extraDirty?: boolean
  children: ReactNode
}

/**
 * Drop-in replacement for `<Dialog>` that prompts "Discard unsaved changes?"
 * when the user tries to close a dirty react-hook-form dialog.
 *
 * Retrofit recipe (5 edits per dialog):
 *   1. `import { GuardedFormDialog, type GuardedFormDialogHandle } from '@/components/shared/GuardedFormDialog'`
 *   2. `const guardRef = useRef<GuardedFormDialogHandle>(null)`
 *   3. `<Dialog>` → `<GuardedFormDialog ... form={form} ref={guardRef}>`
 *   4. `</Dialog>` → `</GuardedFormDialog>`
 *   5. In submit onSuccess: `onOpenChange(false)` → `guardRef.current?.closeAfterSubmit()`
 *
 * Cancel button, X icon, click-outside, and Escape all keep working with
 * their existing `onOpenChange(false)` calls — the wrapper intercepts them.
 *
 * For non-RHF (useState) dialogs, use {@link GuardedDialog} instead.
 */
export const GuardedFormDialog = forwardRef(function GuardedFormDialog<
  TValues extends FieldValues,
>(
  { open, onOpenChange, form, extraDirty, children }: GuardedFormDialogProps<TValues>,
  ref: React.Ref<GuardedFormDialogHandle>,
) {
  // Subscribe outer render to every keystroke so formState.isDirty stays
  // fresh in the guard's closure.
  useWatch({ control: form.control })
  const isDirty = form.formState.isDirty || Boolean(extraDirty)

  const { guardedOnOpenChange, confirmDialog, closeWithoutPrompt } =
    useDirtyDialogGuard({ isDirty, onOpenChange })

  useImperativeHandle(
    ref,
    () => ({
      requestClose: () => guardedOnOpenChange(false),
      closeAfterSubmit: closeWithoutPrompt,
    }),
    [guardedOnOpenChange, closeWithoutPrompt],
  )

  return (
    <>
      <Dialog open={open} onOpenChange={guardedOnOpenChange}>
        {children}
      </Dialog>
      {confirmDialog}
    </>
  )
}) as <TValues extends FieldValues>(
  props: GuardedFormDialogProps<TValues> & { ref?: React.Ref<GuardedFormDialogHandle> },
) => React.ReactElement

interface GuardedDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Caller-computed dirty state (compare against seeded values). */
  isDirty: boolean
  children: ReactNode
}

/**
 * Same shape as {@link GuardedFormDialog} but for dialogs that hold form state
 * in `useState` rather than react-hook-form. Caller computes `isDirty`
 * manually against seeded values.
 */
export const GuardedDialog = forwardRef<GuardedFormDialogHandle, GuardedDialogProps>(
  function GuardedDialog({ open, onOpenChange, isDirty, children }, ref) {
    const { guardedOnOpenChange, confirmDialog, closeWithoutPrompt } =
      useDirtyDialogGuard({ isDirty, onOpenChange })

    useImperativeHandle(
      ref,
      () => ({
        requestClose: () => guardedOnOpenChange(false),
        closeAfterSubmit: closeWithoutPrompt,
      }),
      [guardedOnOpenChange, closeWithoutPrompt],
    )

    return (
      <>
        <Dialog open={open} onOpenChange={guardedOnOpenChange}>
          {children}
        </Dialog>
        {confirmDialog}
      </>
    )
  },
)
