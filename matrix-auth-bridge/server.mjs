import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { URL } from 'node:url';

const SYNAPSE_URL = process.env.SYNAPSE_URL || 'http://127.0.0.1:8008';
const SYNAPSE_SERVER_NAME = process.env.SYNAPSE_SERVER_NAME || 'go.example.ru';
const ADMIN_TOKEN = process.env.MATRIX_ADMIN_TOKEN;
const PORT = Number(process.env.PORT || 3302);
const HOST = process.env.HOST || '127.0.0.1';
const USERINFO_URL = process.env.OIDC_USERINFO_URL;
const CALLS_LOG_PATH = process.env.CALLS_LOG_PATH || '/opt/matrix-auth-bridge/calls.json';
const USERS_ROSTER_PATH = process.env.USERS_ROSTER_PATH || '/opt/matrix-auth-bridge/users.json';
const SCHEDULED_MESSAGES_PATH = process.env.SCHEDULED_MESSAGES_PATH || '/var/lib/matrix-auth-bridge/scheduled-messages.json';

if (!ADMIN_TOKEN) {
  console.error('MATRIX_ADMIN_TOKEN is required');
  process.exit(1);
}

function localpartFromUsername(preferredUsername, email) {
  const raw = (preferredUsername || (email || '').split('@')[0] || '').toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9._-]/g, '_').replace(/^_+/, '');
  return cleaned || 'user';
}

function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function nameFromClaims(claims) {
  if (!claims) return null;
  return claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(' ') || null;
}

async function fetchRealName(accessToken, idToken) {
  // oauth2-proxy передаёт Keycloak id_token в заголовке Authorization
  // (pass_authorization_header) - там ФИО уже есть в claim'ах, без лишнего
  // похода в userinfo.
  const fromIdToken = idToken ? nameFromClaims(decodeJwtPayload(idToken)) : null;
  if (fromIdToken) return fromIdToken;

  if (!USERINFO_URL || !accessToken) return null;
  try {
    const res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error('userinfo request failed', res.status, await res.text());
      return null;
    }
    const info = await res.json();
    return nameFromClaims(info);
  } catch (err) {
    console.error('userinfo request error', err);
    return null;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function loadCalls() {
  try {
    return JSON.parse(fs.readFileSync(CALLS_LOG_PATH, 'utf8'));
  } catch {
    return [];
  }
}

// "Звонки" - это список комнат, в которые заходил человек, а не журнал
// отдельных сеансов: повторный вход в ту же комнату (даже спустя дни)
// поднимает существующую запись наверх и обновляет время, а не плодит новую.
// Разные записи для одной комнаты остаются только именно как разные КОМНАТЫ
// с одинаковым названием тут не смешиваются - ключ (room, email) уникален.
function appendCall(entry) {
  const calls = loadCalls();
  const existingIdx = calls.findIndex((c) => c.room === entry.room && c.email === entry.email);
  if (existingIdx !== -1) {
    const [existing] = calls.splice(existingIdx, 1);
    existing.startedAt = entry.startedAt;
    calls.unshift(existing);
  } else {
    calls.unshift(entry);
  }
  fs.writeFileSync(CALLS_LOG_PATH, JSON.stringify(calls.slice(0, 500), null, 2));
}

function loadRoster() {
  try {
    return JSON.parse(fs.readFileSync(USERS_ROSTER_PATH, 'utf8'));
  } catch {
    return [];
  }
}

// Справочник контактов ведём сами (а не через Synapse user_directory,
// которому нужен непустой поисковый запрос) - так люди остаются в списке
// сразу после первого входа и не теряются между поисками.
function upsertRoster(userId, displayName) {
  const roster = loadRoster();
  const idx = roster.findIndex((u) => u.userId === userId);
  if (idx === -1) {
    roster.push({ userId, displayName });
  } else {
    roster[idx].displayName = displayName;
  }
  fs.writeFileSync(USERS_ROSTER_PATH, JSON.stringify(roster, null, 2));
}

async function synapseAdmin(path, options = {}) {
  const res = await fetch(`${SYNAPSE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${ADMIN_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return res;
}

async function ensureUser(userId, displayName) {
  const existing = await synapseAdmin(`/_synapse/admin/v2/users/${encodeURIComponent(userId)}`);
  if (existing.status === 200) {
    if (displayName) {
      await synapseAdmin(`/_synapse/admin/v2/users/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        body: JSON.stringify({ displayname: displayName }),
      });
    }
    return;
  }
  const throwawayPassword = crypto.randomBytes(24).toString('base64url');
  const created = await synapseAdmin(`/_synapse/admin/v2/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify({
      password: throwawayPassword,
      displayname: displayName || undefined,
      admin: false,
    }),
  });
  if (!created.ok) {
    throw new Error(`Failed to create Matrix user ${userId}: ${created.status} ${await created.text()}`);
  }
}

async function loginAsUser(userId) {
  const res = await synapseAdmin(`/_synapse/admin/v1/users/${encodeURIComponent(userId)}/login`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`Failed to mint Matrix login for ${userId}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// Отправка сообщения от имени конкретного пользователя (не админским
// токеном, иначе отправителем в комнате оказался бы сам бридж). Тот же
// приём минтинга логина, что и в /api/session, только напрямую к
// client-server API Synapse, а не через synapseAdmin (тому нужен именно
// admin-токен).
async function sendAsUser(userId, roomId, content) {
  const { access_token: userToken } = await loginAsUser(userId);
  const txnId = crypto.randomUUID();
  const res = await fetch(
    `${SYNAPSE_URL}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(content),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to send scheduled message to ${roomId} as ${userId}: ${res.status} ${await res.text()}`);
  }
}

