import type { MatrixClient } from 'matrix-js-sdk'
import { Play, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { fetchAuthedMediaBlobUrl } from '../lib/matrix'
import styles from './AttachmentVideoCircle.module.css'

interface AttachmentVideoCircleProps {
  client: MatrixClient
  mxcUrl: string
}

/** Круглое видеосообщение ("кружочек"), свой минимальный плеер: нативные controls не влезают в круг. */
export function AttachmentVideoCircle({ client, mxcUrl }: AttachmentVideoCircleProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    fetchAuthedMediaBlobUrl(client, mxcUrl)
      .then((url) => {
        if (cancelled) return
        objectUrl = url
        setBlobUrl(url)
      })
      .catch((err) => console.error('не удалось загрузить видеосообщение', err))

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [client, mxcUrl])

  function toggle() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play().catch(() => {})
      setPlaying(true)
    } else {
      v.pause()
      setPlaying(false)
    }
  }

  if (!blobUrl) {
    return <div className={styles.placeholder}>Загрузка…</div>
  }

  return (
    <div className={styles.circle}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={blobUrl}
        className={styles.video}
        playsInline
        muted={muted}
        onClick={toggle}
        onEnded={() => setPlaying(false)}
      />
      <button type="button" className={styles.muteButton} onClick={() => setMuted((m) => !m)} title={muted ? 'Включить звук' : 'Выключить звук'}>
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>
      {!playing && (
        <button type="button" className={styles.playOverlay} onClick={toggle} title="Воспроизвести">
          <Play size={28} />
        </button>
      )}
    </div>
  )
}
