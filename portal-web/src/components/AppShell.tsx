import { useEffect, useState } from 'react'
import { Outlet } from 'react-router'
import { getMatrixClient, setupNotifications } from '../lib/matrix'
import { CreateConferenceModal } from './CreateConferenceModal'
import { NavRail } from './NavRail'
import { Watermark } from './Watermark'
import styles from './AppShell.module.css'

/**
 * Обёртка для chats/contacts/calls/profile. Намеренно НЕ используется для
 * /app/call/:room, та страница рендерится отдельным роутом верхнего уровня
 * (см. router.tsx), чтобы внешний гость по прямой ссылке никогда не видел
 * этот сайдбар, и чтобы видео-контейнер не зависел от flex-родителя
 * (раздел 11.3 инструкции, один раз это уже приводило к схлопыванию высоты).
 */
export function AppShell() {
  const [newConferenceOpen, setNewConferenceOpen] = useState(false)

  // Один раз на всё приложение (не на каждое открытие ChatsPage), раздел
  // 15.9 инструкции, уведомления должны срабатывать для любой комнаты,
  // не только открытой.
  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    getMatrixClient()
      .then((client) => {
        unsubscribe = setupNotifications(client)
      })
      .catch(() => {})
    return () => unsubscribe?.()
  }, [])

  return (
    <div className={styles.shell}>
      <NavRail onStartConference={() => setNewConferenceOpen(true)} />
      <main className={styles.content}>
        <Watermark />
        <Outlet />
      </main>
      {newConferenceOpen && <CreateConferenceModal onClose={() => setNewConferenceOpen(false)} />}
    </div>
  )
}
