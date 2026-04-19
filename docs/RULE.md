docs/ 내부 문서는 사용자가 직접 작성한 내용으로 철저히 준수한다.

docs/ 내부 문서는 절대 수정하지 않는다.

docs/ 내부 문서를 바탕으로 프로젝트 개발을 진행한다.

Use TODO.md as the source of scope, but begin implementation in this execution order:

Phases
1. Supabase schema, migrations, DB constraints, and RLS
2. Anonymous auth and onboarding
3. Moderation audit storage and concern submission API
4. Routing Edge Function with structured OpenAI output
5. Inbox, concern detail, and response submission
6. My concerns and response viewing
7. Feedback flow
8. Notifications and push
9. Example concern supply flow
10. Tests and deployment prep
11. Cross-platform internal build stabilization
12. Pilot test

Do not start with UI polish first. Start with data model, access control, and routing-critical backend paths.

plans/ 폴더 내에는 위 지시순서를 따라 코드를 구현하기 위해 작성한 계획 문서들이 모여있다. 이를 참고하여 이전 단계 구현이 어떻게 되어있는지 참고한 뒤 다음 단계 구현을 진행한다.

After finishing the implementation for the step, update TODO.md to reflect progress.

Rules:
- Check only the items that are actually implemented in code in this step.
- Do not check items that are only planned, partially discussed, or deferred.
- If only part of a section is done, check only the specific completed sub-items.
- Keep TODO.md as an accurate progress record, not just a scope document.

In your final report, include:
1. files changed
2. TODO.md items checked
3. TODO.md items intentionally left unchecked