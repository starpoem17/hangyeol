import { compareInboxDeliveries } from "./mappers";
import type { InboxDeliveryDetail, InboxDeliveryListItem } from "./types";

export const MINIMUM_VISIBLE_INBOX_ITEMS = 3;

export function selectVisibleInboxDeliveries(
  items: InboxDeliveryListItem[],
  minimumVisibleCount = MINIMUM_VISIBLE_INBOX_ITEMS,
) {
  const sortedItems = [...items].sort(compareInboxDeliveries);
  const realItems = sortedItems.filter((item) => item.concern.sourceType === "real");
  const exampleItems = sortedItems.filter((item) => item.concern.sourceType === "example");
  const visibleExampleCount = Math.max(minimumVisibleCount - realItems.length, 0);

  return [...realItems, ...exampleItems.slice(0, visibleExampleCount)];
}

export function shouldLoadInboxFeedback(delivery: Pick<InboxDeliveryDetail, "concern"> | null) {
  return delivery?.concern.sourceType === "real";
}
