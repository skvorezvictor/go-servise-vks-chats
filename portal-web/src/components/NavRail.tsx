import { MessageCircle, Phone, User, Users, Video } from 'lucide-react'
import { NavLink } from 'react-router'
import styles from './NavRail.module.css'

const items = [
  { to: '/app/chats', label: 'Чаты', icon: MessageCircle },
  { to: '/app/contacts', label: 'Контакты', icon: Users },
  { to: '/app/calls', label: 'Звонки', icon: Phone },
  { to: '/app/profile', label: 'Профиль', icon: User },
]

interface NavRailProps {
  onStartConference: () => void
}

/**
 * Кнопка «начать конференцию», отдельная от навигации, снизу, доступна
 * с любой страницы (чаты/контакты/звонки/профиль), а не только из шапки
 * списка чатов, так было в исходном, утраченном фронтенде.
 */
export function NavRail({ onStartConference }: NavRailProps) {
  return (
    <nav className={styles.rail}>
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => (isActive ? `${styles.item} ${styles.active}` : styles.item)}
        >
          <Icon size={22} />
          <span>{label}</span>
        </NavLink>
      ))}
      <button type="button" className={styles.startCall} onClick={onStartConference} title="Начать видеозвонок">
        <Video size={20} />
      </button>
    </nav>
  )
}
