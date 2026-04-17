# TODO

`docs/` 문서를 기준으로 한 MVP 개발 체크리스트다.  
소스 오브 트루스는 `docs/`이며, 아래 항목은 구현 전에 이미 고정된 계약으로 간주한다.

## 0. 문서 기준선 고정

- [ ] `docs/RULE.md` 기준 확인: `docs/` 내부 문서는 수정하지 않고 개발 판단의 최우선 기준으로 사용한다.
- [ ] `docs/MVP.md` 기준 확인: Must-Have만 구현하고 Won't-Have는 범위에서 제외한다.
- [ ] `docs/function.md` 기준 확인: 라우팅은 LLM 기반 맞춤 답변자 선택 계약을 그대로 따른다.
- [ ] 제품 핵심 정의를 명확히 고정한다.
  - 익명 고민 공유 플랫폼
  - 모바일 iOS/Android 배포
  - 공개 게시판 없음
  - 게시자/답변자 역할은 사용자마다 고정되지 않고 상황에 따라 전환됨
- [ ] 명시적 비개발 범위를 고정한다.
  - 랭킹 등 게임화 기능 제외
  - AI 대화형 초기 프로파일링 제외
  - 보관소/아카이브 제외
  - 캡처 방지 기능 제외
  - 인증된 답변자 제도 제외
  - 1~5 평점 기능 제외
  - 시간 경과에 따른 추가 3명 재배정 기능 제외

## 1. 구현 전 고정된 MVP 결정

- [x] 앱 레벨 사용자 테이블은 `profiles`로 고정하고 `profiles.id = auth.users.id` 1:1 관계를 사용한다.
- [x] `profiles`는 사람 사용자 전용으로만 사용하고 예제 고민 작성자는 `profiles`에 넣지 않는다.
- [ ] 익명 로그인 후 앱 삭제/재설치 시 동일 익명 신원 복구는 MVP 범위 밖으로 명시한다.
- [ ] 첫 실행 온보딩 수집 항목은 `성별 + 관심분야(복수 선택)`로 고정한다.
- [ ] 성별은 `onboarding_completed = true`가 되는 시점에 필수값이며, MVP에서는 일반 클라이언트가 직접 수정하지 않도록 고정한다.
- [ ] 하단 네비게이션은 `Inbox / Post concern / Notifications / Profile` 4개로 고정한다.
- [ ] `My concerns`는 별도 탭이 아니라 `Post concern` 내부 중첩 화면으로 고정한다.
- [ ] 앱 첫 화면은 항상 `Inbox(내게 전달된 고민 목록)`로 고정한다.
- [ ] 실사용자 고민은 적격 답변자가 3명 이상 있으면 정확히 3명에게 전달한다.
- [ ] 적격 답변자가 1명 또는 2명이면 전원에게 전달한다.
- [ ] 적격 답변자가 0명이면 그때만 no-delivery를 허용한다.
- [ ] 예제 고민은 실제 사용자 고민처럼 보이게 표시하되 내부적으로 `example`로 태깅한다.
- [ ] 예제 고민은 답변만 가능하고 좋아요/후기/푸시/solved-count/기본 분석 대상에서 제외한다.
- [x] `response_feedback`는 `liked`와 `comment_body`를 같은 행에 저장한다.
- [x] `notifications` 읽음 상태는 enum이 아니라 `read_at nullable`로 처리한다.
- [x] 차단된 원문과 raw moderation payload는 일반 제품 테이블이 아니라 관리자 전용 moderation audit 저장소에만 보관한다.
- [ ] solved-count는 저장형 카운터가 아니라 실사용자 고민의 실제 positive feedback으로부터 파생 계산한다.

## 2. 기술 기반과 저장소 구조 세팅

