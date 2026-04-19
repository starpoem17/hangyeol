import { beforeAll, describe, expect, it } from "vitest";

import { submitConcernWithDependencies } from "../../src/features/concerns/server/submit-concern-service";
import { submitResponseWithDependencies } from "../../src/features/responses/server/submit-response-service";
import { handleSaveResponseFeedbackRequest } from "../functions/save-response-feedback/handler";
import {
  buildSaveFeedbackHandlerDeps,
  buildSubmitConcernDeps,
  buildSubmitResponseDeps,
  createModerationDecision,
  createOnboardedUser,
  createServiceClient,
  getConcernById,
  getFeedbackByResponseId,
  getResponseByDeliveryId,
  hasPhase11EnvConfigured,
  insertDelivery,
  insertRealConcern,
  insertResponse,
  listAuditRowsBySubject,
  listNotificationsByProfileId,
  loadLocalSupabaseEnv,
} from "./harness";

function feedbackRequest(responseId: string, commentBody: string) {
  return new Request("http://localhost/save-response-feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer phase11-test-token",
    },
    body: JSON.stringify({
      responseId,
      liked: true,
      commentBody,
    }),
  });
}

const describePhase11 = hasPhase11EnvConfigured() ? describe : describe.skip;

describePhase11("phase11 moderation persistence", () => {
  beforeAll(() => {
    loadLocalSupabaseEnv();
  });

  it("persists blocked concerns only in moderation audit storage", async () => {
    const serviceClient = createServiceClient();
    const author = await createOnboardedUser();
    const rawBody = `  blocked-concern-${crypto.randomUUID()}  `;

    const result = await submitConcernWithDependencies(
      {
        authUserId: author.user.id,
        payload: {
          body: rawBody,
        },
      },
      buildSubmitConcernDeps(serviceClient, {
        moderationDecision: createModerationDecision({
          blocked: true,
          categorySummary: {
            flagged_categories: ["violence"],
          },
        }),
      }),
    );

    expect(result).toEqual({
      ok: true,
      httpStatus: 200,
      body: {
        status: "blocked",
        code: "moderation_blocked",
        userMessage: "부적절한 표현이 감지되었습니다.",
      },
    });

    const concernLookup = await serviceClient
      .from("concerns")
      .select("id")
      .eq("author_profile_id", author.profile.id)
      .eq("body", rawBody.trim());
    const deliveries = await serviceClient
      .from("concern_deliveries")
      .select("id")
      .eq("recipient_profile_id", author.profile.id);
    const notifications = await listNotificationsByProfileId(serviceClient, author.profile.id);
    const auditRows = await listAuditRowsBySubject(serviceClient, {
      subjectType: "concern",
      actorProfileId: author.profile.id,
      rawSubmittedText: rawBody,
    });

    expect(concernLookup.error).toBeNull();
    expect(concernLookup.data).toEqual([]);
    expect(deliveries.error).toBeNull();
    expect(deliveries.data).toEqual([]);
    expect(notifications).toEqual([]);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      blocked: true,
      approved_entity_type: null,
      approved_entity_id: null,
      raw_submitted_text: rawBody,
    });
  });

  it("persists approved concerns in product tables and links their audit row", async () => {
    const serviceClient = createServiceClient();
    const author = await createOnboardedUser();
    const responderA = await createOnboardedUser();
    const responderB = await createOnboardedUser();
    const responderC = await createOnboardedUser();
    const rawBody = `  approved-concern-${crypto.randomUUID()}  `;

    const result = await submitConcernWithDependencies(
      {
        authUserId: author.user.id,
        payload: {
          body: rawBody,
        },
      },
      buildSubmitConcernDeps(serviceClient, {
        moderationDecision: createModerationDecision(),
        responderProfileIds: [responderA.profile.id, responderB.profile.id, responderC.profile.id],
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(200);
    if (!result.ok || result.body.status !== "approved") {
      throw new Error("approved concern persistence test did not return an approved result");
    }

    const concern = await getConcernById(serviceClient, result.body.concernId);
    const auditRows = await listAuditRowsBySubject(serviceClient, {
      subjectType: "concern",
      actorProfileId: author.profile.id,
      rawSubmittedText: rawBody,
    });

    expect(concern).toMatchObject({
      id: result.body.concernId,
      body: rawBody.trim(),
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      blocked: false,
      approved_entity_type: "concern",
      approved_entity_id: result.body.concernId,
    });
  });

  it("persists blocked responses only in moderation audit storage", async () => {
    const serviceClient = createServiceClient();
    const author = await createOnboardedUser();
    const recipient = await createOnboardedUser();
    const concern = await insertRealConcern(serviceClient, {
      authorProfileId: author.profile.id,
    });
    const delivery = await insertDelivery(serviceClient, {
      concernId: concern.id,
      recipientProfileId: recipient.profile.id,
      routingOrder: 1,
    });
    const rawBody = `  blocked-response-${crypto.randomUUID()}  `;

    const result = await submitResponseWithDependencies(
      {
        authUserId: recipient.user.id,
        payload: {
          deliveryId: delivery.id,
          body: rawBody,
        },
      },
      buildSubmitResponseDeps(serviceClient, {
        moderationDecision: createModerationDecision({
          blocked: true,
          categorySummary: {
            flagged_categories: ["harassment"],
          },
        }),
      }),
    );

    expect(result).toEqual({
      ok: true,
      httpStatus: 200,
      body: {
        status: "blocked",
        code: "moderation_blocked",
        userMessage: "부적절한 표현이 감지되었습니다.",
      },
    });

    const response = await getResponseByDeliveryId(serviceClient, delivery.id);
    const deliveryRow = await serviceClient
      .from("concern_deliveries")
      .select("status, opened_at, responded_at")
      .eq("id", delivery.id)
      .single();
    const notifications = await listNotificationsByProfileId(serviceClient, author.profile.id);
    const auditRows = await listAuditRowsBySubject(serviceClient, {
      subjectType: "response",
      actorProfileId: recipient.profile.id,
      rawSubmittedText: rawBody,
    });

    expect(response).toBeNull();
    expect(deliveryRow.error).toBeNull();
    expect(deliveryRow.data).toMatchObject({
      status: "assigned",
      opened_at: null,
      responded_at: null,
    });
    expect(notifications.filter((notification) => notification.type === "response_received")).toEqual([]);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      blocked: true,
      approved_entity_type: null,
      approved_entity_id: null,
    });
  });

  it("persists approved responses in product tables and links their audit row", async () => {
    const serviceClient = createServiceClient();
    const author = await createOnboardedUser();
    const recipient = await createOnboardedUser();
    const concern = await insertRealConcern(serviceClient, {
      authorProfileId: author.profile.id,
    });
    const delivery = await insertDelivery(serviceClient, {
      concernId: concern.id,
      recipientProfileId: recipient.profile.id,
      routingOrder: 1,
    });
    const rawBody = `  approved-response-${crypto.randomUUID()}  `;

    const result = await submitResponseWithDependencies(
      {
        authUserId: recipient.user.id,
        payload: {
          deliveryId: delivery.id,
          body: rawBody,
        },
      },
      buildSubmitResponseDeps(serviceClient, {
        moderationDecision: createModerationDecision(),
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.httpStatus).toBe(200);
    if (!result.ok) {
      throw new Error("approved response persistence test unexpectedly failed");
    }
    expect(result.body.status).toBe("approved");

    const response = await getResponseByDeliveryId(serviceClient, delivery.id);
    const deliveryRow = await serviceClient
      .from("concern_deliveries")
      .select("status, opened_at, responded_at")
      .eq("id", delivery.id)
      .single();
    const auditRows = await listAuditRowsBySubject(serviceClient, {
      subjectType: "response",
      actorProfileId: recipient.profile.id,
      rawSubmittedText: rawBody,
    });

    expect(response).not.toBeNull();
    expect(deliveryRow.error).toBeNull();
    expect(deliveryRow.data?.status).toBe("responded");
    expect(deliveryRow.data?.opened_at).not.toBeNull();
    expect(deliveryRow.data?.responded_at).not.toBeNull();
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      blocked: false,
      approved_entity_type: "response",
      approved_entity_id: response?.id,
    });
  });

  it("persists blocked feedback comments only in moderation audit storage", async () => {
    const serviceClient = createServiceClient();
    const author = await createOnboardedUser();
    const recipient = await createOnboardedUser();
    const concern = await insertRealConcern(serviceClient, {
      authorProfileId: author.profile.id,
    });
    const delivery = await insertDelivery(serviceClient, {
      concernId: concern.id,
      recipientProfileId: recipient.profile.id,
      routingOrder: 1,
    });
    const response = await insertResponse(serviceClient, {
      deliveryId: delivery.id,
    });
    const commentBody = `blocked-feedback-${crypto.randomUUID()}`;

    const handlerResponse = await handleSaveResponseFeedbackRequest(
      feedbackRequest(response.id, commentBody),
      buildSaveFeedbackHandlerDeps(serviceClient, {
        authUserId: author.user.id,
        moderationDecision: createModerationDecision({
          blocked: true,
          categorySummary: {
            flagged_categories: ["self-harm"],
          },
        }),
      }),
    );

    expect(handlerResponse.status).toBe(200);
    await expect(handlerResponse.json()).resolves.toEqual({
      resultCode: "comment_blocked",
      userMessage: "부적절한 표현이 감지되었습니다.",
    });

    const feedback = await getFeedbackByResponseId(serviceClient, response.id, author.profile.id);
    const notifications = await listNotificationsByProfileId(serviceClient, recipient.profile.id);
    const auditRows = await listAuditRowsBySubject(serviceClient, {
      subjectType: "response_feedback_comment",
      actorProfileId: author.profile.id,
      rawSubmittedText: commentBody,
    });

    expect(feedback).toBeNull();
    expect(
      notifications.filter((notification) =>
        notification.type === "response_liked" || notification.type === "response_commented",
      ),
    ).toEqual([]);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      blocked: true,
      approved_entity_type: null,
      approved_entity_id: null,
    });
  });

  it("persists approved feedback comments in product tables and links their audit row", async () => {
    const serviceClient = createServiceClient();
    const author = await createOnboardedUser();
    const recipient = await createOnboardedUser();
    const concern = await insertRealConcern(serviceClient, {
      authorProfileId: author.profile.id,
    });
    const delivery = await insertDelivery(serviceClient, {
      concernId: concern.id,
      recipientProfileId: recipient.profile.id,
      routingOrder: 1,
    });
    const response = await insertResponse(serviceClient, {
      deliveryId: delivery.id,
    });
    const commentBody = `approved-feedback-${crypto.randomUUID()}`;

    const handlerResponse = await handleSaveResponseFeedbackRequest(
      feedbackRequest(response.id, commentBody),
      buildSaveFeedbackHandlerDeps(serviceClient, {
        authUserId: author.user.id,
        moderationDecision: createModerationDecision(),
      }),
    );

    expect(handlerResponse.status).toBe(200);
    await expect(handlerResponse.json()).resolves.toEqual({
      resultCode: "saved",
    });

    const feedback = await getFeedbackByResponseId(serviceClient, response.id, author.profile.id);
    const auditRows = await listAuditRowsBySubject(serviceClient, {
      subjectType: "response_feedback_comment",
      actorProfileId: author.profile.id,
      rawSubmittedText: commentBody,
    });

    expect(feedback).toMatchObject({
      response_id: response.id,
      concern_author_profile_id: author.profile.id,
      liked: true,
      comment_body: commentBody,
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      blocked: false,
      approved_entity_type: "response_feedback",
      approved_entity_id: feedback?.id,
    });
  });
});
