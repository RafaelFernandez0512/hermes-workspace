import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { steerAgent } from '@/lib/gateway-api'

type SteerMode = 'send_guidance' | 'reroute' | 'escalate_review'

const MODE_COPY: Record<SteerMode, { title: string; submit: string; placeholder: string; description: string }> = {
  send_guidance: {
    title: 'Send guidance',
    submit: 'Send guidance',
    placeholder: 'What should the agent do next?',
    description: 'Send a directive to influence this agent’s next steps.',
  },
  reroute: {
    title: 'Reroute',
    submit: 'Reroute',
    placeholder: 'Describe the new direction for this agent…',
    description: 'Redirect the agent to a different approach or task.',
  },
  escalate_review: {
    title: 'Escalate for review',
    submit: 'Escalate',
    placeholder: 'Describe the issue that needs human review…',
    description: 'Flag this agent’s work for human review.',
  },
}

type SteerModalProps = {
  open: boolean
  agentName: string
  sessionKey?: string
  onOpenChange: (open: boolean) => void
  mode?: SteerMode
}

export function SteerModal({
  open,
  agentName,
  sessionKey,
  onOpenChange,
  mode = 'send_guidance',
}: SteerModalProps) {
  const copy = MODE_COPY[mode]
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) {
      setMessage('')
      setPending(false)
    }
  }, [open])

  async function handleSend() {
    const trimmedMessage = message.trim()
    const normalizedSessionKey = sessionKey?.trim() ?? ''
    if (!trimmedMessage || !normalizedSessionKey || pending) return

    setPending(true)
    try {
      await steerAgent(normalizedSessionKey, trimmedMessage)
      toast(`${copy.submit} sent to ${agentName}`, { type: 'success' })
      setMessage('')
      onOpenChange(false)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to send directive'
      toast(message, { type: 'error' })
    } finally {
      setPending(false)
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(560px,92vw)]">
        <div className="space-y-4 p-5">
          <div className="space-y-1">
            <DialogTitle className="text-base">{copy.title}: {agentName}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </div>

          <textarea
            value={message}
            rows={5}
            placeholder={copy.placeholder}
            disabled={pending}
            onChange={function onChangeMessage(event) {
              setMessage(event.target.value)
            }}
            className="w-full resize-y rounded-lg border border-primary-200 bg-primary-100/70 px-3 py-2 text-sm text-primary-900 outline-none transition-colors focus:border-accent-400 disabled:cursor-not-allowed disabled:opacity-70"
          />

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={function onClickCancel() {
                onOpenChange(false)
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={pending || message.trim().length === 0 || !sessionKey}
              onClick={function onClickSend() {
                void handleSend()
              }}
              className="bg-accent-500 text-white hover:bg-accent-600"
            >
              {pending ? `${copy.submit}…` : copy.submit}
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
