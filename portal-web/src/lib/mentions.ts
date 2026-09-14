/**
 * Упоминания, сознательно НЕ официальный m.mentions (MSC3952), чистая
 * фронтенд-конвенция (раздел 15.6 инструкции): в текст подставляется
 * буквальное "@Полное Имя", при рендере ищутся точные вхождения известных
 * имён участников комнаты. Никакой push-семантики к этому не привязано.
 */
export interface TextSegment {
  text: string
  isMention: boolean
}

export function splitByMentions(body: string, knownNames: string[]): TextSegment[] {
  const names = knownNames.filter(Boolean).sort((a, b) => b.length - a.length)
  if (names.length === 0) return [{ text: body, isMention: false }]

  const pattern = new RegExp(`@(${names.map(escapeRegExp).join('|')})`, 'g')
  const segments: TextSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(body))) {
    if (match.index > lastIndex) {
      segments.push({ text: body.slice(lastIndex, match.index), isMention: false })
    }
    segments.push({ text: match[0], isMention: true })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < body.length) {
    segments.push({ text: body.slice(lastIndex), isMention: false })
  }

  return segments
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
