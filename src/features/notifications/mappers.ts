import type { NotificationListItem } from "./types";

type NotificationRow = {
  id: string;
  type: NotificationListItem["type"];
  related_entity_type: NotificationListItem["relatedEntityType"];
  related_entity_id: string;
  read_at: string | null;
  created_at: string;
};

export function mapNotificationListItem(row: NotificationRow): NotificationListItem {
  return {
    id: row.id,
    type: row.type,
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function compareNotifications(left: NotificationListItem, right: NotificationListItem) {
  const createdAtDelta = right.createdAt.localeCompare(left.createdAt);

  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return right.id.localeCompare(left.id);
}