- [ ] MVP 기술 스택을 문서 기준으로 확정한다.
  - 모바일: Expo + React Native + TypeScript
  - 라우팅: Expo Router
  - 서버 상태: TanStack Query
  - 폼/검증: React Hook Form + Zod
  - 백엔드: Supabase
  - DB/RLS: PostgreSQL + SQL migrations + RLS
  - 서버 로직: Supabase Edge Functions(TypeScript)
  - LLM: OpenAI Moderation API + Responses API
  - 푸시: Expo Notifications + Expo Push Service
  - 배포: EAS Build / EAS Submit
- [ ] 저장소 기본 구조를 만든다.
  - Expo 앱 디렉터리
  - Supabase 설정 디렉터리
  - SQL migration 디렉터리
  - Edge Function 디렉터리
  - 공통 타입/상수/스키마 디렉터리
- [ ] 환경 변수 정책을 고정한다.
  - Supabase URL / anon key
  - Supabase service role key
  - OpenAI API key
  - Expo push 관련 설정값
- [ ] 앱 전역 기본기를 세팅한다.
  - TypeScript 설정
  - QueryClient 초기화
  - Supabase 클라이언트 초기화
  - 폼/검증 유틸 초기화
  - 인증 세션 부트스트랩

## 3. 데이터 모델과 스키마 계약 확정

- [ ] `profiles` 스키마를 확정한다.
  - `id`는 `auth.users.id`와 동일한 PK/FK
  - `gender`는 `onboarding_completed = true`일 때 필수
  - `onboarding_completed`는 필수 boolean이며 서버 소유 상태로 관리
  - `is_active` / `is_blocked` 등 라우팅 적격성 판단 필드 포함
- [x] 관심분야 저장 전략을 확정한다.
  - 관심분야 enum 또는 참조 테이블
  - 사용자-관심분야 연결 구조
- [x] `concerns` 스키마를 확정한다.
  - 승인된 사용자 표시용 고민만 저장
  - `source_type = real | example`
  - `real` 고민은 `author_profile_id` 필수
  - `example` 고민은 `author_profile_id` 없이 `example_key` 또는 동등한 시스템 식별자 사용
  - `concerns.status` 같은 범용 catch-all 상태 필드는 도입하지 않는다
- [x] `concern_deliveries` 스키마를 확정한다.
  - `concern_id`
  - `recipient_profile_id`
  - `status = assigned | opened | responded`
  - `delivered_at`
  - `opened_at`
  - `responded_at`
  - `author_profile_id`는 중복 저장하지 않는다
- [x] `responses` 스키마를 확정한다.
  - `delivery_id` FK
  - 답변 본문
  - 생성 시각
  - 답변자는 `delivery_id -> concern_deliveries`로 추적한다
- [x] `response_feedback` 스키마를 확정한다.
  - `response_id`
  - `concern_author_profile_id`
  - `liked boolean`
  - `comment_body nullable`
  - 생성/수정 시각
- [x] `push_tokens` 스키마를 확정한다.
  - `profile_id`
  - Expo push token
  - platform
  - updated_at
- [x] `notifications` 스키마를 확정한다.
  - `profile_id`
  - `type = concern_delivered | response_received | response_liked | response_commented`
  - 관련 엔티티 id
  - `read_at nullable`
  - created_at

## 4. DB 제약조건과 정합성 규칙 확정

- [x] 다음 제약조건을 DB 레벨에서 강제한다.
  - `UNIQUE (concern_id, recipient_profile_id)` on `concern_deliveries`
  - `UNIQUE (delivery_id)` on `responses`
  - `UNIQUE (response_id, concern_author_profile_id)` on `response_feedback`
- [x] `concerns`에 source type별 check constraint를 둔다.
  - `real`이면 `author_profile_id` 필수, `example_key` 비어 있음
  - `example`이면 `author_profile_id` 비어 있음, `example_key` 필수
- [ ] 자기 자신의 고민을 자기에게 전달하는 self-delivery를 금지한다.
  - 서버 insert 로직에서 차단
  - DB guard/trigger 또는 동등한 검증으로 최종 차단
