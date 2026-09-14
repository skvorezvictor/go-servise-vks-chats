import { Send, Square, Trash2, Video } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import styles from './VideoCircleRecorderButton.module.css'

interface VideoCircleRecorderButtonProps {
  onSend: (blob: Blob) => void
  disabled?: boolean
}

/** Круглое видеосообщение ("кружочек"), тот же паттерн, что VoiceRecorderButton, плюс живой превью с камеры. */
export function VideoCircleRecorderButton({ onSend, disabled }: VideoCircleRecorderButtonProps) {
  const [recording, setRecording] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // <video> монтируется только когда recording=true (условный рендер), а
  // srcObject выставлялся сразу после getUserMedia, до того, как ref вообще
  // мог указывать на реальный элемент, поэтому превью никогда не появлялось.
  // Переносим назначение в эффект, который срабатывает после перерендера.
  useEffect(() => {
    if (recording && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [recording])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 320, facingMode: 'user' },
        audio: true,
      })
      streamRef.current = stream
      chunksRef.current = []

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
    } catch (err) {
      console.error('не удалось получить доступ к камере', err)
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
      const blob = new Blob(chunksRef.current, { type: 'video/webm' })
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
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} className={styles.preview} muted playsInline />
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
    <button type="button" className={styles.trigger} onClick={startRecording} disabled={disabled} title="Видеосообщение">
      <Video size={18} />
    </button>
  )
}
