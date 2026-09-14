import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './router'
import { THEME_STORAGE_KEY, ThemeProvider } from './hooks/useTheme'
import './styles/theme.css'
import './styles/global.css'

// Тема выставляется здесь безусловно, до первого рендера: /app/call/:room
// рендерится вне AppShell (см. router.tsx), поэтому useTheme там не
// срабатывает, без этой строки внешний гость с тёмной системной темой
// увидел бы светлую тему по умолчанию на странице звонка.
const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
const initialTheme =
  storedTheme === 'light' || storedTheme === 'dark'
    ? storedTheme
    : window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
document.documentElement.setAttribute('data-theme', initialTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
)