- [x] 동일 고민에 이미 배정된 사용자 재배정을 금지한다.
- [ ] 동일 고민에 이미 답변한 사용자의 재선정을 금지한다.
- [x] 예제 고민에 대한 feedback row 생성을 금지한다.

## 5. Moderation audit 저장소 분리

- [x] 관리자 전용 moderation audit 저장소를 별도 테이블/경로로 만든다.
- [x] moderation audit 저장소에 다음 필드를 둔다.
  - subject type
  - actor/profile reference
  - raw submitted text
  - blocked boolean
  - category summary
  - raw provider payload
  - checked_at
  - approved entity link nullable
- [ ] 차단된 고민/답변/후기 코멘트는 제품 테이블에 저장하지 않고 audit 저장소에만 남긴다.
- [ ] 승인된 고민/답변/후기 코멘트는 제품 테이블에 저장하고 audit에는 연결 정보만 남긴다.
- [ ] moderation audit 저장소에 대한 일반 클라이언트 RLS 차단은 구현하고, 전용 서버 쓰기 경로 분리는 후속 단계에서 완료한다.

## 6. 익명 인증과 온보딩 구현

- [ ] Supabase anonymous auth 흐름을 연결한다.
- [ ] 첫 세션 생성 시 `profiles`를 함께 생성한다.
- [ ] 온보딩 화면에서 `성별 + 관심분야(복수 선택)`를 수집한다.
- [ ] 필수값 미입력 시 온보딩 완료를 허용하지 않는다.
- [ ] 온보딩 완료 후 `Inbox`로 이동시킨다.
- [ ] 앱 재실행 시 온보딩 완료 여부를 보고 진입 경로를 결정한다.
- [ ] 프로필 화면에서는 관심분야만 수정 가능하게 하고 성별 수정은 막는다.

## 7. 정보 구조와 화면 골격 구현

- [ ] `Inbox` 탭을 구현한다.
  - 내게 전달된 실제 고민 목록
  - 실제 고민이 충분하지 않을 때 예제 고민 노출
- [ ] `Post concern` 탭을 구현한다.
  - 고민 작성 화면
  - `My concerns` 중첩 화면
- [ ] `Notifications` 탭을 구현한다.
- [ ] `Profile` 탭을 구현한다.
- [ ] 예제 고민은 UI상 실제 사용자 고민처럼 보이게 처리하고 별도 시각 분리 라벨은 넣지 않는다.

## 8. 실사용자 고민 게시와 라우팅 계약 구현

- [ ] 고민 작성 화면을 구현한다.
  - 고민 본문 입력
  - 기본 길이/필수값 검증
  - 전송 버튼 상태 제어
- [ ] 고민 제출 서버 API를 구현한다.
  - raw 입력 수신
  - moderation 실행
  - 차단 시 audit만 남기고 제품 row 생성 금지
  - 승인 시 `concerns` row 생성
- [ ] 부적절한 고민 차단 UX를 문서 기준으로 맞춘다.
  - 경고 문구: `부적절한 표현이 감지되었습니다.`
  - `확인` 버튼 제공
  - 작성 중이던 본문 유지
  - 수정 후 재전송 가능
- [ ] 서버 라우팅 eligibility filter를 구현한다.
  - 작성자 제외
  - 온보딩 완료 사용자만 포함
  - 성별/관심분야 등 필수 routing attribute가 있는 사용자만 포함
  - blocked/inactive 사용자 제외
  - 동일 고민에 이미 배정된 사용자 제외
  - 동일 고민에 이미 답변한 사용자 제외
- [ ] 라우팅 대상 수를 서버에서 먼저 계산한다.
  - 적격 풀이 3명 이상이면 required delivery count = 3
  - 적격 풀이 1명 또는 2명이면 required delivery count = 적격 인원 수
  - 적격 풀이 0명이면 no-delivery
