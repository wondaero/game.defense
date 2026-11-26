# 작업 규칙 (모든 컴퓨터·모든 세션 공통)

## 시작할 때
1. **[docs/worklog.md](docs/worklog.md) 를 먼저 읽는다.** 다른 컴퓨터에서 받은 요청·결정·남은 일이 모두 여기 있다.
2. 방향·확정 사항: [docs/game.war/docs/defense-start.md](docs/game.war/docs/defense-start.md). 예전 프로젝트(동시 턴 전술 대전) 전체가 `docs/game.war/` 에 참고용으로 있음 (예전 규칙 `docs/game.war/docs/design.md`, 특수능력 원문 `docs/game.war/docs/spec`).

## 요청을 받을 때마다
- **docs/worklog.md 맨 아래(해당 날짜)에 요청 요약 → 결과·결정·남은 일을 추가한다.** 작은 요청도 빠짐없이.
- 다른 컴퓨터에서 보려면 커밋·푸시가 필요하다. 커밋·푸시는 사용자가 요청할 때만 하되, 기록이 쌓였으면 올릴지 물어본다.

## 소통
- 사용자에게 보이는 글은 **항상 한국어**. 코드·명령·파일 경로만 영어.

## 구조
- `packages/defense` 게임 규칙 엔진 (화면과 분리, 고정 틱 + 정수 계산 → 같은 입력이면 같은 결과)
  - `map.ts` 맵 해석·길 위 거리 ↔ 좌표, `maps.ts` 맵 데이터, `stages.ts` 탄 공식(1~100 + 무한)·몬스터·몬스터 능력, `abilities.ts` 캐릭 특수능력, `roster.ts` 캐릭 뽑기, `sim.ts` 탄 진행(명중 판정 포함), `config.ts` 설정
- `apps/web` 브라우저 시험판 (Vite + React, 판은 canvas)
  - `sprites.ts` 스프라이트 불러오기·그리기, `draw.ts` 판 그리기(개체별 애니메이션 상태 AnimState), `Bench.tsx` 그리기 성능 시험
- `scripts/sprites/` 그림 (SVG 코드로 직접 그림): `art.mjs` 캐릭 8종·몬스터 4종의 모션별 프레임, `build.mjs` → `npm run sprites` 가 `apps/web/public/sprites/` 에 시트(SVG·PNG 2배)·`sprites.json`·`preview.html` 생성. 그림을 고치면 다시 실행
- 확인: `npm run typecheck`, `npx vitest run`, `npm run build`. 실행: `npm run dev` → http://localhost:5180
- 난이도 곡선 확인: `SIM=1 npx vitest run` → 덱별로 몇 탄까지 가는지 출력 (PowerShell: `$env:SIM=1; npx vitest run`)
- 시험판 저장(최고 기록·캐릭 씨앗·맵별 배치)은 브라우저 localStorage `defense.save.v1`

## 금지
- Supabase 비밀 키(service_role / sb_secret)를 앱·대화·커밋에 넣지 않는다
- 엔진(`packages/defense`)에서 `Math.random`·실수 누적 계산 금지 (결정성 유지). 난수는 `rng.ts` 만
