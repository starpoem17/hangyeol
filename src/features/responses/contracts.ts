export const MIN_RESPONSE_BODY_LENGTH = 5;
export const MAX_RESPONSE_BODY_LENGTH = 2000;

export const RESPONSE_BLOCKED_MESSAGE = "부적절한 표현이 감지되었습니다.";
export const PROFILE_NOT_FOUND_MESSAGE = "프로필 상태를 다시 확인해 주세요.";
export const AUTH_REQUIRED_MESSAGE = "인증 상태를 다시 확인해 주세요.";
export const INVALID_DELIVERY_ID_MESSAGE = "대상 고민을 다시 확인해 주세요.";
export const INVALID_BODY_MESSAGE = "답변 내용을 다시 확인해 주세요.";
export const INVALID_JSON_MESSAGE = "요청 형식을 다시 확인해 주세요.";
export const EMPTY_BODY_MESSAGE = "답변 내용을 입력해 주세요.";
export const BODY_TOO_SHORT_MESSAGE = `답변 내용은 ${MIN_RESPONSE_BODY_LENGTH}자 이상 입력해 주세요.`;
export const BODY_TOO_LONG_MESSAGE = `답변 내용은 ${MAX_RESPONSE_BODY_LENGTH}자 이하로 입력해 주세요.`;
export const DELIVERY_NOT_ACCESSIBLE_MESSAGE = "대상 고민을 다시 확인해 주세요.";
export const DELIVERY_ALREADY_RESPONDED_MESSAGE = "이미 답변을 제출한 고민입니다.";
export const SUBMIT_RESPONSE_RETRY_MESSAGE = "답변을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export type SubmitResponseRequest = {
  deliveryId: string;
  body: string;
};

export type SubmitResponseApprovedResponse = {
  status: "approved";
  responseId: string;
};

export type SubmitResponseBlockedResponse = {
  status: "blocked";
  code: "moderation_blocked";
  userMessage: typeof RESPONSE_BLOCKED_MESSAGE;
};

export type SubmitResponseSuccessResponse = SubmitResponseApprovedResponse | SubmitResponseBlockedResponse;

export type SubmitResponseErrorCode =
  | "auth_required"
  | "invalid_json"
  | "invalid_delivery_id"
  | "invalid_body_type"
  | "empty_body"
  | "body_too_short"
  | "body_too_long"
  | "profile_not_found"
  | "delivery_not_accessible"
  | "delivery_already_responded"
  | "moderation_unavailable"
  | "response_submission_failed";

export type SubmitResponseErrorResponse = {
  code: SubmitResponseErrorCode;
  userMessage: string;
};