- [ ] OpenAI 라우팅 입력 계약을 그대로 구현한다.
  - 고민 게시자 입력: 성별, 관심분야, 고민 본문
  - 후보 답변자 입력: 성별, 관심분야, 모든 과거 고민 게시 내용, 모든 과거 고민 답변 내용
  - 프로토타입 단계에서는 각 후보자의 모든 과거 인앱 기록을 LLM 입력 대상에 포함한다
- [ ] OpenAI의 책임을 명확히 구현한다.
  - 적격 후보 풀 내부에서 semantic ranking/selection 수행
  - 최적 답변자가 없으면 차선 답변자를 선택
  - 적격 후보가 존재하는데 `no match`를 반환하는 동작 금지
  - eligibility/access control 규칙 override 금지
- [ ] OpenAI 출력 계약을 schema-validated structured output으로 고정한다.
  - 정확히 필요한 개수만큼의 ordered `responder_profile_ids` 배열 반환
  - 적격 풀이 3명 이상이면 top-3 profile id 정확히 3개 반환
  - 적격 풀이 1명 또는 2명이면 해당 전체 profile id만 반환
  - 필요한 개수보다 많은 후보 반환 금지
  - 서버가 ad hoc parsing 없이 바로 `concern_deliveries`를 생성할 수 있게 JSON schema 검증 사용
- [ ] 서버 책임을 명확히 구현한다.
  - 적격 후보 풀 정의
  - required delivery count 계산
  - OpenAI 호출
  - OpenAI가 반환한 ordered responder id 그대로 delivery 생성
  - 3명 이상 적격 후보가 있었을 때 서버가 임의 랭킹으로 남은 슬롯을 채우는 동작 금지
  - OpenAI가 고른 답변자와 서버가 임의 선택한 답변자를 섞는 동작 금지
- [ ] 실제 고민이 라우팅된 경우에만 해당 답변자들에게 푸시 알림과 앱 알림을 생성한다.

## 9. Inbox, 상세, 답변 작성 흐름 구현

- [ ] `Inbox`에서 `concern_deliveries` 기반 목록 조회를 구현한다.
- [ ] 고민 상세 화면을 구현한다.
- [ ] 답변 작성 폼을 구현한다.
- [ ] 답변 제출 API를 구현한다.
  - moderation 실행
  - 차단 시 audit만 남기고 제품 row 생성 금지
  - 승인 시 `responses` 생성
  - 대응 `concern_deliveries.status`를 `responded`로 변경
- [ ] 부적절한 답변 차단 UX를 문서 기준으로 맞춘다.
  - 경고 문구 표시
  - 기존 작성 내용 유지
  - 수정 후 재전송 가능
- [ ] 실사용자 고민에 대한 답변 완료 시 게시자에게 알림을 생성하고 푸시를 보낸다.
- [ ] 예제 고민에 대한 답변 완료 시 푸시/알림을 생성하지 않는다.

## 10. My concerns와 답변 확인 흐름 구현

- [ ] `Post concern` 내부에 `My concerns` 목록을 구현한다.
- [ ] 내가 작성한 실제 고민의 상세 화면을 구현한다.
- [ ] 내 고민에 달린 답변 목록/상세 화면을 구현한다.
- [ ] 알림에서 해당 고민/답변 상세로 진입할 수 있게 한다.

## 11. 좋아요 및 후기(comment) 구현

- [x] 실사용자 고민의 작성자만 해당 답변에 feedback를 남길 수 있게 한다.
- [x] feedback 입력/저장 규칙을 구현한다.
  - `liked`는 boolean
  - `comment_body`는 nullable
  - 한 답변당 한 작성자 row만 허용
- [ ] 후기(comment) moderation을 구현한다.
  - 차단 시 comment 원문은 audit 저장소에만 남긴다
  - 승인 시 `response_feedback.comment_body` 저장
