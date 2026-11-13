/* 채팅 위젯. 붙이는 법: README.md
   <script src="/chat/chat.js" data-room="lobby"></script>   (attachChat을 붙인 서버가 제공) */
(() => {
  const script = document.currentScript;
  const d = script && script.dataset;
  if (!d) return;

  const room = d.room || 'lobby';
  const title = d.title || (room === 'lobby' ? '로비' : room);
  const accent = /^#[0-9a-f]{3,8}$/i.test(d.color || '') ? d.color : '#2563EB';
  const src = new URL(script.src);
  // 위젯 주소의 chat.js를 ws로 바꾼 곳이 WebSocket (/chat/chat.js → /chat/ws)
  const WS_URL = (src.protocol === 'https:' ? 'wss://' : 'ws://') + src.host + src.pathname.replace(/[^/]*$/, 'ws');
  const MAX_TEXT = 500;
  const NAME_KEY = 'chat:name';

  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 동작은 함 */ } },
  };
  let cid = store.get('chat:cid');
  if (!/^[\w-]{8,64}$/.test(cid || '')) {
    cid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
    store.set('chat:cid', cid);
  }

  const icon = (p, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const I = {
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    minus: '<path d="M5 12h14"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    up: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    retry: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  };

  const CSS = `
:host{all:initial;display:block;--accent:#2563EB}
:host([data-mode=inline]){height:100%}
*{box-sizing:border-box}
[hidden]{display:none!important}
.w{font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',system-ui,sans-serif;color:#191F28;font-size:14px;line-height:1.45;height:100%}
button{font:inherit;cursor:pointer}
button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.launcher{position:fixed;right:24px;bottom:24px;z-index:2147483000;width:56px;height:56px;border:0;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(17,24,39,.2)}
.badge{position:absolute;top:-2px;right:-2px;min-width:20px;height:20px;padding:0 6px;border-radius:10px;border:2px solid #fff;background:#DC2626;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}
.panel{position:fixed;right:24px;bottom:96px;z-index:2147483000;width:380px;max-width:calc(100vw - 32px);height:600px;max-height:calc(100vh - 120px);display:flex;flex-direction:column;background:#fff;border:1px solid #E5E8EB;border-radius:16px;box-shadow:0 12px 32px rgba(17,24,39,.16);overflow:hidden}
:host([data-mode=inline]) .panel{position:relative;right:auto;bottom:auto;z-index:auto;width:100%;max-width:none;height:100%;min-height:400px;max-height:none;box-shadow:none}
@media (max-width:480px){
  :host([data-mode=float]) .panel{inset:0;width:100%;max-width:none;height:100%;max-height:none;border:0;border-radius:0}
  :host([data-mode=float]) .panel:not([hidden]) ~ .launcher{display:none}
}
header{display:flex;align-items:center;gap:4px;padding:12px 8px 12px 18px;border-bottom:1px solid #EEF0F2}
.back{margin-left:-10px}
.ttl{flex:1;min-width:0}
h2{margin:0;font-size:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.online{margin:2px 0 0;display:flex;align-items:center;gap:6px;font-size:12px;color:#4E5968}
.dot{width:8px;height:8px;border-radius:50%;background:#16A34A}
.off .dot{background:#9CA3AF}
.ib{width:44px;height:44px;flex:none;display:flex;align-items:center;justify-content:center;border:0;border-radius:10px;background:transparent;color:#4E5968}
.ib:hover{background:#F2F4F6}
.banner{display:flex;align-items:center;gap:8px;padding:10px 18px;background:#FEF3C7;color:#92400E;font-size:13px}
.view{flex:1;min-height:0;display:flex;flex-direction:column}
.list,.ppl{flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#D1D6DB transparent}
.list{padding:16px;display:flex;flex-direction:column;gap:4px}
.day{align-self:center;margin:4px 0 8px;padding:4px 12px;border-radius:999px;background:#F2F4F6;font-size:12px;color:#4E5968}
.sys{align-self:center;margin:6px 0;font-size:12px;color:#6B7684;text-align:center}
.msg{display:flex;gap:8px;align-items:flex-start;margin-top:10px}
.msg.cont{margin-top:0}
.msg.mine{justify-content:flex-end;align-items:flex-end;gap:6px}
.av{width:32px;height:32px;flex:none;border-radius:50%;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center}
.sp{width:32px;flex:none}
.body{display:flex;flex-direction:column;gap:4px;min-width:0}
.who{font-size:12px;color:#4E5968}
.line{display:flex;align-items:flex-end;gap:6px}
.bub{margin:0;max-width:240px;padding:9px 12px;background:#F2F4F6;border-radius:4px 16px 16px 16px;white-space:pre-wrap;word-break:break-word}
.mine .bub{background:var(--accent);color:#fff;border-radius:16px 4px 16px 16px}
time{flex:none;font-size:11px;color:#6B7684}
.toast{margin:0 12px 8px;padding:10px 14px;display:flex;align-items:center;gap:8px;background:#191F28;color:#fff;border-radius:12px;font-size:13px}
.toast svg{flex:none}
.composer{border-top:1px solid #EEF0F2;padding:8px 12px 12px;display:flex;flex-direction:column;gap:6px}
.row1{display:flex;align-items:center;justify-content:space-between;gap:8px}
.me-name{max-width:75%;padding:6px 10px;border-radius:999px;background:#F2F4F6;color:#333D4B;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.counter{font-size:12px;color:#6B7684}
.row2{display:flex;gap:8px;align-items:center}
input{flex:1;min-width:0;height:44px;padding:0 16px;border:1px solid #E5E8EB;border-radius:22px;background:#F9FAFB;font:inherit;color:#191F28}
input:focus{border-color:var(--accent);background:#fff;outline:none}
input:disabled{background:#F2F4F6;color:#6B7684}
.send{width:44px;height:44px;flex:none;display:flex;align-items:center;justify-content:center;border:0;border-radius:50%;background:var(--accent);color:#fff}
.send:disabled{background:#D1D6DB;cursor:default}
.ppl{list-style:none;margin:0;padding:12px 8px 16px}
.ppl li{display:flex;align-items:center;gap:12px;min-height:52px;padding:0 8px}
.ppl .av{width:36px;height:36px;font-size:14px;position:relative}
.ppl .av::after{content:'';position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;border-radius:50%;background:#16A34A;border:2px solid #fff}
.nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tag{padding:2px 8px;border-radius:999px;background:#EEF2FF;color:#3730A3;font-size:12px;font-weight:700}`;

  const HTML = `
<div class="w">
<section class="panel" aria-label="채팅" hidden>
  <header>
    <button type="button" class="ib back" aria-label="채팅으로 돌아가기" hidden>${icon(I.back)}</button>
    <div class="ttl"><h2></h2><p class="online off"><span class="dot" aria-hidden="true"></span><span class="count">연결하는 중</span></p></div>
    <button type="button" class="ib ppl-btn" aria-label="접속자 보기">${icon(I.users)}</button>
    <button type="button" class="ib close" aria-label="채팅 접기">${icon(I.minus)}</button>
  </header>
  <div class="banner" role="status" hidden>${icon(I.retry, 16)}<span>연결이 끊겼어요. 다시 연결하는 중…</span></div>
  <div class="view chat-view">
    <div class="list" role="log" aria-live="polite"></div>
    <div class="toast" role="status" hidden>${icon(I.alert, 18)}<span></span></div>
    <form class="composer">
      <div class="row1">
        <span class="me-name"></span>
        <span class="counter">0/${MAX_TEXT}</span>
      </div>
      <div class="row2">
        <label class="sr" for="m">메시지</label>
        <input id="m" maxlength="${MAX_TEXT}" placeholder="메시지 입력" autocomplete="off" disabled>
        <button type="submit" class="send" aria-label="보내기" disabled>${icon(I.up)}</button>
      </div>
    </form>
  </div>
  <div class="view ppl-view" hidden>
    <ul class="ppl"></ul>
  </div>
</section>
<button type="button" class="launcher" aria-label="채팅 열기">${icon(I.chat, 24)}<span class="badge" aria-hidden="true" hidden></span></button>
</div>`;

  const COLORS = [['#DBEAFE', '#1E40AF'], ['#FFE4CC', '#9A3412'], ['#CCFBF1', '#115E59'], ['#EDE9FE', '#5B21B6'],
    ['#DCFCE7', '#166534'], ['#FCE7F3', '#9D174D'], ['#FEF3C7', '#92400E'], ['#E0F2FE', '#075985']];

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;   // 사용자 글은 항상 textContent (HTML로 해석하지 않음)
    return e;
  };

  function avatar(c, name) {
    let h = 0;
    for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const [bg, fg] = COLORS[Math.abs(h) % COLORS.length];
    const a = el('div', 'av', [...(name.split(' ')[1] || name)][0] || '?');
    a.style.background = bg;
    a.style.color = fg;
    a.setAttribute('aria-hidden', 'true');
    return a;
  }

  const fmtTime = (dt) => dt.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  const dayLabel = (dt) => dt.toDateString() === new Date().toDateString()
    ? '오늘' : dt.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

  function start() {
    const target = d.target ? document.querySelector(d.target) : null;
    if (d.target && !target) console.warn('[chat] data-target을 찾지 못해 떠 있는 버튼으로 띄워요:', d.target);
    const inline = !!target;
    const host = el('div');
    host.dataset.mode = inline ? 'inline' : 'float';
    host.style.setProperty('--accent', accent);
    (target || document.body).appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style>${HTML}`;
    const $ = (s) => root.querySelector(s);

    const panel = $('.panel'), launcher = $('.launcher'), badge = $('.badge');
    const h2 = $('h2'), online = $('.online'), count = $('.count');
    const backBtn = $('.back'), pplBtn = $('.ppl-btn'), closeBtn = $('.close');
    const banner = $('.banner'), chatView = $('.chat-view'), pplView = $('.ppl-view');
    const list = $('.list'), toast = $('.toast'), composer = $('.composer');
    const meName = $('.me-name'), counter = $('.counter'), input = $('#m'), sendBtn = $('.send');
    const pplList = $('.ppl');

    let ws, retry = 0, connected = false, people = [], myPid = null;
    let open = inline, unread = 0, lastDay = null, last = null, pending = '', rateUntil = 0, toastTimer;

    h2.textContent = title;
    if (inline) { launcher.remove(); closeBtn.remove(); panel.hidden = false; }

    const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    const refreshSend = () => {
      input.disabled = !connected || !myPid;
      input.placeholder = connected && !myPid ? '로그인하면 채팅할 수 있어요' : '메시지 입력';
      sendBtn.disabled = input.disabled || Date.now() < rateUntil || !input.value.trim();
    };

    function setOpen(v) {
      open = v;
      panel.hidden = !v;
      launcher.setAttribute('aria-label', v ? '채팅 닫기' : '채팅 열기');
      launcher.firstElementChild.outerHTML = icon(v ? I.x : I.chat, 24);
      if (v) {
        unread = 0;
        badge.hidden = true;
        list.scrollTop = list.scrollHeight;
        input.focus();
      }
    }

    function setView(v) {
      const ppl = v === 'people';
      pplView.hidden = !ppl;
      chatView.hidden = ppl;
      backBtn.hidden = !ppl;
      pplBtn.hidden = ppl;
      online.hidden = ppl;
      h2.textContent = ppl ? `접속자 ${people.length}명` : title;
      (ppl ? backBtn : input).focus();
    }

    function dayDivider(dt) {
      if (dt.toDateString() === lastDay) return;
      lastDay = dt.toDateString();
      list.append(el('div', 'day', dayLabel(dt)));
      last = null;
    }

    function addMsg(m, quiet) {
      const stick = nearBottom() || m.pid === myPid;
      const dt = new Date(m.at), time = fmtTime(dt);
      dayDivider(dt);
      const mine = m.pid === myPid;
      const same = last && last.pid === m.pid && last.name === m.name && last.time === time;
      if (same) last.timeEl.remove();   // 같은 분에 연달아 보낸 건 마지막에만 시간 표시
      const t = el('time', null, time);
      t.dateTime = dt.toISOString();
      const bub = el('p', 'bub', m.text);
      let row;
      if (mine) {
        row = el('div', 'msg mine' + (same ? ' cont' : ''));
        row.append(el('span', 'sr', '나:'), t, bub);
      } else {
        row = el('div', 'msg' + (same ? ' cont' : ''));
        const body = el('div', 'body');
        if (same) body.append(el('span', 'sr', m.name + ':')); else body.append(el('span', 'who', m.name));
        const line = el('div', 'line');
        line.append(bub, t);
        body.append(line);
        row.append(same ? el('div', 'sp') : avatar(m.pid, m.name), body);
      }
      list.append(row);
      last = { pid: m.pid, name: m.name, time, timeEl: t };
      if (stick) list.scrollTop = list.scrollHeight;
      if (!quiet && !mine && !open) {
        unread++;
        badge.textContent = unread > 99 ? '99+' : unread;
        badge.hidden = false;
        launcher.setAttribute('aria-label', `채팅 열기, 안 읽은 메시지 ${unread}개`);
      }
    }

    function addSys(text) {
      const stick = nearBottom();
      dayDivider(new Date());
      list.append(el('p', 'sys', text));
      last = null;
      if (stick) list.scrollTop = list.scrollHeight;
    }

    function renderPeople() {
      count.textContent = `${people.length}명 접속 중`;
      if (!pplView.hidden) h2.textContent = `접속자 ${people.length}명`;
      const sorted = [...people].sort((a, b) => (b.pid === myPid) - (a.pid === myPid));
      pplList.replaceChildren(...sorted.map((p) => {
        const li = el('li');
        li.append(avatar(p.pid, p.name), el('span', 'nm', p.name));
        if (p.pid === myPid) li.append(el('span', 'tag', '나'));
        return li;
      }));
    }

    function setMe(me) {
      myPid = me ? me.pid : null;
      meName.hidden = !me;
      if (!me) return;
      if (me.anon) store.set(NAME_KEY, me.name);   // 익명일 때만 자동 생성된 이름을 기억
      meName.textContent = '나 · ' + me.name;
    }

    function showToast(text, ms) {
      toast.lastElementChild.textContent = text;
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.hidden = true; refreshSend(); }, ms);
    }

    const sysText = (e) => e.kind === 'join' ? `${e.name}님이 들어왔어요` : `${e.name}님이 나갔어요`;

    function handle(m) {
      if (m.t === 'hello') {
        setMe(m.me);
        refreshSend();
        if (m.history) { // 서버가 지난 메시지를 안 보내면(null) 지금 보이는 대화를 그대로 둔다
          list.replaceChildren();
          lastDay = last = null;
          m.history.forEach((x) => addMsg(x, true));
        }
        people = m.people;
        renderPeople();
        list.scrollTop = list.scrollHeight;
      } else if (m.t === 'msg') {
        addMsg(m);
      } else if (m.t === 'people') {
        people = m.people;
        renderPeople();
        if (m.event) addSys(sysText(m.event));
      } else if (m.t === 'error' && m.code === 'rate') {
        rateUntil = Date.now() + m.retryMs;
        if (!input.value && pending) input.value = pending;   // 못 보낸 글 되돌려 놓기
        counter.textContent = `${input.value.length}/${MAX_TEXT}`;
        showToast(`너무 빨리 보내고 있어요. ${Math.ceil(m.retryMs / 1000)}초 뒤에 다시 보내 주세요.`, m.retryMs);
        refreshSend();
      }
    }

    function setConnected(v) {
      connected = v;
      online.classList.toggle('off', !v);
      if (!v) count.textContent = '연결 끊김';
      refreshSend();
    }

    function connect() {
      const q = new URLSearchParams({ room, cid });
      const name = store.get(NAME_KEY);
      if (name) q.set('name', name);
      ws = new WebSocket(WS_URL + '?' + q);
      ws.onopen = () => { retry = 0; banner.hidden = true; setConnected(true); };
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } handle(m); };
      ws.onclose = () => {
        setConnected(false);
        banner.hidden = false;
        setTimeout(connect, Math.min(15000, 1000 * 2 ** retry++) + Math.random() * 500);
      };
    }

    launcher.addEventListener('click', () => setOpen(!open));
    closeBtn.addEventListener('click', () => setOpen(false));
    pplBtn.addEventListener('click', () => setView('people'));
    backBtn.addEventListener('click', () => setView('chat'));
    input.addEventListener('input', () => { counter.textContent = `${input.value.length}/${MAX_TEXT}`; refreshSend(); });
    composer.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || !connected || Date.now() < rateUntil) return;
      ws.send(JSON.stringify({ t: 'msg', text }));
      pending = text;
      input.value = '';
      counter.textContent = `0/${MAX_TEXT}`;
      refreshSend();
    });

    connect();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
