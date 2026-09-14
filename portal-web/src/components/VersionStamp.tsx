import { useRef, useState } from 'react'
import { branding } from '../config/branding'
import styles from './VersionStamp.module.css'

const CLICKS_REQUIRED = 5
const CLICK_WINDOW_MS = 1500
const CREDIT_DURATION_MS = 4000

export function VersionStamp() {
  const [showCredit, setShowCredit] = useState(false)
  const clickTimestamps = useRef<number[]>([])

  function handleClick() {
    const now = Date.now()
    clickTimestamps.current = [...clickTimestamps.current, now].filter((t) => now - t <= CLICK_WINDOW_MS)

    if (clickTimestamps.current.length >= CLICKS_REQUIRED) {
      clickTimestamps.current = []
      setShowCredit(true)
      setTimeout(() => setShowCredit(false), CREDIT_DURATION_MS)
    }
  }

  return (
    <button type="button" className={styles.stamp} onClick={handleClick}>
      {showCredit ? branding.easterEggText : branding.versionLabel}
    </button>
  )
}
