# Minimal List-Only Fix For Example Delivery-Order Leak

## Defect Classification

This is a confirmed inbox-facing semantic leak that already affects list behavior indirectly.

Current code-path proof:

- supabase/migrations/20260419140000_phase9_example_concern_supply.sql:122 stores example routing_order as a historical reuse count.
- src/features/inbox/mappers.ts:64 exposes that stored value to the inbox list model as routingOrder.
- src/features/inbox/mappers.ts:100 uses routingOrder in the list comparator.
- src/features/inbox/display.ts:10 sorts list items with that comparator before picking which example items appear.

So the raw historical example count is already affecting inbox list behavior, even though:

- app/inbox/index.tsx:146 does not print order text
- app/inbox/[deliveryId].tsx:282 does not use delivery-order semantics

## Precise Post-Fix Ordering Contract

### Requirement classification

The required behavior is:

- raw historical example routingOrder must stop affecting inbox-facing list behavior
- the comparator’s existing stable fallback order should otherwise remain unchanged

This is not asking for a new custom example ordering policy. It is asking to remove one invalid ordering signal while preserving the
existing deterministic fallback chain.

### Exact comparator sequence after the fix

For InboxDeliveryListItem, compareInboxDeliveries() must compare in this exact order:

1. status
    - assigned before opened before responded
2. deliveredAt
    - newer deliveries first
3. displayRoutingOrder
    - lower value first
4. id
    - lexical ascending final tie-breaker

Raw routingOrder must be removed from this sequence for list-facing behavior.

### Equal normalized example items

If two or more example list items all normalize to displayRoutingOrder = 1, their relative order must be determined only by the remaining
comparator fields that already exist:

- first by status
- then by deliveredAt
- then by id

If those fields are equal except for raw stored routingOrder, the items must be treated as equivalent for list-order purposes until the
final existing id tie-breaker.

That means:

- differing raw stored example routingOrder values like 4 vs 12 must not change their relative inbox list order
- current deterministic fallback behavior via id must remain intact

## Minimal Display-Layer Contract

After the fix:

- Real list items
    - routingOrder = stored DB routing_order
    - displayRoutingOrder = same value
    - list ordering behavior remains unchanged
- Example list items
    - routingOrder = stored DB routing_order
    - displayRoutingOrder = 1, regardless of stored value
    - inbox list sorting and visible example selection must ignore raw historical example routingOrder

Observable meaning of “selection no longer depends on raw example routingOrder”:

- if two example items differ only by stored raw routingOrder, and have the same status and deliveredAt, the visible inbox result must not
change based on that raw difference
- any deterministic relative order between them must come from the existing final id tie-breaker, not the historical raw count

Invariant for src/features/inbox/display.ts:6:

- because it relies on compareInboxDeliveries(), example items chosen for visible inbox backfill must be insensitive to raw stored example
routingOrder

## Minimal Structural Scope

No broader type-model cleanup.

The smallest safe structural change remains:

- add displayRoutingOrder only to InboxDeliveryListItem
- replace the current InboxDeliveryDetail = InboxDeliveryListItem alias with an explicit detail type so detail does not inherit the list-
only field
- do not introduce a shared base type
- do not add any display-only field to detail behavior

This small alias break is necessary only because otherwise the list-only field would leak into detail.

## Step-By-Step Changes

1. Change src/features/inbox/types.ts:11

- Add displayRoutingOrder: number to InboxDeliveryListItem only.
- Replace export type InboxDeliveryDetail = InboxDeliveryListItem with an explicit InboxDeliveryDetail type containing exactly:
    - id
    - status
    - deliveredAt
    - openedAt
    - respondedAt
    - routingOrder
    - concern

2. Change src/features/inbox/mappers.ts:57

- Keep raw routingOrder: row.routing_order in both list and detail mapping.
- In mapInboxDeliveryListItem() only:
    - real concern: displayRoutingOrder = row.routing_order
    - example concern: displayRoutingOrder = 1
