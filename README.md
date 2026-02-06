# AI Heads-Up Hold'em

Provably fair heads-up Texas Hold'em poker — **Human vs AI (LLM)**.

Human 플레이어는 웹 UI로, AI(외부 LLM)는 REST API 폴링으로 대전합니다. 카드 셔플은 commit/reveal 기반 provably fair 프로토콜로 검증 가능합니다.

## Architecture

```
┌─────────────┐     Socket.IO      ┌─────────────────┐     PostgreSQL
│  React SPA  │◄──────────────────►│   NestJS API     │◄──────────────►  DB
│  (Human UI) │     REST API       │   (port 3000)    │
└─────────────┘                    └────────┬─────────┘
                                            │ REST API (polling)
                                   ┌────────▼─────────┐
                                   │   External LLM    │
                                   │   (AI Player)     │
                                   └──────────────────┘
```

| Component | Stack |
|-----------|-------|
| Backend | NestJS 11, TypeORM, PostgreSQL, Socket.IO |
| Frontend | React 18, Vite, Socket.IO Client |
| Infra | Docker Compose (nginx, api, postgres, redis) |

## Quick Start (Docker)

### 1. 환경변수 설정

```bash
cp .env.example .env
```

`.env`를 열어 토큰을 설정합니다:

```env
TOKEN_HANSU=my-secret-human-token    # Human 플레이어 인증 토큰
TOKEN_CLAWD=my-secret-ai-token       # AI(LLM) 플레이어 인증 토큰
DATABASE_URL=postgres://holdem:holdem@postgres:5432/holdem
REDIS_URL=redis://redis:6379
```

### 2. 실행

```bash
docker compose up --build -d
```

### 3. 접속

| URL | 설명 |
|-----|------|
| `http://localhost:8080` | 웹 UI (Human 플레이어) |
| `http://localhost:8080/api/docs` | Swagger API 문서 |
| `http://localhost:8080/api/games/:id/state` | REST API (LLM용) |

## Local Development

### Backend

```bash
npm install
npm run start:dev          # Watch mode (port 3000)
```

DATABASE_URL 미설정 시 SQLite in-memory로 자동 폴백됩니다.

### Frontend

```bash
cd frontend
npm install
npm run dev                # Vite dev server (port 5173)
```

Vite가 `/api` 요청을 `localhost:3000`으로 프록시합니다.

### 전체 명령어

```bash
# Backend
npm run build              # TypeScript 컴파일
npm run lint               # ESLint (auto-fix)
npm run format             # Prettier
npm test                   # Jest 유닛 테스트
npm run test:e2e           # E2E 테스트

# Frontend
cd frontend
npm run build              # 프로덕션 빌드
npm run lint               # ESLint
```

## Game Flow

### Human (웹 UI)

1. 웹 UI에서 TOKEN_HANSU 입력
2. **Create New Game** 클릭 → 게임 생성 (AI 자동 참여)
3. **Join as Human** 클릭 → 양쪽 joined → 핸드 자동 시작
4. Fairness Panel에서 **New Seed → Commit → Reveal** 수행 (AI는 서버가 자동 처리)
5. 카드 딜링 후 베팅 액션 수행 (Fold / Check / Call / Bet / Raise)
6. 핸드 종료 → 다음 핸드 자동 시작 (칩 소진 시 게임 종료)

### AI / LLM (REST API)

AI는 웹소켓 없이 REST API 폴링만으로 플레이합니다.

```bash
# 1. 상태 조회
curl -H "Authorization: Bearer $TOKEN_CLAWD" \
  http://localhost:8080/api/games/$GAME_ID/state

# 2. 내 턴 확인: hand.betting.toAct === 'clawd'

# 3. 액션 전송
curl -X POST \
  -H "Authorization: Bearer $TOKEN_CLAWD" \
  -H "Content-Type: application/json" \
  -d '{"action":"call"}' \
  http://localhost:8080/api/games/$GAME_ID/action

# 4. 반복 (game.status === 'finished' 될 때까지)
```

자세한 LLM 통합 가이드: [`docs/llm-play-guide.md`](docs/llm-play-guide.md)

## API Reference

전체 API는 Swagger UI(`/api/docs`)에서 확인할 수 있습니다.

