'use client'

import { useActionState, useRef, useState } from 'react'
import { deleteAvatar, type DeleteAvatarState } from '@/app/actions/avatars'

export function DeleteAvatarButton({ avatarId, avatarName }: { avatarId: string; avatarName: string }) {
  const [state, formAction, pending] = useActionState<DeleteAvatarState, FormData>(deleteAvatar, undefined)
  const formRef = useRef<HTMLFormElement>(null)
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="avatarId" value={avatarId} />
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(true)}
          className="rounded-md border border-red-900 px-3 py-1.5 text-sm text-red-400 transition hover:bg-red-950/40 disabled:opacity-50"
        >
          {pending ? 'Deleting…' : 'Delete avatar'}
        </button>
        {state?.error && <p className="mt-2 text-sm text-red-400">{state.error}</p>}
      </form>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setConfirming(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-avatar-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
          >
            <h2 id="delete-avatar-title" className="text-base font-semibold text-neutral-100">
              Delete &quot;{avatarName}&quot;?
            </h2>
            <p className="mt-2 text-sm text-neutral-400">
              This permanently removes all its platform connections, content, and metric history
              from the database. This can&apos;t be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setConfirming(false)
                  formRef.current?.requestSubmit()
                }}
                className="rounded-md bg-red-900 px-3 py-1.5 text-sm font-medium text-red-100 transition hover:bg-red-800"
              >
                Yes, delete it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
