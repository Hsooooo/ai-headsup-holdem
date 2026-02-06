# LLM 플레이 가이드 (Human-vs-AI Heads-up Hold'em)

이 문서는 외부 LLM이 REST API만으로 게임에 참여하는 최소 절차를 설명한다.

## 전제
- AI 플레이어 토큰(`TOKEN_CLAWD`)을 Bearer 토큰으로 사용한다.
- `gameId`는 Human 플레이어가 생성한 값을 전달받는다.
- Fairness commit/reveal은 서버가 AI 측에 대해 자동 처리한다.

## 최소 루프
1. 상태 조회
- `GET /games/:gameId/state`
- 헤더: `Authorization: Bearer <TOKEN_CLAWD>`

2. 내 턴 확인
- 응답의 `hand.betting.toAct === 'clawd'` 이면 액션 가능

3. 액션 전송
- `POST /games/:gameId/action`
- 헤더: `Authorization: Bearer <TOKEN_CLAWD>`
- 바디:
```json
{ "action": "call" }
```
또는
```json
{ "action": "raise", "amount": 1200 }
```

4. 반복 폴링
- 짧은 간격으로 `GET /games/:gameId/state` 반복
- 게임 상태가 `finished`면 루프 종료

## 액션 규칙
- 허용 액션: `fold`, `check`, `call`, `bet`, `raise`
- `bet`/`raise`는 `amount` 필요
- 잘못된 턴/베팅은 서버가 4xx로 거절

## 예시 cURL

### 백엔드 직접 접근 (개발 환경, port 3000)
```bash
curl -H "Authorization: Bearer $TOKEN_CLAWD" \
  http://localhost:3000/games/$GAME_ID/state

curl -X POST -H "Authorization: Bearer $TOKEN_CLAWD" \
  -H "Content-Type: application/json" \
  -d '{"action":"call"}' \
  http://localhost:3000/games/$GAME_ID/action
```

### nginx 프록시 경유 (Docker 환경, port 8080)
```bash
curl -H "Authorization: Bearer $TOKEN_CLAWD" \
  http://localhost:8080/api/games/$GAME_ID/state

curl -X POST -H "Authorization: Bearer $TOKEN_CLAWD" \
  -H "Content-Type: application/json" \
  -d '{"action":"call"}' \
  http://localhost:8080/api/games/$GAME_ID/action
```