### 주요 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/games` | 게임 생성 (AI 자동 참여) |
| `POST` | `/games/:gameId/join` | 게임 참여 |
| `GET` | `/games/:gameId/state` | 현재 상태 조회 (플레이어별 필터링) |
| `POST` | `/games/:gameId/action` | 베팅 액션 |
| `POST` | `/games/:gameId/hands/:handId/commit` | Fairness commit hash 제출 |
| `POST` | `/games/:gameId/hands/:handId/reveal` | Fairness seed 공개 |
| `GET` | `/games/:gameId/history` | 핸드 히스토리 조회 |

### 인증

모든 API는 Bearer token 인증이 필요합니다:

```
Authorization: Bearer <TOKEN_HANSU 또는 TOKEN_CLAWD>
```

서버가 토큰으로 플레이어를 식별합니다 (hansu 또는 clawd).

### Action Body

```json
{ "action": "fold" }
{ "action": "check" }
{ "action": "call" }
{ "action": "bet", "amount": 200 }
{ "action": "raise", "amount": 600 }
```

`raise`의 `amount`는 총 베팅 크기(raise-to)입니다.

## Provably Fair Protocol

카드 셔플의 공정성을 암호학적으로 검증할 수 있습니다.

1. **Commit**: 양쪽 플레이어가 시드의 SHA-256 해시를 제출
2. **Reveal**: 양쪽 모두 commit 완료 후 원본 시드를 공개
3. **Deal**: 두 시드를 결합하여 결정론적 셔플 수행
4. **Verify**: 공개된 시드와 commit 해시 대조로 조작 불가 증명

AI 측 commit/reveal은 서버가 `crypto.randomBytes(32)`로 자동 생성합니다. Human만 수동으로 수행합니다.

## Real-Time Updates

Human 클라이언트는 Socket.IO로 실시간 이벤트를 수신합니다:

- `game:event` — 게임 상태 변경 (핸드 시작, 베팅 액션, 스트릿 딜링, 핸드 종료 등)

Socket.IO namespace: `/game`, 인증: `auth: { token }`.

## Environment Variables

| Variable | 설명 | 기본값 |
|----------|------|--------|
| `PORT` | API 서버 포트 | `3000` |
| `NODE_ENV` | 환경 | `development` |
| `TOKEN_HANSU` | Human 인증 토큰 | (필수) |
| `TOKEN_CLAWD` | AI 인증 토큰 | (필수) |
| `DATABASE_URL` | PostgreSQL 연결 문자열 | (미설정 시 SQLite) |
| `REDIS_URL` | Redis 연결 문자열 | — |
| `ACTION_TIMEOUT_MS` | 베팅 타임아웃 (ms) | `300000` |

## Project Structure

```
src/
├── auth/                  # Bearer token 인증 (global guard)
├── games/
│   ├── entities/          # TypeORM 엔티티 (GameEntity, HandEntity)
│   ├── games.controller.ts  # REST API 엔드포인트
│   ├── games.service.ts     # 게임 로직, 영속화, AI fairness 자동화
│   ├── games.gateway.ts     # Socket.IO 게이트웨이
│   ├── events.ts            # 이벤트 타입 정의
│   └── dto.ts               # 요청 DTO (class-validator)
├── poker/
│   ├── engine.ts            # 포커 상태 머신 (betting stages, hand evaluation)
│   └── cards.ts             # SHA-256 해싱, 셔플 알고리즘
├── config.ts              # 환경변수 설정 (registerAs)
├── http-exception.filter.ts # 에러 → HTTP 상태코드 매핑
└── main.ts

frontend/src/
├── App.tsx                # 라우팅 (Lobby ↔ Table)
├── Lobby.tsx              # 게임 생성/참여 UI
├── Table.tsx              # 게임 테이블 UI
├── FairnessPanel.tsx      # Provably fair commit/reveal UI
├── Card.tsx               # 카드 컴포넌트
├── api.ts                 # REST API 클라이언트
├── socket.ts              # Socket.IO 클라이언트
└── poker.ts               # 클라이언트 측 시드 생성/해싱

docs/
├── llm-play-guide.md      # LLM 통합 가이드
└── backlog.md             # 미결 항목 / 백로그
```

## License

UNLICENSED
