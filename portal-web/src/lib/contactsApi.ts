import type { MatrixClient } from 'matrix-js-sdk'

export interface Contact {
  userId: string
  displayName: string
  about?: string
}

/**
 * Полный ростер без серверной фильтрации, клиент фильтрует по подстроке
 * сам (раздел 10.3 инструкции). Справочник пополняется бэкендом органически
 * по факту первого входа сотрудника, не полная выгрузка из Keycloak.
 */
export async function fetchContacts(client: MatrixClient): Promise<Contact[]> {
  const res = await fetch('/app/api/contacts', {
    credentials: 'include',
    headers: { Authorization: `Bearer ${client.getAccessToken() ?? ''}` },
  })
  if (!res.ok) throw new Error(`GET /api/contacts: ${res.status}`)
  return res.json()
}
