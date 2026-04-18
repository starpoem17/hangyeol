import type { MyConcernResponseDetail, MyConcernResponseFeedback, MyConcernResponseListItem } from "./types";

type MyConcernResponseListRow = {
  response_id: string;
  body: string;
  created_at: string;
};

type MyConcernResponseDetailRow = MyConcernResponseListRow & {
  concern_id: string;
};

type MyConcernResponseFeedbackRow = {
  response_id: string;
  liked: boolean;
  comment_body: string | null;
};

export function mapMyConcernResponseListItem(row: MyConcernResponseListRow): MyConcernResponseListItem {
  return {
    responseId: row.response_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function mapMyConcernResponseDetail(row: MyConcernResponseDetailRow): MyConcernResponseDetail {
  return {
    responseId: row.response_id,
    concernId: row.concern_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function mapMyConcernResponseFeedback(row: MyConcernResponseFeedbackRow): MyConcernResponseFeedback {
  return {
    responseId: row.response_id,
    liked: row.liked,
    commentBody: row.comment_body,
  };
}

export function compareMyConcernResponses(left: MyConcernResponseListItem, right: MyConcernResponseListItem) {
  const createdAtDelta = right.createdAt.localeCompare(left.createdAt);

  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return right.responseId.localeCompare(left.responseId);
}
