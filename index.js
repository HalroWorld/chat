// 채팅 라이브러리: 프로젝트의 Node HTTP 서버에 붙인다. 쓰는 법은 README.md, 프로토콜은 docs/API명세서.md
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer } from 'ws';
import { getRandomNickname } from 'nickgen';

const WIDGET = fileURLToPath(new URL('./public/chat.js', import.meta.url));
const HISTORY = 50;
const MAX_TEXT = 500;
const MAX_NAME = 20;
const RATE_N = 5;          // 3초에 5개까지
const RATE_MS = 3000;
const RE_ROOM = /^[\w-]{1,64}$/;
const RE_CID = /^[\w-]{8,64}$/;

function cleanName(s) {
  if (typeof s !== 'string') return '';
  s = s.normalize('NFC').replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim();
  return [...s].length <= MAX_NAME ? s : '';
}

// 화면에 보내는 사람 ID. 프로젝트의 실제 사용자 ID를 그대로 내보내지 않는다
const publicId = (uid) => createHash('sha256').update(uid).digest('base64url').slice(0, 12);

/**
 * @param {import('node:http').Server} server
 * @param {object} [opts]
 * @param {(req) => ({id, name}|null|Promise<{id, name}|null>)} [opts.getUser]  로그인한 사람. 없으면 null
 * @param {boolean} [opts.allowAnonymous=true]  로그인 안 한 사람도 채팅(nickgen 이름). false면 보기만
 * @param {string} [opts.dbFile='data/chat.db']  실행 위치 기준
 * @param {string} [opts.path='/chat']  위젯은 {path}/chat.js, WebSocket은 {path}/ws
 * @param {string[]} [opts.origins]  허용할 Origin. 없으면 같은 호스트만
 * @param {number} [opts.history=50]  들어올 때 보여 줄 지난 메시지 수(0~50). 0이면 들어온 뒤의 메시지만
 */
