'use client'

import { useActionState, useRef } from 'react'
import { deleteAvatar, type DeleteAvatarState } from '@/app/actions/avatars'

export function DeleteAvatarButton({ avatarId, avatarName }: { avatarId: string; avatarName: string }) {
  const [state, formAction, pending] = useActionState<DeleteAvatarState, FormData>(deleteAvatar, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="avatarId" value={avatarId} />
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            window.confirm(
              `Delete "${avatarName}"? This permanently removes all its platform connections, content, and metric history. This can't be undone.`
            )
          ) {
            formRef.current?.requestSubmit()
          }
        }}
        className="rounded-md border border-red-900 px-3 py-1.5 text-sm text-red-400 transition hover:bg-red-950/40 disabled:opacity-50"
      >
        {pending ? 'Deleting…' : 'Delete avatar'}
      </button>
      {state?.error && <p className="mt-2 text-sm text-red-400">{state.error}</p>}
    </form>
  )
}
