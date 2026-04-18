export type MyConcernResponseListItem = {
  responseId: string;
  body: string;
  createdAt: string;
};

export type MyConcernResponseDetail = MyConcernResponseListItem & {
  concernId: string;
};

export type MyConcernResponseFeedback = {
  responseId: string;
  liked: boolean;
  commentBody: string | null;
};

export type MyConcernResponseFeedbackBaseline = {
  feedbackExists: boolean;
  liked: boolean;
  commentBody: string | null;
};

export type MyConcernResponseFeedbackDraft = {
  liked: boolean;
  commentBody: string | null;
};

export type MyConcernResponseScreenState = {
  displayDetail: MyConcernResponseDetail;
  feedbackBaseline: MyConcernResponseFeedbackBaseline;
  feedbackDraft: MyConcernResponseFeedbackDraft;
};
