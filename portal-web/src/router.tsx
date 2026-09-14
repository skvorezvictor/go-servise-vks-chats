import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from './components/AppShell'
import { CallPage } from './pages/CallPage'
import { CallsPage } from './pages/CallsPage'
import { ChatsPage } from './pages/ChatsPage'
import { ContactsPage } from './pages/ContactsPage'
import { ProfilePage } from './pages/ProfilePage'

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app/chats" replace /> },
  {
    path: '/app',
    element: <AppShell />,
    children: [
      { path: 'chats', element: <ChatsPage /> },
      { path: 'contacts', element: <ContactsPage /> },
      { path: 'calls', element: <CallsPage /> },
      { path: 'profile', element: <ProfilePage /> },
    ],
  },
  // Намеренно СИБЛИНГ верхнего уровня, а не дочерний роут /app, внешний
  // гость по прямой ссылке не должен видеть сайдбар AppShell, а видео-
  // контейнер не должен зависеть от чужого flex-контекста. См. CallPage.tsx.
  { path: '/app/call/:room', element: <CallPage /> },
])
