import type { MatrixClient } from 'matrix-js-sdk'
import { useEffect, useState } from 'react'
import { fetchAuthedMediaBlobUrl } from '../lib/matrix'
import styles from './AttachmentAudio.module.css'

interface AttachmentAudioProps {
  client: MatrixClient
  mxcUrl: string
}

/** Голосовое сообщение, тот же приём авторизованного fetch, что и у остальных вложений. */
export function AttachmentAudio({ client, mxcUrl }: AttachmentAudioProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    fetchAuthedMediaBlobUrl(client, mxcUrl)
      .then((url) => {
        if (cancelled) return
        objectUrl = url
        setBlobUrl(url)
      })
      .catch((err) => console.error('не удалось загрузить голосовое сообщение', err))

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [client, mxcUrl])

  if (!blobUrl) {
    return <div className={styles.placeholder}>Загрузка…</div>
  }

  return <audio className={styles.audio} src={blobUrl} controls />
}