function loadScheduled() {
  try {
    return JSON.parse(fs.readFileSync(SCHEDULED_MESSAGES_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveScheduled(list) {
  fs.writeFileSync(SCHEDULED_MESSAGES_PATH, JSON.stringify(list, null, 2));
}

const MAX_SCHEDULED_ATTEMPTS = 5;

// Фоновая отправка отложенных сообщений, работает независимо от того,
// открыт ли у кого-то браузер с приложением (настоящее планирование, не
// "пока вкладка открыта").
async function processDueScheduledMessages() {
  const list = loadScheduled();
  const now = Date.now();
  const due = list.filter((m) => m.sendAt <= now);
  if (due.length === 0) return;

  let changed = false;
  for (const entry of due) {
    try {
      await sendAsUser(entry.userId, entry.roomId, { msgtype: 'm.text', body: entry.body });
      const idx = list.findIndex((m) => m.id === entry.id);
      if (idx !== -1) list.splice(idx, 1);
      changed = true;
    } catch (err) {
      console.error(`scheduled message ${entry.id}:`, err);
      entry.attempts = (entry.attempts || 0) + 1;
      if (entry.attempts >= MAX_SCHEDULED_ATTEMPTS) {
        console.error(`scheduled message ${entry.id}: giving up after ${entry.attempts} attempts, dropping`);
        const idx = list.findIndex((m) => m.id === entry.id);
        if (idx !== -1) list.splice(idx, 1);
      }
      changed = true;
    }
  }
  if (changed) saveScheduled(list);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // nginx/oauth2-proxy must have already verified the Keycloak session and
  // forwarded the identity via these headers before a request reaches here.
  const email = req.headers['x-forwarded-email'] || req.headers['x-auth-request-email'];
  const preferredUsername = req.headers['x-forwarded-preferred-username'] || req.headers['x-forwarded-user'] || req.headers['x-auth-request-user'];
  const accessToken = req.headers['x-forwarded-access-token'];
  const idToken = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '') || null;

  if (!email) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'no identity header from auth gate' }));
    return;
  }

  if (url.pathname === '/api/contacts' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(loadRoster()));
    return;
  }

  // "Информация о себе" - свободный текст в профиле, виден всем в справочнике
  // контактов. Своя ростер-запись (users.json), не Matrix-профиль - так не
  // зависим от того, поддерживает ли эта версия Synapse MSC4133.
  if (url.pathname === '/api/profile/about' && (req.method === 'GET' || req.method === 'POST')) {
    const myUserId = `@${localpartFromUsername(preferredUsername, email)}:${SYNAPSE_SERVER_NAME}`;
    if (req.method === 'GET') {
      const me = loadRoster().find((u) => u.userId === myUserId);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ about: me?.about || '' }));
      return;
    }
    try {
      const body = await readBody(req);
      const roster = loadRoster();
      const idx = roster.findIndex((u) => u.userId === myUserId);
      if (idx !== -1) {
        roster[idx].about = String(body.about || '').slice(0, 300);
        fs.writeFileSync(USERS_ROSTER_PATH, JSON.stringify(roster, null, 2));
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error(err);
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'bad request' }));
    }
    return;
  }

  if (url.pathname === '/api/session') {
    try {
      const realName = await fetchRealName(accessToken, idToken);
      const displayName = realName || preferredUsername || email;
      const localpart = localpartFromUsername(preferredUsername, email);
      const userId = `@${localpart}:${SYNAPSE_SERVER_NAME}`;

      await ensureUser(userId, displayName);
      upsertRoster(userId, displayName);
      const { access_token: matrixAccessToken, device_id: deviceId } = await loginAsUser(userId);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        homeserverUrl: `https://go.example.ru`,
        userId,
        accessToken: matrixAccessToken,
        deviceId,
        displayName,
      }));
    } catch (err) {
      console.error(err);
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'matrix-auth-bridge failure' }));
    }
    return;
  }

  if (url.pathname === '/api/calls' && req.method === 'GET') {
    const calls = loadCalls().filter((c) => c.email === email);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(calls));
    return;
  }

  if (url.pathname === '/api/calls' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const realName = await fetchRealName(accessToken, idToken);
      const displayName = realName || preferredUsername || email;
      if (!body.room) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'room is required' }));
        return;
      }
      const entry = {
        id: crypto.randomUUID(),
        room: String(body.room),
        email,
        displayName,
        startedAt: new Date().toISOString(),
      };
      appendCall(entry);
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(entry));
    } catch (err) {
      console.error(err);
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'bad request' }));
    }
    return;
  }

  const deleteMatch = url.pathname.match(/^\/api\/calls\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const id = decodeURIComponent(deleteMatch[1]);
    const remaining = loadCalls().filter((c) => !(c.id === id && c.email === email));
    fs.writeFileSync(CALLS_LOG_PATH, JSON.stringify(remaining, null, 2));
    res.writeHead(204);
    res.end();
    return;
  }

  // При удалении чата (см. деталь пользователя: "либо по закрытию чата")
  // фронтенд присылает mxc-ссылки вложений, которые он успел увидеть в
  // истории комнаты, - удаляем их сразу, не дожидаясь общего 3-суточного
  // фонового удаления в Synapse (media_retention в homeserver.yaml).
  // Нужен админский токен Synapse - обычный пользовательский на это прав не
  // имеет, поэтому запрос идёт через этот бэкенд, а не напрямую с клиента.
  if (url.pathname === '/api/purge-media' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const mxcUrls = Array.isArray(body.mxcUrls) ? body.mxcUrls : [];
      let deleted = 0;
      for (const mxcUrl of mxcUrls) {
        const match = typeof mxcUrl === 'string' && mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
        if (!match) continue;
        const [, server, mediaId] = match;
        const res2 = await synapseAdmin(`/_synapse/admin/v1/media/${encodeURIComponent(server)}/${encodeURIComponent(mediaId)}`, {
          method: 'DELETE',
        });
        if (res2.ok) deleted += 1;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ deleted, total: mxcUrls.length }));
    } catch (err) {
      console.error(err);
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'bad request' }));
    }
    return;
  }

  // Фон чата хранится как обычная картинка-вложение, но должен жить "навсегда",
  // а не попадать под общую 3-суточную автоочистку (media_retention в Synapse,
  // см. homeserver.yaml) - помечаем её как protected через Admin API.
  if (url.pathname === '/api/protect-media' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const match = typeof body.mxcUrl === 'string' && body.mxcUrl.match(/^mxc:\/\/([^/]+)\/(.+)$/);
      if (!match) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'bad mxcUrl' }));
        return;
      }
      const [, server, mediaId] = match;
      const res2 = await synapseAdmin(`/_synapse/admin/v1/media/protect/${encodeURIComponent(server)}/${encodeURIComponent(mediaId)}`, {
        method: 'POST',
      });
      if (!res2.ok) {
        const text = await res2.text().catch(() => '');
        console.error(`protect-media, Synapse admin API вернул ${res2.status} для ${server}/${mediaId}: ${text}`);
      }
      res.writeHead(res2.ok ? 200 : 502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: res2.ok }));
    } catch (err) {
      console.error(err);
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'bad request' }));
    }
    return;
  }

  // Отложенные сообщения. Владелец, тот, кто запланировал (email из
  // identity-заголовков), только он видит и может отменить свои записи.
  if (url.pathname === '/api/scheduled-messages' && req.method === 'GET') {
    const roomId = url.searchParams.get('roomId');
    const mine = loadScheduled().filter((m) => m.email === email && (!roomId || m.roomId === roomId));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(mine));
    return;
  }

  if (url.pathname === '/api/scheduled-messages' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const roomId = typeof body.roomId === 'string' ? body.roomId : '';
      const text = typeof body.body === 'string' ? body.body.trim() : '';
      const sendAt = Number(body.sendAt);
      if (!roomId || !text || !Number.isFinite(sendAt) || sendAt <= Date.now()) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'roomId, body и sendAt (в будущем) обязательны' }));
        return;
      }
      const userId = `@${localpartFromUsername(preferredUsername, email)}:${SYNAPSE_SERVER_NAME}`;
      const entry = {
        id: crypto.randomUUID(),
        roomId,
        userId,
        email,
        body: text,
        sendAt,
        createdAt: Date.now(),
      };
      const list = loadScheduled();
      list.push(entry);
      saveScheduled(list);
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(entry));
    } catch (err) {
      console.error(err);
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'bad request' }));
    }
    return;
  }

  const deleteScheduledMatch = url.pathname.match(/^\/api\/scheduled-messages\/([^/]+)$/);
  if (deleteScheduledMatch && req.method === 'DELETE') {
    const id = decodeURIComponent(deleteScheduledMatch[1]);
    const list = loadScheduled();
    const remaining = list.filter((m) => !(m.id === id && m.email === email));
    if (remaining.length === list.length) {
      res.writeHead(404);
      res.end();
      return;
    }
    saveScheduled(remaining);
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, HOST, () => {
  console.log(`matrix-auth-bridge listening on http://${HOST}:${PORT}`);
  setInterval(() => {
    processDueScheduledMessages().catch((err) => console.error('processDueScheduledMessages:', err));
  }, 20000);
});
