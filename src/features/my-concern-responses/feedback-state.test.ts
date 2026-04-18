import { describe, expect, it } from "vitest";

import {
  applyApprovedSaveReload,
  applyBlockedOrFailedSavePreservation,
  applyDisplayDetailRefresh,
  canSubmitFeedback,
  getFeedbackEditorMode,
  hydrateMyConcernResponseScreenState,
} from "./feedback-state";
import type { MyConcernResponseDetail, MyConcernResponseFeedback, MyConcernResponseScreenState } from "./types";

function buildDetail(overrides: Partial<MyConcernResponseDetail> = {}): MyConcernResponseDetail {
  return {
    responseId: "response-1",
    concernId: "concern-1",
    body: "기본 답변 본문",
    createdAt: "2026-04-19T10:00:00.000Z",
    ...overrides,
  };
}

function buildFeedback(overrides: Partial<MyConcernResponseFeedback> = {}): MyConcernResponseFeedback {
  return {
    responseId: "response-1",
    liked: true,
    commentBody: "도움이 많이 됐어요.",
    ...overrides,
  };
}

function buildState(): MyConcernResponseScreenState {
  return hydrateMyConcernResponseScreenState(buildDetail(), buildFeedback());
}

describe("my concern response feedback state", () => {
  it("generic successful background/detail refetch cannot overwrite feedback baseline or feedback draft and only updates display-only fields", () => {
    const current = buildState();
    const nextDetail = buildDetail({
      body: "서버에서 새로 반영된 답변 본문",
      createdAt: "2026-04-19T11:00:00.000Z",
    });

    const nextState = applyDisplayDetailRefresh(current, nextDetail);

    expect(nextState.displayDetail).toEqual(nextDetail);
    expect(nextState.feedbackBaseline).toEqual(current.feedbackBaseline);
    expect(nextState.feedbackDraft).toEqual(current.feedbackDraft);
  });

  it("screen logic does not behave as if one wholesale detail replacement is the source of truth for both rendering and editable feedback state", () => {
    const current = buildState();
    const currentWithDraft = {
      ...current,
      feedbackDraft: {
        liked: false,
        commentBody: "아직 저장하지 않은 로컬 수정본",
      },
    };

    const nextState = applyDisplayDetailRefresh(
      currentWithDraft,
      buildDetail({
        body: "렌더링 전용 새 답변 본문",
      }),
    );

    expect(nextState.displayDetail.body).toBe("렌더링 전용 새 답변 본문");
    expect(nextState.feedbackBaseline).toEqual(currentWithDraft.feedbackBaseline);
    expect(nextState.feedbackDraft).toEqual(currentWithDraft.feedbackDraft);
  });

  it("generic state reset/refetch path cannot collapse feedbackExists=true liked=false commentBody=null into first-create mode", () => {
    const retainedEmpty = hydrateMyConcernResponseScreenState(
      buildDetail(),
      buildFeedback({
        liked: false,
        commentBody: null,
      }),
    );

    const nextState = applyDisplayDetailRefresh(
      retainedEmpty,
      buildDetail({
        body: "본문만 새로고침된 답변",
      }),
    );

    expect(nextState.feedbackBaseline).toEqual({
      feedbackExists: true,
      liked: false,
      commentBody: null,
    });
    expect(getFeedbackEditorMode(nextState.feedbackBaseline)).toBe("edit");
  });

  it("approved-save reload is the only non-initial path allowed to replace both feedback baseline and feedback draft from fresh server detail", () => {
    const current = buildState();
    const dirtyDraftState = {
      ...current,
      feedbackDraft: {
        liked: false,
        commentBody: "저장 직전 로컬 draft",
      },
    };
    const nextDetail = buildDetail({
      body: "저장 후 서버 기준 답변 본문",
    });
    const nextFeedback = buildFeedback({
      liked: false,
      commentBody: null,
    });

    const nextState = applyApprovedSaveReload(dirtyDraftState, nextDetail, nextFeedback);

    expect(nextState.displayDetail).toEqual(nextDetail);
    expect(nextState.feedbackBaseline).toEqual({
      feedbackExists: true,
      liked: false,
      commentBody: null,
    });
    expect(nextState.feedbackDraft).toEqual({
      liked: false,
      commentBody: null,
    });
  });

  it("blocked response or failed save cannot trigger a generic detail-state replacement that changes feedback baseline/draft", () => {
    const current = {
      ...buildState(),
      feedbackDraft: {
        liked: false,
        commentBody: "저장 실패 후에도 남아 있어야 하는 draft",
      },
    };

    const blockedState = applyBlockedOrFailedSavePreservation(current);
    const failedState = applyBlockedOrFailedSavePreservation(current);

    expect(blockedState.feedbackBaseline).toEqual(current.feedbackBaseline);
    expect(blockedState.feedbackDraft).toEqual(current.feedbackDraft);
    expect(failedState.feedbackBaseline).toEqual(current.feedbackBaseline);
    expect(failedState.feedbackDraft).toEqual(current.feedbackDraft);
  });

  it("allows first-create submission for a retained all-cleared row shape while keeping edit-mode semantics after persistence", () => {
    const createState = hydrateMyConcernResponseScreenState(buildDetail(), null);

    expect(canSubmitFeedback(createState.feedbackBaseline, createState.feedbackDraft)).toBe(true);

    const persistedState = applyApprovedSaveReload(
      createState,
      buildDetail(),
      buildFeedback({
        liked: false,
        commentBody: null,
      }),
    );

    expect(getFeedbackEditorMode(persistedState.feedbackBaseline)).toBe("edit");
    expect(canSubmitFeedback(persistedState.feedbackBaseline, persistedState.feedbackDraft)).toBe(false);
  });
});
