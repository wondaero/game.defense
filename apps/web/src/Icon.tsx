import { MONSTER_ABILITIES, type MonsterAbilityKind } from '@def/defense'
import { MON_AB_COLOR } from './format.ts'
/**
 * 아이콘 (2026-11-28): 이모지 대신 직접 그린 SVG — 기기마다 모양이 달라지지 않고 게임 그림체(굵은 갈색 외곽선 + 납작한 색)와 맞춤.
 * 쓰는 법: <Icon name="tent" /> — 크기는 글자 크기(1em)를 따름. 개발자 탭 "아이콘 모아 보기"에서 전부 확인
 */
const O = '#3f3123' // 외곽선 (스프라이트와 같은 색)
const W = 1.6

type Draw = () => JSX.Element

const ICONS = {
  /** 막사 */
  tent: () => (
    <>
      <path d="M12 3 L22 20 H2 Z" fill="#e57348" stroke={O} strokeWidth={W} strokeLinejoin="round" />
      <path d="M12 3 L17 20 H7 Z" fill="#f4a261" stroke={O} strokeWidth={W} strokeLinejoin="round" />
      <path d="M12 11 L14.5 20 H9.5 Z" fill="#5d3a24" stroke={O} strokeWidth={W} strokeLinejoin="round" />
      <path d="M12 3 V1.5 M12 1.5 L15 2.5 L12 3.5" fill="#ffd54f" stroke={O} strokeWidth={1.2} strokeLinejoin="round" />
    </>
  ),
  /** 스테이지 (칼 두 자루) */
  swords: () => (
    <>
      <path d="M4 3 L15 14 L16.5 12.5 L5.5 1.5 Z" transform="translate(0 1)" fill="#e3e8ec" stroke={O} strokeWidth={W} strokeLinejoin="round" />
      <path d="M20 3 L9 14 L7.5 12.5 L18.5 1.5 Z" transform="translate(0 1)" fill="#e3e8ec" stroke={O} strokeWidth={W} strokeLinejoin="round" />
      <path d="M13 17 L19 11 M5 11 L11 17" stroke={O} strokeWidth={3.6} strokeLinecap="round" />
      <path d="M13 17 L19 11 M5 11 L11 17" stroke="#ffb300" strokeWidth={2} strokeLinecap="round" />
      <path d="M16 18 L20 22 M8 18 L4 22" stroke={O} strokeWidth={3.4} strokeLinecap="round" />
      <path d="M16 18 L20 22 M8 18 L4 22" stroke="#8d5a3b" strokeWidth={1.8} strokeLinecap="round" />
    </>
  ),
  /** 스테이지 (풀밭 위 꼬부랑 S자 길, 2026-11-28 칼 대신) */
  road: () => (
    <>
      {/* 풀밭 + 꼬부랑 길: 아래(가까운 쪽)는 굵고 위(먼 쪽)로 갈수록 가늘게 → 멀리 이어지는 느낌. 길 끝은 테두리에서 잘림 (2026-11-28) */}
      <defs>
        <clipPath id="road-tile">
          <rect x="1.5" y="1.5" width="21" height="21" rx="5" />
        </clipPath>
        <linearGradient id="road-grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a6dd84" />
          <stop offset="1" stopColor="#7cc35a" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="url(#road-grass)" />
      <g clipPath="url(#road-tile)">
        <path d="M9.5 26 C9.5 21.5 4.2 21 5.2 17.2 C5.8 15.2 9 14.6 12 14.2" fill="none" stroke={O} strokeWidth={5.6} />
        <path d="M12 14.2 C15.5 13.7 18.6 12.6 18 10.2 C17.5 8.4 13.5 8.6 11.2 7.4" fill="none" stroke={O} strokeWidth={4.6} />
        <path d="M11.2 7.4 C9.4 6.4 9.6 4.4 11.8 3 C13 2.2 14 1 14.4 -1" fill="none" stroke={O} strokeWidth={3.7} />
        <path d="M9.5 26 C9.5 21.5 4.2 21 5.2 17.2 C5.8 15.2 9 14.6 12 14.2" fill="none" stroke="#f0d29f" strokeWidth={3.5} />
        <path d="M12 14.2 C15.5 13.7 18.6 12.6 18 10.2 C17.5 8.4 13.5 8.6 11.2 7.4" fill="none" stroke="#f0d29f" strokeWidth={2.7} />
        <path d="M11.2 7.4 C9.4 6.4 9.6 4.4 11.8 3 C13 2.2 14 1 14.4 -1" fill="none" stroke="#f0d29f" strokeWidth={2} />
        <path d="M9.5 26 C9.5 21.5 4.2 21 5.2 17.2 C5.8 15.2 9 14.6 12 14.2" fill="none" stroke="#fff" strokeWidth={0.8} strokeDasharray="1.3 1.6" />
        <path d="M12 14.2 C15.5 13.7 18.6 12.6 18 10.2 C17.5 8.4 13.5 8.6 11.2 7.4" fill="none" stroke="#fff" strokeWidth={0.7} strokeDasharray="1.3 1.6" />
        {/* 풀 몇 포기 + 작은 꽃 */}
        <path d="M17.5 19.5 l.6-1.6 .6 1.6 M19.3 19.8 l.5-1.3 .5 1.3 M4.5 9.5 l.5-1.3 .5 1.3" fill="none" stroke="#4e9a35" strokeWidth={0.8} strokeLinecap="round" />
        <circle cx="5.2" cy="4.8" r="1" fill="#ff8fb1" />
        <circle cx="19.6" cy="5.6" r="0.8" fill="#fff" />
      </g>
      <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="none" stroke={O} strokeWidth={W} />
    </>
  ),
  /** 상점 (수레) */
  cart: () => (
    <>
      <path d="M2 4 H5 L7.5 15 H18.5 L21 7 H6" fill="#ffe082" stroke={O} strokeWidth={W} strokeLinejoin="round" strokeLinecap="round" />
      <path d="M8.2 11 H19.6" stroke={O} strokeWidth={1.2} />
      <circle cx="9" cy="19" r="2" fill="#90a4ae" stroke={O} strokeWidth={W} />
      <circle cx="17" cy="19" r="2" fill="#90a4ae" stroke={O} strokeWidth={W} />
    </>
  ),
  /** 설정 (톱니) */
  gear: () => (
    <>
      <path
        d="M10.3 2 h3.4 l.5 2.6 a7.6 7.6 0 0 1 2 1.2 l2.5-.9 1.7 2.9-2 1.7 a7.6 7.6 0 0 1 0 2.3 l2 1.7-1.7 2.9-2.5-.9 a7.6 7.6 0 0 1-2 1.2 l-.5 2.6 h-3.4 l-.5-2.6 a7.6 7.6 0 0 1-2-1.2 l-2.5.9-1.7-2.9 2-1.7 a7.6 7.6 0 0 1 0-2.3 l-2-1.7 1.7-2.9 2.5.9 a7.6 7.6 0 0 1 2-1.2 Z"
        transform="translate(0 1)"
        fill="#b0bec5"
        stroke={O}
        strokeWidth={W}
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" fill="#eceff1" stroke={O} strokeWidth={W} />
    </>
  ),
  /** 개발자 (렌치) */
  wrench: () => (
    <>
      <path d="M14.5 3 a5 5 0 0 0-4.6 6.8 L3.2 16.5 a2 2 0 0 0 2.8 2.8 L12.7 12.6 A5 5 0 0 0 19.5 8 L16.5 9.5 L14 8 L14 5 L16.6 3.4 A5 5 0 0 0 14.5 3 Z" transform="translate(0.5 1)" fill="#b0bec5" stroke={O} strokeWidth={W} strokeLinejoin="round" />
      <circle cx="5.2" cy="18.8" r="0.9" fill={O} />
    </>
  ),
  /** 뽑기 티켓 */
  ticket: () => (
    <>
      <path d="M3 7 H21 V10 a2 2 0 0 0 0 4 V17 H3 V14 a2 2 0 0 0 0-4 Z" fill="#ff7a8a" stroke={O} strokeWidth={W} strokeLinejoin="round" />
      <path d="M15 7.5 V16.5" stroke="#fff" strokeWidth={1.2} strokeDasharray="1.5 1.5" />
      <path d="M8.5 9.5 l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3 Z" fill="#ffe082" stroke={O} strokeWidth={0.9} strokeLinejoin="round" />
    </>
  ),
  /** 능력치 변경 (돌아가는 화살표) */
  reroll: () => (
    <>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="#64b5f6" stroke={O} strokeWidth={W} />
      <path d="M7 11 a5 5 0 0 1 9-2.5 M17 13 a5 5 0 0 1-9 2.5" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      <path d="M16.5 5.5 V9 H13" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 18.5 V15 H11" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  /** 능력치 변경 티켓 보통 (2026-11-29: 보통 동 · 상급 은 · 최상급 금) */
  rerollBronze: () => (
    <>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="#8a4b22" stroke={O} strokeWidth={W} />
      <path d="M7 11 a5 5 0 0 1 9-2.5 M17 13 a5 5 0 0 1-9 2.5" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      <path d="M16.5 5.5 V9 H13" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 18.5 V15 H11" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  /** 능력치 변경 티켓 상급 (2026-11-29: 보통 동 · 상급 은 · 최상급 금) */
  rerollSilver: () => (
    <>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="#a9b6bf" stroke={O} strokeWidth={W} />
      <path d="M7 11 a5 5 0 0 1 9-2.5 M17 13 a5 5 0 0 1-9 2.5" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      <path d="M16.5 5.5 V9 H13" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 18.5 V15 H11" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  /** 능력치 변경 티켓 최상급 (2026-11-29: 보통 동 · 상급 은 · 최상급 금) */
  rerollGold: () => (
    <>
      {/* 금: 밝은 노랑 + 반짝 별 (동과 헷갈리지 않게, 2026-11-29) */}
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="#ffd21a" stroke={O} strokeWidth={W} />
      <path d="M7 11 a5 5 0 0 1 9-2.5 M17 13 a5 5 0 0 1-9 2.5" fill="none" stroke="#8a5a00" strokeWidth={2} strokeLinecap="round" />
      <path d="M16.5 5.5 V9 H13" fill="none" stroke="#8a5a00" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 18.5 V15 H11" fill="none" stroke="#8a5a00" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 0.5 l1 2 2 .3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2-1.5-1.4 2-.3 Z" fill="#fff59d" stroke={O} strokeWidth={0.9} strokeLinejoin="round" />
    </>
  ),
  /** 특수능력 (반짝이) */
  sparkle: () => (
    <>
      <path d="M10 2 C10.8 7 12 8.2 17 9 C12 9.8 10.8 11 10 16 C9.2 11 8 9.8 3 9 C8 8.2 9.2 7 10 2 Z" fill="#ffd54f" stroke={O} strokeWidth={W} strokeLinejoin="round" />
      <path d="M18 13 C18.4 15.6 19 16.2 21.5 16.5 C19 16.8 18.4 17.4 18 20 C17.6 17.4 17 16.8 14.5 16.5 C17 16.2 17.6 15.6 18 13 Z" fill="#ce93d8" stroke={O} strokeWidth={1.3} strokeLinejoin="round" />
    </>
  ),
  /** 특수능력 부여 (선물) */
  gift: () => (
    <>
      <rect x="3.5" y="9" width="17" height="12" rx="1.5" fill="#ff8a65" stroke={O} strokeWidth={W} />
      <rect x="2.5" y="6.5" width="19" height="4" rx="1.2" fill="#ffab91" stroke={O} strokeWidth={W} />
      <path d="M12 6.5 V21" stroke={O} strokeWidth={4} />
      <path d="M12 6.5 V21" stroke="#ffd54f" strokeWidth={2.4} />
      <path d="M12 6.5 C9 2 5.5 3.5 7.5 6.5 Z M12 6.5 C15 2 18.5 3.5 16.5 6.5 Z" fill="#ffd54f" stroke={O} strokeWidth={1.3} strokeLinejoin="round" />
    </>
  ),
  /** 합성 (플라스크) */
  flask: () => (
    <>
      <path d="M9 2.5 H15 M10 2.5 V9 L4 19 a2 2 0 0 0 1.7 3 H18.3 a2 2 0 0 0 1.7-3 L14 9 V2.5" fill="#e3f2fd" stroke={O} strokeWidth={W} strokeLinejoin="round" strokeLinecap="round" />
      <path d="M6.6 15 H17.4 L20 19 a2 2 0 0 1-1.7 3 H5.7 a2 2 0 0 1-1.7-3 Z" fill="#81c784" stroke={O} strokeWidth={W} strokeLinejoin="round" />
      <circle cx="10" cy="18" r="1" fill="#fff" />
      <circle cx="13.5" cy="19" r="0.7" fill="#fff" />
    </>
  ),
  /** 골드 (동전) */
  coin: () => (
    <>
      <circle cx="12" cy="12" r="9" fill="#ffca28" stroke={O} strokeWidth={W} />
      <circle cx="12" cy="12" r="6.2" fill="none" stroke="#f9a825" strokeWidth={1.4} />
      <path d="M12 8 V16 M10 9.5 H13.2 a1.5 1.5 0 0 1 0 3 H10.8 a1.5 1.5 0 0 0 0 3 H14" fill="none" stroke="#8d6e00" strokeWidth={1.4} strokeLinecap="round" />
    </>
  ),
  /** 별 */
  star: () => <path d="M12 2.5 l2.9 5.9 6.5 .9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5L2.6 9.3l6.5-.9Z" fill="#ffc107" stroke={O} strokeWidth={W} strokeLinejoin="round" />,
  /** 배경음 */
  music: () => (
    <>
      <path d="M9 18 V5 L20 3 V16" fill="none" stroke={O} strokeWidth={2.6} strokeLinejoin="round" />
      <path d="M9 18 V5 L20 3 V16" fill="none" stroke="#7e57c2" strokeWidth={1.2} strokeLinejoin="round" />
      <ellipse cx="6.5" cy="18" rx="3" ry="2.4" fill="#7e57c2" stroke={O} strokeWidth={W} />
      <ellipse cx="17.5" cy="16" rx="3" ry="2.4" fill="#7e57c2" stroke={O} strokeWidth={W} />
    </>
  ),
  /** 효과음 */
  speaker: () => (
    <>
      <path d="M3 9 H7 L12 5 V19 L7 15 H3 Z" fill="#90a4ae" stroke={O} strokeWidth={W} strokeLinejoin="round" />
      <path d="M15.5 9 a4 4 0 0 1 0 6 M18 6.5 a7.5 7.5 0 0 1 0 11" fill="none" stroke={O} strokeWidth={W} strokeLinecap="round" />
    </>
  ),
  /** 일시정지 */
  pause: () => (
    <>
      <rect x="5.5" y="4" width="4.5" height="16" rx="1.5" fill="#fff" stroke={O} strokeWidth={W} />
      <rect x="14" y="4" width="4.5" height="16" rx="1.5" fill="#fff" stroke={O} strokeWidth={W} />
    </>
  ),
  /** 시간 */
  timer: () => (
    <>
      <path d="M10 2 H14 M12 2 V4.5" stroke={O} strokeWidth={W} strokeLinecap="round" />
      <circle cx="12" cy="13.5" r="8" fill="#fff" stroke={O} strokeWidth={W} />
      <path d="M12 13.5 V9 M12 13.5 L15 15" stroke="#e53935" strokeWidth={1.8} strokeLinecap="round" />
    </>
  ),
  /** 도감 (책) */
  book: () => (
    <>
      <path d="M3 5 C6 3.5 9 3.5 12 5.5 C15 3.5 18 3.5 21 5 V19 C18 17.5 15 17.5 12 19.5 C9 17.5 6 17.5 3 19 Z" fill="#fff8e1" stroke={O} strokeWidth={W} strokeLinejoin="round" />
      <path d="M12 5.5 V19.5" stroke={O} strokeWidth={W} />
      <path d="M5.5 8.5 C7 8 8.5 8 10 9 M5.5 11.5 C7 11 8.5 11 10 12 M14 9 C15.5 8 17 8 18.5 8.5" stroke="#bcaaa4" strokeWidth={1.1} strokeLinecap="round" fill="none" />
    </>
  ),
  /** 능력 설명 (물음표 말풍선) */
  guide: () => (
    <>
      <path d="M4 4 H20 a1.5 1.5 0 0 1 1.5 1.5 V15 a1.5 1.5 0 0 1-1.5 1.5 H11 L6.5 20.5 V16.5 H4 a1.5 1.5 0 0 1-1.5-1.5 V5.5 A1.5 1.5 0 0 1 4 4 Z" fill="#64b5f6" stroke={O} strokeWidth={W} strokeLinejoin="round" />
      <path d="M9.8 8.6 a2.3 2.3 0 1 1 3.2 2.1 c-.7.3-1 .8-1 1.5" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
      <circle cx="12" cy="14.3" r="1" fill="#fff" />
    </>
  ),
  /** 앱 설치 (휴대폰 + 아래 화살표) */
  install: () => (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2.5" fill="#eceff1" stroke={O} strokeWidth={W} />
      <path d="M12 7 V15 M8.8 12 L12 15.2 L15.2 12" fill="none" stroke="#43a047" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.5 19 H13.5" stroke={O} strokeWidth={1.2} strokeLinecap="round" />
    </>
  ),
  /** 잠김 */
  lock: () => (
    <>
      <path d="M7.5 10 V7.5 a4.5 4.5 0 0 1 9 0 V10" fill="none" stroke={O} strokeWidth={2.4} />
      <path d="M7.5 10 V7.5 a4.5 4.5 0 0 1 9 0 V10" fill="none" stroke="#b0bec5" strokeWidth={1} />
      <rect x="5" y="10" width="14" height="11" rx="2" fill="#ffc107" stroke={O} strokeWidth={W} />
      <circle cx="12" cy="15" r="1.4" fill={O} />
    </>
  ),
  /** 우두머리 (왕관) */
  crown: () => (
    <>
      <path d="M3 8 L7.5 12 L12 5 L16.5 12 L21 8 L19 19 H5 Z" fill="#ffca28" stroke={O} strokeWidth={W} strokeLinejoin="round" />
      <circle cx="12" cy="14.5" r="1.6" fill="#e53935" stroke={O} strokeWidth={1} />
      <path d="M5.5 17 H18.5" stroke="#f9a825" strokeWidth={1.4} />
    </>
  ),
  /** 얼음 왕관 (얼음 맵 우두머리 탄, 2026-11-28): 하늘색 얼음 + 흰 사선 빛 + 얼음 결정 보석 */
  iceCrown: () => (
    <>
      <defs>
        <linearGradient id="ice-crown-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#bfe6fb" />
          <stop offset="1" stopColor="#6fb8e6" />
        </linearGradient>
      </defs>
      <path d="M3 8 L7.5 12 L12 4.5 L16.5 12 L21 8 L19 19 H5 Z" fill="url(#ice-crown-g)" stroke="#2f6f9e" strokeWidth={W} strokeLinejoin="round" />
      <path d="M8 16.5 L11 9.5 M13.5 17 L16 11.5" stroke="#fff" strokeWidth={1.3} strokeLinecap="round" opacity={0.9} />
      <path d="M12 12.3 L13.6 14.3 L12 16.3 L10.4 14.3 Z" fill="#e1f5fe" stroke="#2f6f9e" strokeWidth={1} strokeLinejoin="round" />
      <path d="M5.5 17 H18.5" stroke="#9fd3f2" strokeWidth={1.4} />
    </>
  ),
  /** 뒤로 (꺾쇠) */
  back: () => <path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />,
  /** 닫기 */
  close: () => <path d="M6 6 L18 18 M18 6 L6 18" stroke={O} strokeWidth={2.4} strokeLinecap="round" />,
  /** 확인 */
  check: () => <path d="M5 12.5 L10 17.5 L19 7" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />,
  /** 주의 */
  warn: () => (
    <>
      <path d="M12 3 L22 20.5 H2 Z" fill="#ffca28" stroke={O} strokeWidth={W} strokeLinejoin="round" />
      <path d="M12 9.5 V14" stroke={O} strokeWidth={2.2} strokeLinecap="round" />
      <circle cx="12" cy="17.2" r="1.2" fill={O} />
    </>
  ),
  /** 축하 (폭죽) */
  party: () => (
    <>
      <path d="M3 21 L8 8 L16 16 Z" fill="#ffb74d" stroke={O} strokeWidth={W} strokeLinejoin="round" />
      <path d="M5.5 15 L9.5 19 M6.8 11.6 L12.4 17.2" stroke="#e53935" strokeWidth={1.4} />
      <circle cx="17" cy="5" r="1.3" fill="#4fc3f7" />
      <circle cx="20" cy="10" r="1.2" fill="#e91e63" />
      <circle cx="12" cy="4" r="1" fill="#66bb6a" />
      <path d="M14 9 Q16 6 19 7 M15 12 Q18 11 20.5 13.5" fill="none" stroke="#7e57c2" strokeWidth={1.4} strokeLinecap="round" />
    </>
  ),
  /** 주사위 (다시 뽑기) */
  dice: () => (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="#fff" stroke={O} strokeWidth={W} />
      {[
        [8, 8],
        [16, 8],
        [12, 12],
        [8, 16],
        [16, 16],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="1.5" fill="#e53935" />
      ))}
    </>
  ),
  /** 지우기 (빗자루) */
  broom: () => (
    <>
      <path d="M19 3 L12.5 11.5" stroke={O} strokeWidth={3.4} strokeLinecap="round" />
      <path d="M19 3 L12.5 11.5" stroke="#a1887f" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M10 10 L15 14 L11 21 C8 21 5 19.5 3 17 Z" fill="#ffd54f" stroke={O} strokeWidth={W} strokeLinejoin="round" />
      <path d="M7 16 L10.5 18.5 M5.5 14.5 L9 17.5" stroke="#f9a825" strokeWidth={1.1} />
    </>
  ),
  /** 그림 */
  picture: () => (
    <>
      <rect x="2.5" y="4" width="19" height="16" rx="2" fill="#e3f2fd" stroke={O} strokeWidth={W} />
      <path d="M4 18 L9.5 11.5 L13 15 L15.5 12.5 L20 18 Z" fill="#81c784" stroke={O} strokeWidth={1.2} strokeLinejoin="round" />
      <circle cx="16.5" cy="8.5" r="1.8" fill="#ffca28" stroke={O} strokeWidth={1} />
    </>
  ),
  /** 곡 넘기기 */
  notes: () => (
    <>
      <path d="M7 17 V6 L18 4 V15" fill="none" stroke={O} strokeWidth={2.4} />
      <ellipse cx="5" cy="17" rx="2.6" ry="2.1" fill="#ff80ab" stroke={O} strokeWidth={1.4} />
      <ellipse cx="16" cy="15" rx="2.6" ry="2.1" fill="#80d8ff" stroke={O} strokeWidth={1.4} />
    </>
  ),
  /** 시험 (시험관) */
  test: () => (
    <>
      <path d="M9 2.5 H15 M10 2.5 V18 a2 2 0 0 0 4 0 V2.5" fill="#fff" stroke={O} strokeWidth={W} strokeLinecap="round" />
      <path d="M10 12 H14 V18 a2 2 0 0 1-4 0 Z" fill="#ba68c8" stroke={O} strokeWidth={1.2} />
    </>
  ),
} satisfies Record<string, Draw>

export type IconName = keyof typeof ICONS
export const ICON_NAMES = Object.keys(ICONS) as IconName[]

export function Icon({ name, size = '1.15em', className = '', title }: { name: IconName; size?: number | string; className?: string; title?: string }) {
  return (
    <svg className={`icon ${className}`} viewBox="0 0 24 24" width={size} height={size} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {ICONS[name]()}
    </svg>
  )
}

/** 슬라임 능력 표시: 능력 색 동그라미 + 흰 기호 (도감·배치·자세히 창 공통, 2026-11-28) */
export function MonAbIcon({ kind, size = 18 }: { kind: MonsterAbilityKind; size?: number }) {
  return (
    <span className="mon-ab-icon" style={{ width: size, height: size, fontSize: size * 0.6, background: MON_AB_COLOR[kind] }} title={MONSTER_ABILITIES[kind].name}>
      {MONSTER_ABILITIES[kind].icon}
    </span>
  )
}

/** 뒤로 가는 버튼 (2026-11-28): "‹ 설정" 같은 알약 버튼 — 화면 곳곳의 뒤로 가기는 모두 이 모양 */
export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="back-btn" onClick={onClick}>
      <Icon name="back" size="1em" />
      {label}
    </button>
  )
}
