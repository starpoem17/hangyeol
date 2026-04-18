export type MyConcernResponseListItem = {
  responseId: string;
  body: string;
  createdAt: string;
};

export type MyConcernResponseDetail = MyConcernResponseListItem & {
  concernId: string;
};