- [ ] 부적절한 후기 차단 UX를 문서 기준으로 맞춘다.
  - 경고 문구 표시
  - 작성 내용 유지
  - 수정 후 재시도 가능
- [ ] 좋아요/후기 등록 시 답변자에게 알림을 보낸다.
- [ ] 예제 고민에는 feedback UI와 feedback API를 열지 않는다.
- [ ] solved-count는 `real concern + positive feedback`만 집계하도록 구현한다.

## 12. 예제 고민 공급 흐름 구현

- [ ] 예제 고민 seed 데이터를 준비한다.
- [ ] 예제 고민을 `concerns.source_type = example`로 저장한다.
- [ ] 예제 고민은 실제 사용자 고민처럼 보이게 `Inbox`에서 노출한다.
- [ ] 예제 고민은 실사용자 고민 라우팅의 fallback branch로 사용하지 않는다.
- [ ] 실제 고민의 적격 풀이 비어 있어 no-delivery가 발생해도, 이는 별도의 routing 결과로 유지하고 예제 고민 공급과 혼동하지 않는다.
- [ ] 예제 고민은 push/feedback/solved-count/기본 분석 대상에서 제외한다.

## 13. 알림 시스템 구현

- [ ] Expo Notifications 권한 요청 및 토큰 등록 흐름을 구현한다.
- [x] 사용자는 자신의 push token만 등록/수정할 수 있게 한다.
- [ ] 앱 알림 타입을 구현한다.
  - `concern_delivered`
  - `response_received`
  - `response_liked`
  - `response_commented`
- [x] 알림 읽음 처리는 `read_at` 갱신으로 구현한다.
- [ ] 예제 고민 관련 알림은 만들지 않는다.

## 14. RLS 정책과 서버 접근 규칙 구현

- [ ] `profiles`는 본인만 조회 가능하게 하고, 일반 클라이언트의 직접 수정은 허용하지 않으며 보호된 프로필 쓰기는 서버 소유 경로로 처리한다.
- [x] 실사용자 고민은 작성자만 자신의 고민을 조회 가능하게 한다.
- [x] `concern_deliveries`는 배정된 recipient만 조회 가능하게 한다.
- [x] 답변 생성은 해당 delivery의 recipient만 가능하게 한다.
- [x] 내 고민에 대한 답변 조회는 해당 고민 작성자만 가능하게 한다.
- [x] feedback 생성은 해당 실사용자 고민 작성자만 가능하게 한다.
- [x] 예제 고민에 대한 feedback 생성은 정책 차원에서 막는다.
- [x] `push_tokens`는 본인만 관리 가능하게 한다.
- [x] moderation audit 저장소는 일반 사용자에게 완전히 차단한다.
- [ ] 가능하면 읽기/쓰기 경로를 Edge Function 중심으로 고정해 정책 우회를 줄인다.

## 15. DB 레벨 vs 서버 레벨 vs 앱 레벨 책임 분리

- [x] DB 레벨에서 반드시 강제할 항목을 구현한다.
  - PK/FK/UNIQUE/check constraint
  - source type 무결성
  - delivery/response/feedback 중복 방지
  - self-delivery 최종 차단
- [ ] 서버 레벨에서 반드시 강제할 항목을 구현한다.
  - eligibility filter
  - required delivery count 계산
  - OpenAI 입력 조립
  - structured output 검증
  - delivery row 생성
  - moderation audit 기록
  - solved-count 계산 query
- [ ] 앱 레벨에서는 UX만 담당하게 한다.
  - 필수값/길이 검증
  - 경고 모달 표시
  - 본문 유지
  - 탭 구조와 화면 전환

## 16. 테스트와 수용 기준

- [ ] migration 테스트를 작성한다.
  - source type check constraint 동작 확인
  - delivery/response/feedback uniqueness 확인
  - notification `read_at` 동작 확인
