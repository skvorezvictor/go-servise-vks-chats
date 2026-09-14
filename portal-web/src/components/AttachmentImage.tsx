import type { MatrixClient } from 'matrix-js-sdk'
import { useEffect, useRef, useState } from 'react'
import { fetchAuthedMediaBlobUrl, fetchAuthedThumbnail } from '../lib/matrix'
import { ImageLightbox } from './ImageLightbox'
import styles from './AttachmentImage.module.css'

interface AttachmentImageProps {
  client: MatrixClient
  mxcUrl: string
  name: string
}

/**
 * Превью 320px через авторизованный fetch (раздел 13 инструкции). Synapse
 * без dynamic_thumbnails отдаёт 400 на любой размер, не входящий в его
 * список thumbnail_sizes, в этом случае откатываемся на полноразмерное
 * изображение вместо вечного "Загрузка изображения…".
 */
export function AttachmentImage({ client, mxcUrl, name }: AttachmentImageProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [fullUrl, setFullUrl] = useState<string | null>(null)
  const fullUrlRef = useRef<string | null>(null)

  async function openLightbox() {
    setLightboxOpen(true)
    if (!fullUrlRef.current) {
      const url = await fetchAuthedMediaBlobUrl(client, mxcUrl)
      fullUrlRef.current = url
      setFullUrl(url)
    }
  }

  useEffect(() => {
    return () => {
      if (fullUrlRef.current) URL.revokeObjectURL(fullUrlRef.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    async function load() {
      try {
        let url = await fetchAuthedThumbnail(client, mxcUrl)
        if (!url) url = await fetchAuthedMediaBlobUrl(client, mxcUrl)
        if (cancelled) return
        if (url) {
          objectUrl = url
          setBlobUrl(url)
        } else {
          setFailed(true)
        }
      } catch (err) {
        console.error('не удалось загрузить превью изображения', err)
        if (!cancelled) setFailed(true)
      }
    }

    load()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [client, mxcUrl])

  if (failed) {
    return <div className={styles.placeholder}>Не удалось загрузить изображение</div>
  }

  if (!blobUrl) {
    return <div className={styles.placeholder}>Загрузка изображения…</div>
  }

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <img src={blobUrl} alt={name} className={styles.image} onClick={openLightbox} />
      {lightboxOpen && <ImageLightbox src={fullUrl ?? blobUrl} alt={name} onClose={() => setLightboxOpen(false)} />}
    </>
  )
}
