import type { MyConcernDetail, MyConcernListItem } from "./types";

type MyConcernRow = {
  id: string;
  body: string;
  created_at: string;
};

function mapMyConcern(row: MyConcernRow): MyConcernDetail {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function mapMyConcernListItem(row: MyConcernRow): MyConcernListItem {
  return mapMyConcern(row);
}

export function mapMyConcernDetail(row: MyConcernRow): MyConcernDetail {
  return mapMyConcern(row);
}

export function compareMyConcernListItems(left: MyConcernListItem, right: MyConcernListItem) {
  const createdAtDelta = right.createdAt.localeCompare(left.createdAt);

  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return right.id.localeCompare(left.id);
}
