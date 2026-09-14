import { Video } from 'lucide-react'
import { Link } from 'react-router'
import styles from './ConferenceLinkChip.module.css'

interface ConferenceLinkChipProps {
  slug: string
  subject: string
}

/** Плашка ссылки на ВКС в сообщении, иконка камеры + название встречи, без сырого URL. */
export function ConferenceLinkChip({ slug, subject }: ConferenceLinkChipProps) {
  return (
    <Link to={`/app/call/${slug}?subject=${encodeURIComponent(subject)}`} className={styles.chip}>
      <Video size={16} />
      <span className={styles.subject}>{subject}</span>
    </Link>
  )
}
