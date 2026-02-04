# AI Heads-up Hold'em Frontend

이 디렉토리는 AI와 1:1 홀덤을 즐길 수 있는 웹 프론트엔드 애플리케이션입니다.
React (Vite) + TypeScript로 개발되었습니다.

## 실행 방법

1. 의존성 설치
   ```bash
   cd frontend
   npm install
   ```

2. 개발 서버 실행
   ```bash
   npm run dev
   ```
   브라우저에서 `http://localhost:5173`으로 접속하세요.

## 주요 기능

- **게임 생성**: 새로운 게임 세션을 생성합니다.
- **게임 참가**: 'Hansu'(플레이어) 또는 'Clawd'(AI)로 참가할 수 있습니다.
- **게임 플레이**:
  - 베팅 액션 (Check, Call, Bet, Raise, Fold)
  - 공정성 검증 (SHA256 Commit/Reveal 프로토콜 자동 수행)
  - 실시간 게임 상태 폴링

## 설정

백엔드 서버가 `http://localhost:3000`에서 실행 중이어야 합니다.
`vite.config.ts`에 API 프록시가 설정되어 있습니다.

인증 토큰은 **코드에 하드코딩하지 않고**, 앱 UI에서 입력해 로컬에 저장(localStorage)하도록 했습니다.
- `TOKEN_HANSU`, `TOKEN_CLAWD` 값을 입력하세요(백엔드 `.env`와 일치해야 함)
