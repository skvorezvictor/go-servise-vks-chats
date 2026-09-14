import { useEffect, useState } from 'react'
import { fetchAuthedMediaBlobUrl, getMatrixClient } from '../lib/matrix'
import styles from './Avatar.module.css'

interface AvatarProps {
  mxcUrl?: string | null
  name: string
  size?: number
}

/**
 * Единственное место в приложении, где mxc:// превращается в реальную
 * картинку, через авторизованный fetch (см. fetchAuthedMediaBlobUrl,
 * раздел 10.6.3 инструкции). Без аватарки показывает первую букву имени.
 */
export function Avatar({ mxcUrl, name, size = 40 }: AvatarProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!mxcUrl) {
      setBlobUrl(null)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null

    getMatrixClient()
      .then((client) => fetchAuthedMediaBlobUrl(client, mxcUrl, { width: size * 2, height: size * 2 }))
      .then((url) => {
        if (cancelled) return
        objectUrl = url
        setBlobUrl(url)
      })
      .catch((err) => console.error('не удалось загрузить аватар', err))

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [mxcUrl, size])

  const style = { width: size, height: size, fontSize: size * 0.42 }

  if (blobUrl) {
    return <img src={blobUrl} alt={name} className={styles.avatar} style={style} />
  }

  return (
    <div className={styles.fallback} style={style}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  )
}
