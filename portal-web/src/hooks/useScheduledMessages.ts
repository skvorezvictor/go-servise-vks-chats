import type { MatrixClient } from 'matrix-js-sdk'
import { useCallback, useEffect, useState } from 'react'
import { fetchScheduledMessages, type ScheduledMessage } from '../lib/scheduledMessages'

const POLL_INTERVAL_MS = 15000

/**
 * Свои отложенные сообщения (по всем чатам, если roomId не задан),
 * это отдельный REST-ресурс бриджа, не Matrix-событие, живого пуша по
 * нему нет, поэтому опрашиваем по таймеру, плюс refetch() для
 * немедленного обновления сразу после планирования/отмены.
 */
export function useScheduledMessages(client: MatrixClient | null, roomId?: string) {
  const [items, setItems] = useState<ScheduledMessage[]>([])

  const refetch = useCallback(() => {
    if (!client) return
    fetchScheduledMessages(client, roomId)
      .then(setItems)
      .catch((err) => console.error('не удалось загрузить отложенные сообщения', err))
  }, [client, roomId])

  useEffect(() => {
    refetch()
    const interval = setInterval(refetch, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refetch])

  return { items, refetch }
}
