import { Video } from 'lucide-react'
import { Link } from 'react-router'
import { splitByMentions } from '../lib/mentions'
import styles from './MentionText.module.css'

interface MentionTextProps {
  body: string
  knownNames: string[]
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g
// Ссылка на ВКС этого приложения (/app/call/<slug>?subject=...) в ЛЮБОМ
// виде, не только отправленная через плашку ChatConferencesPicker, но и
// вручную вставленный текстом URL (скопированный откуда угодно), должна
// выглядеть одинаково аккуратно, а не сырым процент-закодированным текстом.
const CALL_LINK_PATTERN = /\/app\/call\/([a-z0-9-]+)(?:\?subject=([^\s&]+))?/i

/**
 * Обычный текст сегмента с кликабельными http(s)-ссылками внутри. split()
 * с одной группой захвата чередует [текст, url, текст, url, ...], по
 * чётности индекса понятно, что это, без повторного .test() того же
 * global-регекса (у него залипает lastIndex между вызовами).
 */
function linkify(text: string, keyPrefix: string) {
  const parts = text.split(URL_PATTERN)
  return parts.map((part, i) => {
    if (i % 2 !== 1) {
      // eslint-disable-next-line react/no-array-index-key
      return <span key={`${keyPrefix}-${i}`}>{part}</span>
    }

    const callMatch = CALL_LINK_PATTERN.exec(part)
    if (callMatch) {
      const [, slug, encodedSubject] = callMatch
      const subject = encodedSubject ? decodeURIComponent(encodedSubject) : slug
      return (
        <Link
          // eslint-disable-next-line react/no-array-index-key
          key={`${keyPrefix}-${i}`}
          to={`/app/call/${slug}${encodedSubject ? `?subject=${encodedSubject}` : ''}`}
          className={styles.callChip}
        >
          <Video size={14} /> {subject}
        </Link>
      )
    }

    return (
      // eslint-disable-next-line react/no-array-index-key
      <a key={`${keyPrefix}-${i}`} href={part} target="_blank" rel="noreferrer noopener" className={styles.link}>
        {part}
      </a>
    )
  })
}

export function MentionText({ body, knownNames }: MentionTextProps) {
  const segments = splitByMentions(body, knownNames)

  return (
    <>
      {segments.map((segment, i) =>
        segment.isMention ? (
          <span key={i} className={styles.mention}>
            {segment.text}
          </span>
        ) : (
          <span key={i}>{linkify(segment.text, String(i))}</span>
        ),
      )}
    </>
  )
}
