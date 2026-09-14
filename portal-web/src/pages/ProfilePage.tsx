import type { MatrixClient } from 'matrix-js-sdk'
import { Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { VersionStamp } from '../components/VersionStamp'
import { useTheme } from '../hooks/useTheme'
import { fetchAbout, saveAbout } from '../lib/profileApi'
import { getMatrixClient, setAvatar } from '../lib/matrix'
import styles from './ProfilePage.module.css'

export function ProfilePage() {
  const { theme, setTheme } = useTheme()
  const [client, setClient] = useState<MatrixClient | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [about, setAboutText] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getMatrixClient()
      .then((c) => {
        setClient(c)
        return fetchAbout(c)
      })
      .then(setAboutText)
      .catch((err) => {
        console.error('не удалось загрузить профиль', err)
        setError('Не удалось загрузить профиль')
      })
  }, [])

  useEffect(() => {
    if (!client) return
    const userId = client.getUserId()
    const user = userId ? client.getUser(userId) : null
    setAvatarUrl(user?.avatarUrl ?? null)
  }, [client])

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !client) return

    setUploadingAvatar(true)
    try {
      await setAvatar(client, file)
      const userId = client.getUserId()
      const user = userId ? client.getUser(userId) : null
      setAvatarUrl(user?.avatarUrl ?? null)
    } catch (err) {
      console.error('не удалось обновить аватар', err)
    } finally {
      setUploadingAvatar(false)
    }
  }

  function handleAboutBlur() {
    if (!client) return
    saveAbout(client, about).catch((err) => console.error('не удалось сохранить "о себе"', err))
  }

  function handleSignOut() {
    window.location.href = '/oauth2/sign_out'
  }

  if (error) return <div className={styles.centered}>{error}</div>
  if (!client) return <div className={styles.centered}>Загрузка…</div>

  const displayName = (() => {
    const userId = client.getUserId()
    return (userId ? client.getUser(userId)?.displayName : null) ?? userId ?? ''
  })()

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.avatarSection}>
          <Avatar mxcUrl={avatarUrl} name={displayName} size={88} />
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarChange} />
          <button type="button" className={styles.changeAvatar} onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar}>
            {uploadingAvatar ? 'Загрузка…' : 'Сменить фото'}
          </button>
        </div>

        <div className={styles.name}>{displayName}</div>

        <label className={styles.aboutLabel}>
          О себе
          <textarea
            className={styles.aboutInput}
            value={about}
            onChange={(e) => setAboutText(e.target.value.slice(0, 300))}
            onBlur={handleAboutBlur}
            maxLength={300}
            rows={4}
            placeholder="Расскажите о себе"
          />
        </label>

        <button
          type="button"
          className={styles.themeToggle}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
          {theme === 'dark' ? 'Тёмная тема' : 'Светлая тема'}
        </button>

        <button type="button" className={styles.signOut} onClick={handleSignOut}>
          Выйти
        </button>
      </div>

      <VersionStamp />
    </div>
  )
}
