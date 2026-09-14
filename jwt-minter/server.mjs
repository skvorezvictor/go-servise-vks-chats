import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';

const SECRET = process.env.JWT_APP_SECRET;
const ISSUER = process.env.JWT_APP_ID || 'jitsi';
const AUDIENCE = process.env.JWT_AUDIENCE || 'jitsi';
const JITSI_URL = process.env.JITSI_URL || 'https://go.example.ru';
const PORT = Number(process.env.PORT || 3301);
const HOST = process.env.HOST || '127.0.0.1';
const TTL_SECONDS = Number(process.env.JWT_TTL_SECONDS || 3600);
const USERINFO_URL = process.env.OIDC_USERINFO_URL;
const JICOFO_REST_URL = process.env.JICOFO_REST_URL || 'http://127.0.0.1:8888';

if (!SECRET) {
  console.error('JWT_APP_SECRET is required');
  process.exit(1);
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signJwt(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', SECRET).update(signingInput).digest();
  const encodedSignature = base64url(signature);
  return `${signingInput}.${encodedSignature}`;
}

async function roomExists(room) {
  if (!room || room === '*') return false;
  try {
    const res = await fetch(`${JICOFO_REST_URL}/debug/conferences`);
    if (!res.ok) return false;
    const rooms = await res.json();
    const target = room.toLowerCase();
    return rooms.some((jid) => String(jid).split('@')[0].toLowerCase() === target);
  } catch {
    // Can't confirm the room is new -> don't hand out moderator rights.
    return true;
  }
}

// jicofo's /debug/conferences only reflects a room a moment AFTER someone has
// actually joined it - two people opening a brand-new room within that short
// window (e.g. one shares a link and the other clicks it almost immediately)
// would otherwise BOTH see "room doesn't exist yet" and BOTH get moderator.
// A small in-memory claim closes that race: whoever's request is processed
// first for a given room name is recorded as its owner for a short window;
// jicofo's own live-conference check remains authoritative once the room is
// actually up and running, and also naturally lets a room name be reused
// (with a new owner) once everyone has left and jicofo stops listing it.
const roomClaims = new Map(); // room -> { email, claimedAt }
const CLAIM_RACE_WINDOW_MS = 20_000;

async function isModeratorFor(room, email) {
  if (!room || room === '*') return true;

  const active = await roomExists(room);
  const claim = roomClaims.get(room);
  const now = Date.now();

  let decision, reason;
  if (active) {
    decision = Boolean(claim && claim.email === email);
    reason = claim ? `active room, claim.email=${claim.email}` : 'active room, no recorded claim at all';
  } else if (claim && claim.email !== email && now - claim.claimedAt < CLAIM_RACE_WINDOW_MS) {
    decision = false;
    reason = `room not (yet) active, but recently claimed by ${claim.email} (${now - claim.claimedAt}ms ago)`;
  } else {
    roomClaims.set(room, { email, claimedAt: now });
    decision = true;
    reason = claim ? `room not active, stale/own claim overwritten (was ${claim.email})` : 'room not active, first claim';
  }
  console.log(`[moderator-decision] room=${room} email=${email} active=${active} decision=${decision} :: ${reason}`);
  return decision;
}

async function fetchRealName(accessToken) {
  if (!USERINFO_URL || !accessToken) return null;
  try {
    const res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const info = await res.json();
    return info.name || [info.given_name, info.family_name].filter(Boolean).join(' ') || null;
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // nginx/oauth2-proxy must have already verified the Keycloak session and
  // forwarded the identity via these headers before a request reaches here.
  const email = req.headers['x-forwarded-email'] || req.headers['x-auth-request-email'];
  const preferredUsername = req.headers['x-forwarded-preferred-username'] || req.headers['x-forwarded-user'] || req.headers['x-auth-request-user'];
  const accessToken = req.headers['x-forwarded-access-token'];

  if (!email) {
    res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Unauthorized: no identity header from auth gate');
    return;
  }

  const realName = await fetchRealName(accessToken);
  const user = realName || preferredUsername || email;

  const match = url.pathname.match(/^\/moderator\/(?:join\/)?([^/?#]+)\/?$/);
  const room = match ? decodeURIComponent(match[1]) : url.searchParams.get('room');

  // No room yet (bare /moderator/) -> wildcard moderator token, they haven't
  // picked/created anything. A specific room that's already running was
  // someone else's meeting shared via link -> authenticate, but don't hand
  // out moderator rights (unless they're the recorded creator). A room that
  // doesn't exist yet is being created now -> its creator becomes moderator.
  const isModerator = await isModeratorFor(room, email);

  // В этой сборке jicofo/prosody выдача ЛЮБОГО валидного JWT авторизованному
  // домену всё равно делает участника владельцем комнаты, независимо от
  // claim'а context.user.moderator (проверено эмпирически - token_affiliation
  // и enable-auto-owner=false не помогли). Единственный надёжно проверенный
  // способ не дать прав модератора - вообще не выдавать JWT и заходить как
  // гость (тем же путём, что и настоящие внешние гости). ФИО в этом случае
  // передаём отдельно через query-параметры для префилла на клиенте.
  if (!isModerator && room) {
    const target = `${JITSI_URL.replace(/\/$/, '')}/${encodeURIComponent(room)}`
      + `?guest_name=${encodeURIComponent(user)}&guest_email=${encodeURIComponent(email)}`;
    res.writeHead(302, { Location: target });
    res.end();
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: '*',
    room: room || '*',
    iat: now,
    nbf: now,
    exp: now + TTL_SECONDS,
    context: {
      user: {
        name: String(user),
        email: String(email),
        moderator: isModerator,
        lobby_bypass: isModerator,
      },
    },
  };

  const token = signJwt(payload);
  const target = room
    ? `${JITSI_URL.replace(/\/$/, '')}/${encodeURIComponent(room)}?jwt=${token}`
    : `${JITSI_URL.replace(/\/$/, '')}/?jwt=${token}`;

  res.writeHead(302, { Location: target });
  res.end();
});

server.listen(PORT, HOST, () => {
  console.log(`jwt-minter listening on http://${HOST}:${PORT}`);
});
