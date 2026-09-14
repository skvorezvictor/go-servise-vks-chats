import type { MatrixClient } from 'matrix-js-sdk'
import { File as FileIcon, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { fetchAuthedMediaBlobUrl } from '../lib/matrix'
import styles from './AttachmentFile.module.css'

interface AttachmentFileProps {
  client: MatrixClient
  mxcUrl: string
  name: string
}

/**
 * Файл качается по клику через авторизованный fetch (не заранее для каждого
 * файла в ленте, раздел 13 инструкции). Ссылка ведёт на blob:, скачивание
 * запускает сам браузер по стандартному поведению <a download>.
 */
export function AttachmentFile({ client, mxcUrl, name }: AttachmentFileProps) {
  const [loading, setLoading] = useState(false)

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    try {
      const blobUrl = await fetchAuthedMediaBlobUrl(client, mxcUrl)
      if (!blobUrl) return
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch (err) {
      console.error('не удалось скачать файл', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <a href="#" className={styles.file} onClick={handleClick}>
      {loading ? <Loader2 size={18} className={styles.spin} /> : <FileIcon size={18} />}
      <span className={styles.name}>{name}</span>
    </a>
  )
}