export function attachChat(server, {
  getUser = () => null,
  allowAnonymous = true,
  dbFile = 'data/chat.db',
  path = '/chat',
  origins,
  history = HISTORY,
} = {}) {
  const showPast = Math.max(0, Math.min(HISTORY, Math.floor(Number(history) || 0)));
  // ── DB: 방마다 최근 50개만 ──
  if (dbFile !== ':memory:') {
    dbFile = resolve(dbFile);
    mkdirSync(dirname(dbFile), { recursive: true });
  }
  const db = new DatabaseSync(dbFile);
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY, room TEXT NOT NULL, pid TEXT NOT NULL,
      name TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_room ON messages(room, id);`);
  const insertMsg = db.prepare('INSERT INTO messages (room, pid, name, text, at) VALUES (?, ?, ?, ?, ?)');
  const trimMsgs = db.prepare(`DELETE FROM messages WHERE room = ? AND id <=
    (SELECT id FROM messages WHERE room = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`);
  const recentMsgs = db.prepare('SELECT pid, name, text, at FROM messages WHERE room = ? ORDER BY id DESC LIMIT ?');

  // ── 메모리 상태 (프로세스 하나 전제) ──
  const rooms = new Map();   // room → Map<uid | null(보기만), Set<ws>>
  const users = new Map();   // uid → {name, pid, conns}   이름 중복은 지금 접속자끼리
  const rate = new Map();    // uid → 최근 보낸 시각들

  const taken = (name, uid) => [...users].some(([u, v]) => u !== uid && v.name === name);
  function unique(name, uid) {   // 겹치면 " 002"부터 빈 번호
    if (!taken(name, uid)) return name;
    const base = name.replace(/ \d{3}$/, '');
    for (let n = 2; ; n++) {
      const cand = `${base} ${String(n).padStart(3, '0')}`;
      if (!taken(cand, uid)) return cand;
    }
  }

  const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
  function broadcast(room, msg, except) {
    const data = JSON.stringify(msg);
    for (const set of rooms.get(room)?.values() ?? []) for (const ws of set) if (ws !== except && ws.readyState === 1) ws.send(data);
  }
  const peopleOf = (room) => [...(rooms.get(room)?.keys() ?? [])].filter(Boolean)
    .map((uid) => ({ pid: users.get(uid).pid, name: users.get(uid).name }));

  function join(ws, room, uid, wanted) {
    let me = null;
    if (uid) {
      me = users.get(uid);
      if (!me) users.set(uid, me = { name: unique(wanted, uid), pid: publicId(uid), conns: 0 });
      me.conns++;
    }
    if (!rooms.has(room)) rooms.set(room, new Map());
    const r = rooms.get(room);
    const first = uid && !r.has(uid);   // 같은 사람의 다른 탭이면 입장 알림 없음
    if (!r.has(uid)) r.set(uid, new Set());
    r.get(uid).add(ws);
    ws.ctx = { room, uid };
    ws.alive = true;

    send(ws, {
      t: 'hello',
      me: me && { pid: me.pid, name: me.name, anon: uid.startsWith('a:') },
      history: showPast ? recentMsgs.all(room, showPast).reverse() : null, // null: 지난 메시지 안 보냄(다시 붙어도 화면에 있던 건 그대로)
      people: peopleOf(room),
    });
    if (first) broadcast(room, { t: 'people', people: peopleOf(room), event: { kind: 'join', name: me.name } }, ws);

    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (data) => {
      let m;
      try { m = JSON.parse(data); } catch { return; }
      if (m?.t === 'msg') onMsg(ws, m.text);
    });
    ws.on('close', () => leave(ws));
  }

  function onMsg(ws, raw) {
    const { room, uid } = ws.ctx;
    if (!uid) return send(ws, { t: 'error', code: 'login' });
    const text = typeof raw === 'string' ? raw.replace(/\r\n?/g, '\n').replace(/[^\P{Cc}\n\t]/gu, '').trim() : '';
    if (!text || [...text].length > MAX_TEXT) return send(ws, { t: 'error', code: 'bad_text' });

    // ponytail: 익명은 cid 기준이라 cid를 바꿔 가며 보내면 우회됨. 문제 되면 IP 기준 추가
    const now = Date.now();
    const recent = (rate.get(uid) ?? []).filter((at) => now - at < RATE_MS);
    if (recent.length >= RATE_N) {
      rate.set(uid, recent);
      return send(ws, { t: 'error', code: 'rate', retryMs: RATE_MS - (now - recent[0]) });
    }
    recent.push(now);
    rate.set(uid, recent);

    const { name, pid } = users.get(uid);
    insertMsg.run(room, pid, name, text, now);
    trimMsgs.run(room, room, HISTORY);
    broadcast(room, { t: 'msg', pid, name, text, at: now });
  }

  function leave(ws) {
    if (!ws.ctx) return;
    const { room, uid } = ws.ctx;
    const r = rooms.get(room);
    const set = r.get(uid);
    set.delete(ws);
    if (!set.size) {
      r.delete(uid);
      if (!r.size) rooms.delete(room);
      else if (uid) broadcast(room, { t: 'people', people: peopleOf(room), event: { kind: 'leave', name: users.get(uid).name } });
    }
    if (uid && --users.get(uid).conns === 0) {
      users.delete(uid);
      rate.delete(uid);
    }
  }

  // 쿠키 로그인을 쓰므로 다른 사이트에서 여는 WebSocket은 막는다
  function originOk(req) {
    const o = req.headers.origin;
    if (!o) return false;
    if (origins) return origins.includes(o);
    try { return new URL(o).host === (req.headers['x-forwarded-host'] || req.headers.host); } catch { return false; }
  }

  const reject = (socket, code) => socket.end(`HTTP/1.1 ${code} ${code === 403 ? 'Forbidden' : 'Error'}\r\nConnection: close\r\n\r\n`);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  server.on('upgrade', async (req, socket, head) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname !== `${path}/ws`) return;   // 다른 WebSocket(개발 서버 HMR 등)은 건드리지 않음
    const room = u.searchParams.get('room') || 'lobby';
    const cid = u.searchParams.get('cid') || '';
    if (!originOk(req) || !RE_ROOM.test(room) || !RE_CID.test(cid)) return reject(socket, 403);

    let user;
    try { user = await getUser(req); } catch (e) {
      console.error('[chat] getUser 실패', e);
      return reject(socket, 500);
    }
    let uid = null, name = '';
    if (user?.id != null) {
      uid = `u:${user.id}`;
      name = cleanName(user.name) || getRandomNickname();
    } else if (allowAnonymous) {
      // ponytail: 익명 이름은 브라우저가 보낸 값이라 아무 이름이나 쓸 수 있음. 로그인 사용자 사칭이 문제 되면 익명 표시 추가
      uid = `a:${cid}`;
      name = cleanName(u.searchParams.get('name')) || getRandomNickname();
    }
    wss.handleUpgrade(req, socket, head, (ws) => join(ws, room, uid, name));
  });

  // 끊긴 연결(프록시 뒤에서 close가 안 오는 경우)을 30초마다 정리
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
  }, 30_000);
  heartbeat.unref();

  return {
    /** 위젯 파일 제공. Express 미들웨어로도, 일반 http 핸들러 안에서도 쓴다: `if (chat.handle(req, res)) return;` */
    handle(req, res, next) {
      if (req.method === 'GET' && req.url.split('?')[0] === `${path}/chat.js`) {
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=300' });
        res.end(readFileSync(WIDGET));
        return true;
      }
      next?.();
      return false;
    },
    close() {
      clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      db.close();
    },
  };
}
