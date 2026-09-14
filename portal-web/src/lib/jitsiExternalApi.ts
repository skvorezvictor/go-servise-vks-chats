import { branding } from '../config/branding'

/**
 * JitsiMeetExternalAPI грузится с самого прод-Jitsi (тот же external_api.js,
 * что и на обычной странице go.example.ru), а не из npm-пакета, раздел
 * 10.7/11.3 инструкции. Скрипт добавляет глобальный конструктор на window,
 * типов для него в npm нет, поэтому объявляем минимально нужную сигнатуру
 * сами, только то, что реально используется в CallPage.
 */
export interface JitsiMeetExternalApiOptions {
  roomName: string
  parentNode: HTMLElement
  width?: string | number
  height?: string | number
  jwt?: string
  userInfo?: { displayName?: string; email?: string }
  configOverwrite?: Record<string, unknown>
}

export interface JitsiMeetExternalApiInstance {
  addEventListener(event: 'readyToClose', listener: () => void): void
  dispose(): void
}

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: JitsiMeetExternalApiOptions) => JitsiMeetExternalApiInstance
  }
}

let scriptPromise: Promise<void> | null = null

export function loadJitsiExternalApi(): Promise<void> {
  if (window.JitsiMeetExternalAPI) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = branding.jitsiExternalApiUrl
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('не удалось загрузить JitsiMeetExternalAPI'))
    document.head.appendChild(script)
  })

  return scriptPromise
}

export function getJitsiDomain(): string {
  return new URL(branding.jitsiExternalApiUrl).hostname
}
