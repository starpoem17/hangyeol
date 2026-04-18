import type {
  MyConcernResponseDetail,
  MyConcernResponseFeedback,
  MyConcernResponseFeedbackBaseline,
  MyConcernResponseFeedbackDraft,
  MyConcernResponseScreenState,
} from "./types";

export function normalizeFeedbackCommentBody(commentBody: string | null | undefined) {
  const normalized = (commentBody ?? "").trim();

  return normalized.length > 0 ? normalized : null;
}

export function createFeedbackBaseline(
  feedback: MyConcernResponseFeedback | null,
): MyConcernResponseFeedbackBaseline {
  if (!feedback) {
    return {
      feedbackExists: false,
      liked: false,
      commentBody: null,
    };
  }

  return {
    feedbackExists: true,
    liked: feedback.liked,
    commentBody: normalizeFeedbackCommentBody(feedback.commentBody),
  };
}

export function createFeedbackDraft(
  baseline: MyConcernResponseFeedbackBaseline,
): MyConcernResponseFeedbackDraft {
  return {
    liked: baseline.liked,
    commentBody: baseline.commentBody,
  };
}

export function hydrateMyConcernResponseScreenState(
  displayDetail: MyConcernResponseDetail,
  feedback: MyConcernResponseFeedback | null,
): MyConcernResponseScreenState {
  const feedbackBaseline = createFeedbackBaseline(feedback);

  return {
    displayDetail,
    feedbackBaseline,
    feedbackDraft: createFeedbackDraft(feedbackBaseline),
  };
}

export function applyDisplayDetailRefresh(
  current: MyConcernResponseScreenState,
  displayDetail: MyConcernResponseDetail,
): MyConcernResponseScreenState {
  return {
    ...current,
    displayDetail,
  };
}

export function applyApprovedSaveReload(
  _current: MyConcernResponseScreenState,
  displayDetail: MyConcernResponseDetail,
  feedback: MyConcernResponseFeedback | null,
): MyConcernResponseScreenState {
  return hydrateMyConcernResponseScreenState(displayDetail, feedback);
}

export function applyBlockedOrFailedSavePreservation(
  current: MyConcernResponseScreenState,
): MyConcernResponseScreenState {
  return current;
}

export function isFeedbackDraftDirty(
  baseline: MyConcernResponseFeedbackBaseline,
  draft: MyConcernResponseFeedbackDraft,
) {
  return (
    baseline.liked !== draft.liked ||
    normalizeFeedbackCommentBody(baseline.commentBody) !== normalizeFeedbackCommentBody(draft.commentBody)
  );
}

export function getFeedbackEditorMode(baseline: MyConcernResponseFeedbackBaseline) {
  return baseline.feedbackExists ? "edit" : "create";
}

export function canSubmitFeedback(
  baseline: MyConcernResponseFeedbackBaseline,
  draft: MyConcernResponseFeedbackDraft,
) {
  return !baseline.feedbackExists || isFeedbackDraftDirty(baseline, draft);
}

export function toFeedbackSaveValues(draft: MyConcernResponseFeedbackDraft) {
  return {
    liked: draft.liked,
    commentBody: normalizeFeedbackCommentBody(draft.commentBody),
  };
}
