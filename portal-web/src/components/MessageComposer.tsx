import { BarChart2, Paperclip, Send, Smile, X } from 'lucide-react'
import { type KeyboardEvent, useRef, useState } from 'react'
import { MAX_ATTACHMENT_SIZE } from '../lib/matrix'
import { EmojiPickerPopover } from './EmojiPickerPopover'
import { MentionAutocomplete } from './MentionAutocomplete'
import styles from './MessageComposer.module.css'
import { VideoCircleRecorderButton } from './VideoCircleRecorderButton'
import { VoiceRecorderButton } from './VoiceRecorderButton'

export interface ReplyTarget {
  eventId: string
  senderName: string
  snippet: string
}

interface MessageComposerProps {
  onSend: (text: string) => void
  onAttach: (file: File, onProgress: (fraction: number) => void) => Promise<void>
  onSendVoice: (blob: Blob) => void
  onSendVideoCircle: (blob: Blob) => void
  onCreatePoll: () => void
  memberNames: string[]
  replyingTo: ReplyTarget | null
  onCancelReply: () => void
  disabled?: boolean
}

/** Полоска прогресса показывается, только если загрузка идёт дольше 3с, не мелькать на мгновенных отправках. */
const PROGRESS_BAR_DELAY_MS = 3000

export function MessageComposer({
  onSend,
  onAttach,
  onSendVoice,
  onSendVideoCircle,
  onCreatePoll,
  memberNames,
  replyingTo,
  onCancelReply,
  disabled,
}: MessageComposerProps) {
  const [value, setValue] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [showProgressBar, setShowProgressBar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function submit() {
    const text = value.trim()
    if (!text) return
    onSend(text)
    setValue('')
    setMentionQuery(null)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && mentionQuery === null) {
      e.preventDefault()
      submit()
    } else if (e.key === 'Escape' && replyingTo) {
      onCancelReply()
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value
    setValue(text)

    const cursor = e.target.selectionStart
    const beforeCursor = text.slice(0, cursor)
    const match = /@([^\s@]*)$/.exec(beforeCursor)
    setMentionQuery(match ? match[1] : null)
  }

  function pickMention(name: string) {
    const cursor = textareaRef.current?.selectionStart ?? value.length
    const beforeCursor = value.slice(0, cursor)
    const afterCursor = value.slice(cursor)
    const replaced = beforeCursor.replace(/@([^\s@]*)$/, `@${name} `)
    setValue(replaced + afterCursor)
    setMentionQuery(null)
    textareaRef.current?.focus()
  }

  async function uploadFile(file: File) {
    setAttachError(null)
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setAttachError('Файл больше 1 ГБ, выберите файл поменьше')
      return
    }

    setUploadProgress(0)
    const delayTimer = setTimeout(() => setShowProgressBar(true), PROGRESS_BAR_DELAY_MS)
    try {
      await onAttach(file, (fraction) => setUploadProgress(fraction))
    } catch (err) {
      console.error('не удалось отправить вложение', err)
      setAttachError(err instanceof Error ? err.message : 'Не удалось отправить файл')
    } finally {
      clearTimeout(delayTimer)
      setUploadProgress(null)
      setShowProgressBar(false)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) await uploadFile(file)
  }

  /** Вставка скриншота из буфера обмена (Ctrl+V), отправляется как обычное вложение-картинка. */
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          uploadFile(file)
          return
        }
      }
    }
  }

  const filteredNames =
    mentionQuery !== null
      ? memberNames.filter((name) => name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
      : []

  return (
    <div className={styles.wrapper}>
      {replyingTo && (
        <div className={styles.replyBanner}>
          <div className={styles.replyText}>
            <span className={styles.replySender}>{replyingTo.senderName}</span>
            <span className={styles.replySnippet}>{replyingTo.snippet}</span>
          </div>
          <button type="button" onClick={onCancelReply} className={styles.replyCancel}>
            <X size={16} />
          </button>
        </div>
      )}

      {showProgressBar && uploadProgress !== null && (
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
        </div>
      )}

      {attachError && (
        <div className={styles.attachError}>
          {attachError}
          <button type="button" onClick={() => setAttachError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className={styles.composer}>
        <input ref={fileInputRef} type="file" hidden onChange={handleFileChange} />

        <button type="button" className={styles.iconButton} onClick={() => fileInputRef.current?.click()} disabled={disabled} title="Прикрепить файл">
          <Paperclip size={18} />
        </button>
        <button type="button" className={styles.iconButton} onClick={onCreatePoll} disabled={disabled} title="Опрос">
          <BarChart2 size={18} />
        </button>

        <div className={styles.inputWrapper}>
          {filteredNames.length > 0 && <MentionAutocomplete names={filteredNames} onPick={pickMention} />}
          <textarea
            ref={textareaRef}
            className={styles.input}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Сообщение… (@ для упоминания)"
            rows={1}
            disabled={disabled}
          />
        </div>

        <div className={styles.emojiWrapper}>
          <button type="button" className={styles.iconButton} onClick={() => setEmojiOpen((v) => !v)} disabled={disabled} title="Эмодзи">
            <Smile size={18} />
          </button>
          {emojiOpen && (
            <EmojiPickerPopover
              align="right"
              onPick={(emoji) => {
                setValue((v) => v + emoji)
                setEmojiOpen(false)
              }}
              onClose={() => setEmojiOpen(false)}
            />
          )}
        </div>

        {value.trim() ? (
          <button type="button" className={styles.send} onClick={submit} disabled={disabled}>
            <Send size={18} />
          </button>
        ) : (
          <>
            <VideoCircleRecorderButton onSend={onSendVideoCircle} disabled={disabled} />
            <VoiceRecorderButton onSend={onSendVoice} disabled={disabled} />
          </>
        )}
      </div>
    </div>
  )
}
