# 작업 규칙 (모든 컴퓨터·모든 세션 공통)

## 시작할 때
0. 새 컴퓨터면: `git pull`(또는 clone) → `npm install` → `npm run dev` (http://localhost:5180). 자세한 건 worklog 의 "다른 컴퓨터에서 이어서 하기"
1. **[docs/worklog.md](docs/worklog.md) 를 먼저 읽는다.** 다른 컴퓨터에서 받은 요청·결정·남은 일이 모두 여기 있다.
2. **현재 규칙: [docs/design.md](docs/design.md)** (확정/임시/미정 표시). 처음 방향: [docs/game.war/docs/defense-start.md](docs/game.war/docs/defense-start.md), 사용자 특수능력 원문: [docs/spec](docs/spec). 예전 프로젝트(동시 턴 전술 대전) 전체가 `docs/game.war/` 에 참고용으로 있음 (예전 규칙 `docs/game.war/docs/design.md`, 특수능력 원문 `docs/game.war/docs/spec`).

## 요청을 받을 때마다
- **docs/worklog.md 맨 아래(해당 날짜)에 요청 요약 → 결과·결정·남은 일을 추가한다.** 작은 요청도 빠짐없이.
- 다른 컴퓨터에서 보려면 커밋·푸시가 필요하다. 커밋·푸시는 사용자가 요청할 때만 하되, 기록이 쌓였으면 올릴지 물어본다.

## 소통
- 사용자에게 보이는 글은 **항상 한국어** (질문 창의 질문·선택지 포함). 코드·명령·파일 경로만 영어.
- 사용자가 정하지 않은 수치는 추천값으로 넣되 design.md 에 *임시* 로 표시하고 확인받는다.

## 구조
- `packages/defense` 게임 규칙 엔진 (화면과 분리, 고정 틱 + 정수 계산 → 같은 입력이면 같은 결과)
  - `map.ts` 맵 해석·길 위 거리 ↔ 좌표, `maps.ts` 맵 데이터(**직접 고치지 말 것 — `docs/map유형.xlsx` 를 고치고 `npm run maps` → `npm run rank-maps` → `npm run calibrate`**), `mapOrder.ts` 맵 난이도 순서(`npm run rank-maps` 가 생성), `stages.ts` 탄 공식(1~100 + 무한)·몬스터·몬스터 능력, `abilities.ts` 캐릭 특수능력, `roster.ts` 캐릭 뽑기, `barracks.ts` 막사 규칙(뽑기·능력치/특수능력 변경·합성·권), `account.ts` 계정 요청 처리(막사 요청·탄 판정 — 나중에 서버가 그대로 씀), `sim.ts` 탄 진행(명중 판정 포함), `config.ts` 설정
  - `reference.ts` 탄 난이도 기준 덱, `autoplace.ts` 자동 배치, `stageHp.ts` 탄별 체력 표 (**`npm run calibrate` 가 생성 — 규칙·몬스터·맵을 바꾸면 다시 실행**, 스크립트는 `scripts/calibrate.ts`)
- `apps/web` 브라우저 시험판 (Vite + React, 판은 canvas)
  - `sprites.ts` 스프라이트 불러오기·그리기, `draw.ts` 판 그리기(개체별 애니메이션 상태 AnimState), `ground.ts` 바닥 그림(풀밭·길·입구/출구, 맵마다 한 번 그려 캐시. 배치 중에만 배치 칸 네모), `api/` 계정 창구(`api.ts` 모양, `localApi.ts` 지금 쓰는 브라우저판 — **화면은 계정을 직접 고치지 말고 api 로만**), `Barracks.tsx` 막사 화면, `UnitList.tsx` 캐릭 목록 줄·필터·정렬, `StageMap.tsx` 탄 고르기 지도(구불구불한 길 위 동그라미 탄), `Bench.tsx` 그리기 성능 시험
- `scripts/sprites/` 그림 (SVG 코드로 직접 그림): `art.mjs` 캐릭(헬멧 쓴 사람: 헬멧 색 6등급 `unit_t1~6` + 특수능력 도구 겹 그림 `tool_*`)·몬스터 12종(슬라임 + 특성 소품 `mon_*`)·소품 시안(`acc_*`)의 모션별 프레임. 캐릭 모습은 `apps/web/src/format.ts` unitLook, `build.mjs` → `npm run sprites` 가 `apps/web/public/sprites/` 에 시트(SVG·PNG 2배, 프레임마다 둘레 여백 16 — 그림은 96 안에 그리고 휘두르는 것만 여백까지)·`sprites.json`·`preview.html` 생성. 그림을 고치면 다시 실행
- 확인: `npm run typecheck`, `npx vitest run`, `npm run build`. 실행: `npm run dev` → http://localhost:5180
- 난이도 곡선 확인: `SIM=1 npx vitest run` → 덱별로 몇 탄까지 가는지 출력 (PowerShell: `$env:SIM=1; npx vitest run`)
- 시험판 저장: 계정(캐릭·권·최고 기록·별)은 localStorage `defense.account.v1`(localApi), 화면 설정(맵별 배치 등)은 `defense.save.v1`

## 금지
- Supabase 비밀 키(service_role / sb_secret)를 앱·대화·커밋에 넣지 않는다
- 엔진(`packages/defense`)에서 `Math.random`·실수 누적 계산 금지 (결정성 유지). 난수는 `rng.ts` 만
