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

describePhase11("phase11 repo scenario blocked paths", () => {
  beforeAll(() => {
    loadLocalSupabaseEnv();
  });

  it("keeps blocked concern submissions out of product tables", async () => {
    const serviceClient = createServiceClient();
    const author = await createOnboardedUser();
    const rawBody = `  repo-blocked-concern-${crypto.randomUUID()}  `;

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

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("blocked concern scenario unexpectedly failed");
    }
    expect(result.body.status).toBe("blocked");

    const concerns = await serviceClient
      .from("concerns")
      .select("id")
      .eq("author_profile_id", author.profile.id)
      .eq("body", rawBody.trim());
    const notifications = await listNotificationsByProfileId(serviceClient, author.profile.id);
    const auditRows = await listAuditRowsBySubject(serviceClient, {
      subjectType: "concern",
      actorProfileId: author.profile.id,
      rawSubmittedText: rawBody,
    });

    expect(concerns.error).toBeNull();
    expect(concerns.data).toEqual([]);
    expect(notifications).toEqual([]);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      blocked: true,
      approved_entity_type: null,
      approved_entity_id: null,
    });
  });

  it("keeps blocked responses out of product tables and leaves deliveries untouched", async () => {
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
    const rawBody = `  repo-blocked-response-${crypto.randomUUID()}  `;

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

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("blocked response scenario unexpectedly failed");
    }
    expect(result.body.status).toBe("blocked");
    expect(await getResponseByDeliveryId(serviceClient, delivery.id)).toBeNull();

    const deliveryRow = await serviceClient
      .from("concern_deliveries")
      .select("status, responded_at")
      .eq("id", delivery.id)
      .single();
    const notifications = await listNotificationsByProfileId(serviceClient, author.profile.id);
    const auditRows = await listAuditRowsBySubject(serviceClient, {
      subjectType: "response",
      actorProfileId: recipient.profile.id,
      rawSubmittedText: rawBody,
    });

    expect(deliveryRow.error).toBeNull();
    expect(deliveryRow.data).toMatchObject({
      status: "assigned",
      responded_at: null,
    });
    expect(notifications.filter((notification) => notification.type === "response_received")).toEqual([]);
    expect(auditRows).toHaveLength(1);
  });

  it("keeps blocked feedback comments out of product tables and emits no feedback notifications", async () => {
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
    const commentBody = `repo-blocked-feedback-${crypto.randomUUID()}`;

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
    expect(await getFeedbackByResponseId(serviceClient, response.id, author.profile.id)).toBeNull();

    const notifications = await listNotificationsByProfileId(serviceClient, recipient.profile.id);
    const auditRows = await listAuditRowsBySubject(serviceClient, {
      subjectType: "response_feedback_comment",
      actorProfileId: author.profile.id,
      rawSubmittedText: commentBody,
    });

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
});