- [ ] RLS/policy 테스트를 작성한다.
  - 고민 작성자가 자신의 고민만 읽을 수 있음
  - recipient가 자신에게 전달된 고민만 읽을 수 있음
  - recipient만 해당 delivery에 답변 생성 가능
  - 고민 작성자만 자신의 고민 답변을 읽을 수 있음
  - 고민 작성자만 해당 답변에 feedback 생성 가능
  - 예제 고민 feedback 생성 차단
  - push token self-only 관리
  - moderation audit 일반 접근 차단
- [ ] 라우팅 테스트를 작성한다.
  - 적격 풀이 3명 이상이면 정확히 3명 반환
  - 적격 풀이 1명 또는 2명이면 적격자 전원을 반환
  - 적격 풀이 0명이면 그때만 no-delivery
  - OpenAI가 top-3 ordered responder id를 정확히 반환
  - OpenAI structured output이 schema와 정확히 일치
  - 서버가 OpenAI 결과를 임의 보충/혼합하지 않음
  - 이미 배정된 사용자 재선정 금지
  - 이미 답변한 사용자 재선정 금지
  - blocked/inactive/non-onboarded 사용자 제외
  - OpenAI 입력에 후보자별 모든 과거 고민 게시/답변 기록이 포함됨
  - 적격 후보가 있는데 OpenAI가 `no match`를 반환하는 경로가 없음
  - 예제 고민이 routable real concern의 fallback branch로 사용되지 않음
- [ ] moderation 테스트를 작성한다.
  - 차단된 고민/답변/후기 코멘트가 audit 저장소에만 기록됨
  - 승인된 콘텐츠만 제품 테이블에 생성됨
- [ ] 예제 고민 테스트를 작성한다.
  - 예제 고민은 실제 사용자 고민처럼 보이게 노출됨
  - 예제 고민 답변은 가능
  - 예제 고민은 push 없음
  - 예제 고민은 feedback 없음
  - 예제 고민은 solved-count/기본 분석 제외
- [ ] 실제 사용자 플로우 E2E 시나리오를 검증한다.
  - 앱 설치
  - 익명 로그인
  - 성별/관심분야 온보딩
  - 고민 작성
  - 3명 라우팅 또는 적격자 전원 라우팅
  - 답변 작성
  - 좋아요/후기

## 17. 로깅, 운영, 배포 준비

- [ ] MVP 수준의 최소 이벤트 로깅을 추가한다.
  - 온보딩 완료
  - 고민 작성 시도/승인/차단
  - 라우팅 적격 인원 수
  - 라우팅 선택 결과
  - 답변 작성 시도/승인/차단
  - 좋아요/후기 제출
  - 푸시 전송 성공/실패
- [ ] 기본 분석에서 example concern 이벤트를 분리 태깅한다.
- [ ] 운영자가 moderation 결과를 audit 저장소 기준으로 확인할 수 있게 한다.
- [ ] 환경 변수와 시크릿을 배포 환경 기준으로 정리한다.
- [ ] Supabase migrations/Edge Functions 배포 절차를 정리한다.
- [ ] EAS build 설정을 완료한다.
- [ ] 실제 빌드 환경에서 푸시 알림을 검증한다.

## 18. 최종 범위 점검

- [ ] 아래 항목이 몰래 추가되지 않았는지 최종 확인한다.
  - 공개 피드
  - 실시간 채팅/웹소켓
  - 복잡한 추천 시스템 별도 도입
  - 별도 Python 백엔드
  - 과도한 관리자 대시보드
  - 과도한 관측/인프라 구성
- [ ] 라우팅 계약에 모순되는 문구가 남아 있지 않은지 최종 확인한다.
  - recipient count 미정 표현 금지
  - LLM routing assist 표현 금지
  - recent N / summary-only 표현 금지
  - 적격 후보가 있는데 no-delivery 표현 금지
  - example concern을 real concern routing fallback으로 보는 표현 금지
- [ ] 구현된 기능이 Must-Have에 모두 대응하는지 대조표로 확인한다.
