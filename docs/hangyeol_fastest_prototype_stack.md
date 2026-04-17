# Hangyeol Prototype Tech Stack (Fastest Path)

## Goal
Build the fastest testable MVP for both iOS and Android, deploy it quickly, and run early user testing with minimal backend complexity.

This document is intended for a coding agent. It specifies the recommended technology stack, which language should be used for each feature, and which parts should *not* be over-engineered in the first prototype.

---

## 1. Product Direction

This is **not** a real-time social platform or a large-scale chat product.
The first prototype should optimize for:

- fast implementation
- low operational complexity
- easy mobile deployment
- anonymous user onboarding
- push notifications
- server-side LLM moderation / routing
- simple iteration after user testing

The architecture should therefore minimize the number of separate services.

---

## 2. Recommended Stack

### Mobile App
- **Framework:** Expo + React Native
- **Language:** TypeScript
- **Navigation:** Expo Router
- **Server state / data fetching:** TanStack Query
- **Form handling:** React Hook Form + Zod
- **Local storage:** expo-secure-store or AsyncStorage where appropriate
- **Push notifications:** expo-notifications

### Backend / Platform
- **Backend platform:** Supabase
- **Database:** PostgreSQL (managed by Supabase)
- **Authentication:** Supabase Auth with anonymous sign-in
- **Authorization:** Row Level Security (RLS)
- **Server logic:** Supabase Edge Functions
- **Language for server logic:** TypeScript

### AI / LLM
- **Moderation:** OpenAI Moderation API
- **Prompted reasoning / routing logic:** OpenAI Responses API
- **Execution location:** server-side only, inside Supabase Edge Functions

### Deployment
- **Mobile build & release:** EAS Build / EAS Submit
- **Backend deployment:** Supabase managed services

---

## 3. Language Assignment by Feature

This section is the most important instruction for the coding agent.

### A. Mobile UI
- **Language:** TypeScript
- **Where:** Expo / React Native app
- **Includes:**
  - onboarding screens
  - interest selection UI
  - concern writing screen
  - inbox screen for received concerns
  - response writing screen
  - notification screen
  - profile / settings screen

### B. Client-side validation
- **Language:** TypeScript
- **Where:** mobile app
- **Includes:**
  - required field checks
  - basic text length checks
  - form schema validation via Zod

Important: client validation is only for UX. Final moderation and acceptance must happen on the server.

### C. Authentication
- **Language:** TypeScript
- **Where:** mobile app + Supabase
- **Method:** anonymous sign-in via Supabase Auth
- **Purpose:**
  - create a stable internal user identity
  - avoid collecting sensitive personal identity information in MVP

### D. Database schema and access rules
- **Language:** SQL
- **Where:** Supabase
- **Includes:**
  - table definitions
  - indexes
  - foreign keys
  - Row Level Security policies
  - database migrations

### E. Business logic APIs
- **Language:** TypeScript
- **Where:** Supabase Edge Functions
- **Includes:**
  - submit concern
  - moderate concern text
  - select target recipients
  - create delivery records
  - submit response
  - moderate response text
  - register likes / helpful feedback
  - trigger push notifications

### F. LLM calls
- **Language:** TypeScript
- **Where:** Supabase Edge Functions only
- **Includes:**
  - moderation request to OpenAI
  - routing / classification / structured decision prompts

Never call OpenAI directly from the mobile client.

### G. Push notification sending
- **Language:** TypeScript
- **Where:** Supabase Edge Functions
- **Service:** Expo Push Service
- **Includes:**
  - new concern delivered to recipient
  - new response received by author
  - helpful feedback / like received

### H. Analytics / logging (MVP level)
- **Language:** TypeScript + SQL
- **Where:** app + Supabase
- **Includes:**
  - lightweight event logging
  - screen flow tracking
  - submission success/failure
  - moderation rejection counts

Keep analytics minimal in MVP.

---

## 4. Suggested MVP Feature Breakdown

### Phase 1: Core infrastructure
Implement first:

1. Expo app scaffold
2. Supabase project connection
3. anonymous auth
4. basic onboarding
5. DB schema and migrations
6. RLS policies

### Phase 2: Core concern flow
Implement next:

1. create concern
2. moderate concern on server
3. assign recipients
4. recipient inbox
5. push notification for incoming concern

### Phase 3: Response flow
Implement next:

1. write response
2. moderate response on server
3. save response
4. notify original author

### Phase 4: Lightweight feedback loop
Implement next:

1. like / helpful button
2. solved/helpful counters
3. notification for feedback

### Phase 5: User testing support
Implement last for MVP:

1. basic analytics
2. error logging
3. feature flags if needed
4. simple admin visibility for moderation outcomes

---

## 5. What Not to Build in the First Prototype

Do **not** add these unless absolutely required for MVP validation:

- Python backend service
- microservices
- WebSocket real-time architecture
- complicated recommendation models
- custom notification infrastructure beyond Expo Push
- multi-role admin dashboard
- advanced social graph features
- public feed ranking algorithm
- heavy observability stack
- Kubernetes / container orchestration

These are likely to slow down implementation without helping the first user test.

---

## 6. Proposed Database Entities

The coding agent should design an initial schema around the following entities.

- `users`
  - internal user id
  - anonymous auth linkage
  - onboarding attributes
  - selected interests
  - optional profile metadata

- `concerns`
  - author id
  - text body
  - status
  - moderation result
  - created_at

- `concern_deliveries`
  - concern id
  - recipient user id
  - delivery status
  - delivered_at
  - read_at

- `responses`
  - concern id
  - responder id
  - text body
  - moderation result
  - created_at

- `response_feedback`
  - response id
  - concern author id
  - liked/helpful flag
  - created_at

- `push_tokens`
  - user id
  - expo push token
  - platform
  - updated_at

- `notifications`
  - user id
  - type
  - related entity id
  - read status
  - created_at

This schema should remain simple and migration-friendly.

---

## 7. Routing Logic for the Prototype

In MVP, routing should remain simple.
Do not attempt a sophisticated recommender system initially.

Use a lightweight server-side selection strategy such as:

- shared selected interests
- simple demographic compatibility if onboarding collects it
- exclusion of the concern author
- limit repeated assignments to the same recipient
- cap recipient count per concern

If LLM usage is needed, use it conservatively for:

- content safety check
- coarse topic tagging
- optional structured routing assistance

The routing logic should be deterministic where possible.

---

## 8. Coding Agent Instructions

Use the following implementation principles:

1. Prefer the fastest stable implementation over ideal architecture.
2. Keep all mobile code in TypeScript.
3. Keep all server functions in TypeScript.
4. Keep schema, migrations, and policies in SQL.
5. Keep OpenAI calls server-side only.
6. Avoid introducing Python in the first prototype.
7. Optimize for a testable build, not long-term scale.
8. Make every feature easy to replace after user feedback.

---

## 9. Final Recommendation

For the fastest cross-platform prototype, use:

- **TypeScript** for the app
- **TypeScript** for server-side logic
- **SQL** for database schema and policies
- **OpenAI APIs** only from server-side functions
- **Supabase** as the backend platform
- **Expo** for mobile delivery and push integration

This is the fastest path to a deployable iOS/Android MVP with low operational overhead.

