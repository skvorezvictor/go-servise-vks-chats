import { createContext, useCallback, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

// Экспортируется отдельно: main.tsx выставляет тему синхронно до первого
// рендера (см. комментарий там), этот хук, для реактивных обновлений
// внутри приложения. Оба места обязаны использовать один и тот же ключ.
export const THEME_STORAGE_KEY = 'portal-web:theme-override'
const STORAGE_KEY = THEME_STORAGE_KEY

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function getStoredOverride(): Theme | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === 'light' || raw === 'dark' ? raw : null
}

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Тема по умолчанию следует системной настройке (prefers-color-scheme),
 * с ручным переключателем поверх, который переживает перезагрузку страницы
 * через localStorage. Состояние живёт здесь одним экземпляром (Context),
 * а не в каждом отдельном useTheme(), иначе переключатель в ProfilePage
 * не смог бы достучаться до эффекта, который реально проставляет
 * data-theme на <html> в AppShell (раздел 15.12 инструкции: только факт
 * наличия тёмной темы, без указания, где переключатель, разумный дефолт).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getStoredOverride() ?? (systemPrefersDark() ? 'dark' : 'light'))

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    if (getStoredOverride()) return // пользователь уже выбрал вручную, системные изменения игнорируем

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setThemeState(e.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next)
    setThemeState(next)
  }, [])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme() вызван вне ThemeProvider')
  return ctx
}
