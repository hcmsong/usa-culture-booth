// 미국 문화 퀴즈 부스 — 설정
// 아내 결정(기획서 §3.1)이 바뀌면 이 파일의 값만 고친다.
// VERSION을 바꾸면 sw.js의 VERSION도 같은 값으로 바꾼다(tools/check.mjs가 검사).
self.QUIZ_CONFIG = {
  VERSION: 'v2',
  TITLE: '미국 퀴즈 도전!',
  QUESTIONS_PER_ROUND: 10,

  // 결정 ①: 'choose' = 아이가 학년 버튼으로 고름 / 'common' = 학년 구분 없이 저학년 문제 묶음
  GRADE_MODE: 'choose',
  // 결정 ④: true = 문제 묶음에서 매번 10문제 무작위 + 보기 섞기 / false = 기본 10문항 고정(보기 순서만 섞기)
  RANDOM: true,
  // 결정 ⑤: 틀렸을 때 정답 보여 주기
  SHOW_ANSWER_ON_WRONG: true,
  // 결정 ⑦: 한 판에 핼러윈 문항 최대 수(1 또는 2)
  HALLOWEEN_MAX: 2,
  // 결정 ⑧: 영어 보기 뒤 괄호 한글 표시 — v2 아내 문항(Q32·Q33·Q35·Q40)은 괄호가 뜻·이름이라 false로 바꾸지 말 것(영어만 남아 저학년이 못 읽음)
  SHOW_HANGUL_SOUND: true,
  // 결정 ②·③(사용자 10/20 확정): 만점만 뽑기권, 참여 선물 없음, 못 맞히면 줄 맨 뒤에서 다시 도전
  PARTICIPATION_MESSAGE: '',                    // '' = 표시 안 함
  RETRY_MESSAGE: '다시 도전하려면 줄 맨 뒤에 서 주세요. 문제가 새로 섞여 나와요!',
  // 시작·만점 화면 문구(결정 ③ 1인 1장)
  START_LEAD: '10문제를 모두 맞히면 <b>뽑기권!</b>',   // HTML 허용(<b>는 빨간 강조)
  WIN_SUB: '🎟️ 뽑기권을 받아요!',
  WIN_NOTE: '뽑기권은 한 사람에 1장이에요',          // '' = 표시 안 함

  // 출제 규칙(기획서 §6.4)
  MAX_OVERLAP_WITH_PREV: 5,   // 같은 기기 직전 판과 겹치는 문항 상한
  DRAW_ATTEMPTS: 200,         // 조건을 맞출 때까지 다시 뽑는 횟수(넘으면 기본 세트)

  // 시간(밀리초)
  FEEDBACK_MS: 4000,          // 정답/오답 화면 → 다음 문제 자동
  TAP_ADVANCE_AFTER_MS: 500,  // 정답/오답 화면에서 이 시간 뒤부터 탭하면 바로 다음
  INPUT_GUARD_MS: 500,        // 화면이 바뀐 뒤 입력 무시
  IDLE_RESET_MS: 90000,       // 문제·정답 화면에서 무입력 → 처음으로
  GRADE_IDLE_MS: 30000,       // 학년 선택 화면에서 무입력 → 처음으로
  RESULT_AUTO_MS: 12000,      // 만점 미만 화면 → 처음으로 자동
  RESULT_BUTTON_AFTER_MS: 2000,
  PERFECT_RELEASE_HOLD_MS: 2000, // 만점 화면 «직원 확인» 길게 누르기
  STAFF_HOLD_MS: 3000,        // 기기 번호 배지 길게 누르기 → PIN
  STAFF_MENU_IDLE_MS: 180000,

  STAFF_PIN: '0784',          // 직원 메뉴 PIN — 배포 직전에 바꾸고 당일 도우미에게 말로만 공유(공개 사이트에서 보이므로 보안 장치 아님)

  SOUND: true,                // 효과음 기본값(직원 메뉴에서 켜고 끌 수 있음)
  SOUND_VOLUME: 0.25,
  TTS: false,                 // 🔊 읽어 주기 버튼(학교 iPad에서 한국어 음성 확인 뒤 켬)

  // 오프라인 저장 대상(sw.js의 ASSETS와 같아야 함)
  ASSETS: [
    './',
    './index.html',
    './style.css',
    './config.js',
    './questions.js',
    './core.js',
    './app.js',
    './manifest.webmanifest',
    './icon-180.png',
    './icon-192.png',
    './icon-512.png',
  ],
};
