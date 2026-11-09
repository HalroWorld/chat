# chat

프로젝트의 Node 서버에 붙이는 실시간 채팅. 같은 방에 지금 들어와 있는 사람끼리 대화한다.
서버 코드 몇 줄 + 화면에 `<script>` 한 줄. 의존성 `ws`, `nickgen`. Node 22.13 이상.

## 설치

```bash
npm install github:HalroWorld/chat
```

## 서버에 붙이기

```js
import { attachChat } from 'chat';

const chat = attachChat(server, {          // server: http.createServer(...) 또는 app.listen(...)이 돌려준 것
  getUser: async (req) => {                 // 로그인한 사람. 없으면 null
    const s = await getSession(req);        // 그 프로젝트의 세션 읽기 (쿠키는 WebSocket 요청에도 실린다)
    return s ? { id: s.userId, name: s.nickname } : null;
  },
  allowAnonymous: true,                     // false면 로그인 안 한 사람은 보기만
  dbFile: 'data/chat.db',                   // 최근 50개만 보관. 백업 대상에 넣는다
});
```

위젯 파일(`/chat/chat.js`) 제공:

```js
app.use(chat.handle);                       // Express
if (chat.handle(req, res)) return;          // 일반 http 핸들러 맨 앞
```

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `getUser(req)` | `() => null` | `{ id, name }` 또는 `null`. async 가능. 이름은 20자 이하 |
| `allowAnonymous` | `true` | 로그인 안 한 사람도 채팅(nickgen 이름, 브라우저에 기억) |
| `dbFile` | `data/chat.db` | 실행 위치 기준 |
| `path` | `/chat` | 위젯 `{path}/chat.js`, WebSocket `{path}/ws` |
| `origins` | 같은 호스트만 | 허용할 Origin 목록. 다른 도메인 화면에서 붙일 때만 |

## 화면에 붙이기

```html
<script src="/chat/chat.js" data-room="lobby"></script>
```

| 속성 | 설명 |
|---|---|
| `data-room` | 방 이름(영문·숫자·`-`·`_`, 64자 이하). 기본 `lobby` |
| `data-title` | 채팅창 제목. 기본: `lobby`면 "로비", 아니면 방 이름 |
| `data-target` | CSS 선택자. 주면 그 요소 안에 끼워 넣고, 없으면 오른쪽 아래 떠 있는 버튼 |
| `data-color` | 강조색(hex). 기본 `#2563EB` |

## 알아 둘 것

- 이름이 지금 접속자와 겹치면 뒤에 ` 002`, ` 003`…이 붙는다.
- 접속자 목록은 메모리에 있다. 프로세스 하나(PM2 cluster 아님)로 돌린다.
- Next.js는 `next start`로는 WebSocket을 붙일 수 없어 custom server가 필요하다.
- Python 프로젝트용(채팅을 별도 프로세스로 띄우는 방식)은 아직 없다.

