import { Mic, Send, Square, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import styles from './VoiceRecorderButton.module.css'

interface VoiceRecorderButtonProps {
  onSend: (blob: Blob) => void
  disabled?: boolean
}

export function VoiceRecorderButton({ onSend, disabled }: VoiceRecorderButtonProps) {
  const [recording, setRecording] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
    } catch (err) {
      console.error('не удалось получить доступ к микрофону', err)
    }
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null
    setRecording(false)
  }

  function handleSend() {
    const recorder = recorderRef.current
    if (!recorder) return
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      if (blob.size > 0) onSend(blob)
      stopStream()
    }
    recorder.stop()
  }

  function handleCancel() {
    const recorder = recorderRef.current
    if (recorder) recorder.onstop = () => stopStream()
    recorder?.stop()
    stopStream()
  }

  if (recording) {
    return (
      <div className={styles.recording}>
        <button type="button" className={styles.cancel} onClick={handleCancel} title="Отменить">
          <Trash2 size={16} />
        </button>
        <span className={styles.indicator}>
          <Square size={8} className={styles.dot} /> Запись…
        </span>
        <button type="button" className={styles.confirm} onClick={handleSend} title="Отправить">
          <Send size={16} />
        </button>
      </div>
    )
  }

  return (
    <button type="button" className={styles.mic} onClick={startRecording} disabled={disabled} title="Голосовое сообщение">
      <Mic size={18} />
    </button>
  )
}
