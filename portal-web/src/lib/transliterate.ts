const RU_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
  э: 'e', ю: 'yu', я: 'ya',
}

/**
 * Транслитерирует кириллицу в безопасный для URL латинский slug (раздел
 * 10.7 инструкции). Оригинальное название передаётся отдельно как ?subject=
 * и показывается пользователю как есть, этот slug используется только для
 * имени XMPP-комнаты.
 */
export function sanitizeRoomName(name: string): string {
  const transliterated = name
    .toLowerCase()
    .split('')
    .map((ch) => RU_TO_LATIN[ch] ?? ch)
    .join('')

  return transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `room-${Date.now()}`
}
