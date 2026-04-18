export const MAX_CONCERN_BODY_LENGTH = 2000;

export const CONCERN_BLOCKED_MESSAGE = "부적절한 표현이 감지되었습니다.";
export const PROFILE_NOT_FOUND_MESSAGE = "프로필 상태를 다시 확인해 주세요.";
export const AUTH_REQUIRED_MESSAGE = "인증 상태를 다시 확인해 주세요.";
export const INVALID_BODY_MESSAGE = "고민 내용을 다시 확인해 주세요.";
export const INVALID_JSON_MESSAGE = "요청 형식을 다시 확인해 주세요.";
export const EMPTY_BODY_MESSAGE = "고민 내용을 입력해 주세요.";
export const BODY_TOO_LONG_MESSAGE = `고민 내용은 ${MAX_CONCERN_BODY_LENGTH}자 이하로 입력해 주세요.`;
export const SUBMIT_CONCERN_RETRY_MESSAGE = "게시를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export type SubmitConcernRequest = {
  body: string;
};

export type SubmitConcernApprovedResponse = {
  status: "approved";
  concernId: string;
};

export type SubmitConcernBlockedResponse = {
  status: "blocked";
  code: "moderation_blocked";
  userMessage: typeof CONCERN_BLOCKED_MESSAGE;
};

export type SubmitConcernSuccessResponse = SubmitConcernApprovedResponse | SubmitConcernBlockedResponse;

export type SubmitConcernErrorCode =
  | "auth_required"
  | "invalid_json"
  | "invalid_body_type"
  | "empty_body"
  | "body_too_long"
  | "profile_not_found"
  | "moderation_unavailable"
  | "concern_submission_failed";

export type SubmitConcernErrorResponse = {
  code: SubmitConcernErrorCode;
  userMessage: string;
};