- Keep mapInboxDeliveryDetail() free of displayRoutingOrder.
- Change compareInboxDeliveries() to use this exact order:
    1. status
    2. deliveredAt descending
    3. displayRoutingOrder ascending
    4. id ascending
- Remove raw routingOrder from the comparator sequence entirely.

3. Leave these files untouched

- src/features/inbox/api.ts:11
- src/features/inbox/display.ts:6 structurally unchanged
- app/inbox/index.tsx:146
- app/inbox/[deliveryId].tsx:282
- supabase/migrations/20260419140000_phase9_example_concern_supply.sql:46

## Strict Field Rules

- Raw routingOrder
    - exact stored DB truth
    - allowed in row mapping and truth-preservation tests
    - forbidden in inbox list comparator and visible selection behavior
- displayRoutingOrder
    - owned only by InboxDeliveryListItem
    - allowed only in list mapping and list comparator behavior
    - forbidden in detail models, detail logic, DB/API shapes, and persistence logic

Helper rule:

- src/features/inbox/mappers.ts:100 compareInboxDeliveries() must never read raw routingOrder after the fix

## Tests

### 1. Stored-value preservation tests

Add src/features/inbox/mappers.test.ts:

- real list item preserves raw routingOrder
- example list item with raw routing_order = 12 preserves raw routingOrder === 12
- detail item preserves raw routingOrder
- detail item does not include displayRoutingOrder

These assertions prove DB truth is still carried internally.

### 2. List-model normalization tests

In the same src/features/inbox/mappers.test.ts:

- real list item gets displayRoutingOrder === routingOrder
- example list item with raw routing_order = 4
gets displayRoutingOrder === 1
- example list item with raw routing_order = 12
also gets displayRoutingOrder === 1

These assertions prove normalization is applied only at the list model layer.

### 3. Comparator/display behavior tests

Update src/features/inbox/display.test.ts:6 and keep the ordering scenario deterministic by fixing all earlier comparator fields.

Add a case with:

- same status
- same deliveredAt
- different raw routingOrder
- same normalized displayRoutingOrder
- different id

Concrete deterministic scenario:

- example A:
    - id = "example-a"
    - status = "assigned"
    - deliveredAt = "2026-04-19T10:00:00.000Z"
    - routingOrder = 12
    - displayRoutingOrder = 1
- example B:
    - id = "example-b"
    - status = "assigned"
    - deliveredAt = "2026-04-19T10:00:00.000Z"
    - routingOrder = 4
    - displayRoutingOrder = 1

Assertion:

- their relative order must be determined by id, not raw routingOrder
- therefore example-a sorts before example-b because "example-a" < "example-b", even though 12 > 4

This avoids any dependence on unspecified sort stability.

Also keep existing fill behavior assertions to prove example backfill still works.

### 4. API-level returned list behavior tests

Update src/features/inbox/api.test.ts:35:

- keep raw example fixture orders as 4, 5, 6
- assert returned example list items preserve raw routingOrder
- assert returned example list items expose displayRoutingOrder === 1
- assert returned real list items expose displayRoutingOrder === routingOrder
- keep the current visible ID assertion

Together, the tests must prove both:

- raw stored routing order remains intact internally
- inbox-facing list behavior no longer depends on historical example routing counts

## TODO.md Update

Re-checked:

- docs/RULE.md:1
- TODO.md:254

Exact update location:

- Section ## 12. 예제 고민 공급 흐름 구현
- Immediately under:
    - - [x] 예제 고민은 실제 사용자 고민처럼 보이게 \Inbox`에서 노출한다.`

Exact update form:

- add one indented note line
- no checkbox changes

The note must explicitly record:

- stored example routing_order is preserved internally
- inbox list-facing behavior uses a display-only normalized order instead of stored example order
- repeated example reuse therefore cannot expose historical delivery counts through Inbox list behavior

Reason:

- under docs/RULE.md:1, this is a corrective clarification of an already-completed checked item, not completion of a new unchecked scope
item
