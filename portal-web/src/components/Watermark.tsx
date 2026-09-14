import { branding } from '../config/branding'
import styles from './Watermark.module.css'

/**
 * Видимый водяной знак на всех страницах внутри AppShell (раздел 20.4
 * инструкции, решение "убрать везде" отменено пользователем 2026-09-10,
 * знак снова нужен везде, кроме самого экрана ВКС; CallPage, отдельный
 * роут вне AppShell, поэтому туда компонент physически не попадает).
 */
export function Watermark() {
  return (
    <div className={styles.watermark} aria-hidden="true">
      {branding.watermarkText}
    </div>
  )
}
