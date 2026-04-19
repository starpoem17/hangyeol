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
  insertExampleConcern,
  insertRealConcern,
  insertResponse,
  listAuditRowsBySubject,
  listNotificationsByProfileId,
  loadLocalSupabaseEnv,
} from "./harness";

function buildFeedbackRequest(responseId: string, liked: boolean, commentBody: string | null) {
  return new Request("http://localhost/save-response-feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer phase11-test-token",
    },
    body: JSON.stringify({
      responseId,
      liked,
      commentBody,
    }),
  });
}

const describePhase11 = hasPhase11EnvConfigured() ? describe : describe.skip;

describePhase11("phase11 access control", () => {
  beforeAll(() => {
    loadLocalSupabaseEnv();
  });

  it("allows only the real concern author to read the concern", async () => {
    const serviceClient = createServiceClient();
    const author = await createOnboardedUser();
    const otherUser = await createOnboardedUser();
    const concern = await insertRealConcern(serviceClient, {
      authorProfileId: author.profile.id,
    });

    const authorRead = await author.client.from("concerns").select("id").eq("id", concern.id).maybeSingle();
    const otherRead = await otherUser.client.from("concerns").select("id").eq("id", concern.id).maybeSingle();

    expect(authorRead.error).toBeNull();
    expect(authorRead.data?.id).toBe(concern.id);
    expect(otherRead.error).toBeNull();
    expect(otherRead.data).toBeNull();
  });

  it("allows only the assigned recipient to read the delivery", async () => {
    const serviceClient = createServiceClient();
    const author = await createOnboardedUser();
    const recipient = await createOnboardedUser();
    const otherUser = await createOnboardedUser();
    const concern = await insertRealConcern(serviceClient, {
      authorProfileId: author.profile.id,
    });
    const delivery = await insertDelivery(serviceClient, {
      concernId: concern.id,
      recipientProfileId: recipient.profile.id,
      routingOrder: 1,
    });

    const recipientRead = await recipient.client.from("concern_deliveries").select("id").eq("id", delivery.id).maybeSingle();
    const otherRead = await otherUser.client.from("concern_deliveries").select("id").eq("id", delivery.id).maybeSingle();

    expect(recipientRead.error).toBeNull();
    expect(recipientRead.data?.id).toBe(delivery.id);
    expect(otherRead.error).toBeNull();
    expect(otherRead.data).toBeNull();
  });

  it("allows only the real concern author to read the response from the author side", async () => {
    const serviceClient = createServiceClient();
    const author = await createOnboardedUser();
    const recipient = await createOnboardedUser();
    const unrelated = await createOnboardedUser();
    const concern = await insertRealConcern(serviceClient, {
      authorProfileId: author.profile.id,
    });
    const delivery = await insertDelivery(serviceClient, {
      concernId: concern.id,
      recipientProfileId: recipient.profile.id,
      routingOrder: 1,
    });
    const responseSubmit = await submitResponseWithDependencies(
      {
        authUserId: recipient.user.id,
        payload: {
          deliveryId: delivery.id,
          body: "정상 응답 조회용 답변입니다.",
        },
      },
      buildSubmitResponseDeps(serviceClient, {
        moderationDecision: createModerationDecision(),
      }),
    );

    if (!responseSubmit.ok || responseSubmit.body.status !== "approved") {
      throw new Error("response creation for read-access test failed");
    }

    const response = await getResponseByDeliveryId(serviceClient, delivery.id);

    if (!response) {
      throw new Error("response row missing for read-access test");
    }

    const authorRead = await author.client.from("responses").select("id").eq("id", response.id).maybeSingle();
    const unrelatedRead = await unrelated.client.from("responses").select("id").eq("id", response.id).maybeSingle();

    expect(authorRead.error).toBeNull();
    expect(authorRead.data?.id).toBe(response.id);
    expect(unrelatedRead.error).toBeNull();
    expect(unrelatedRead.data).toBeNull();
  });

  it("permits response creation only for the assigned recipient", async () => {
    const serviceClient = createServiceClient();
    const author = await createOnboardedUser();
    const recipient = await createOnboardedUser();
    const nonRecipient = await createOnboardedUser();
    const concern = await insertRealConcern(serviceClient, {
      authorProfileId: author.profile.id,
    });
    const delivery = await insertDelivery(serviceClient, {
      concernId: concern.id,
      recipientProfileId: recipient.profile.id,
      routingOrder: 1,
    });

    const nonRecipientResult = await submitResponseWithDependencies(
      {
        authUserId: nonRecipient.user.id,
        payload: {
          deliveryId: delivery.id,
          body: "비배정 사용자의 답변 시도입니다.",
        },
      },
      buildSubmitResponseDeps(serviceClient, {
        moderationDecision: createModerationDecision(),
      }),
    );

    expect(nonRecipientResult).toEqual({
      ok: false,
      httpStatus: 404,
      body: {
        code: "delivery_not_accessible",
        userMessage: "대상 고민을 다시 확인해 주세요.",
      },
    });
    expect(await getResponseByDeliveryId(serviceClient, delivery.id)).toBeNull();

    const recipientResult = await submitResponseWithDependencies(
      {
        authUserId: recipient.user.id,
        payload: {
          deliveryId: delivery.id,
          body: "배정된 사용자의 승인 답변입니다.",
        },
      },
      buildSubmitResponseDeps(serviceClient, {
        moderationDecision: createModerationDecision(),
      }),
    );

    expect(recipientResult.ok).toBe(true);
    expect(recipientResult.httpStatus).toBe(200);
    if (!recipientResult.ok) {
      throw new Error("recipient response submission unexpectedly failed");
    }
    expect(recipientResult.body.status).toBe("approved");
    expect(await getResponseByDeliveryId(serviceClient, delivery.id)).not.toBeNull();
  });

  it("permits feedback creation only for the real concern author", async () => {
    const serviceClient = createServiceClient();
    const author = await createOnboardedUser();
    const recipient = await createOnboardedUser();
    const nonAuthor = await createOnboardedUser();
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

    const nonAuthorResponse = await handleSaveResponseFeedbackRequest(
      buildFeedbackRequest(response.id, true, "접근 권한이 없는 사용자"),
      buildSaveFeedbackHandlerDeps(serviceClient, {
        authUserId: nonAuthor.user.id,
        moderationDecision: createModerationDecision(),
      }),
    );

    expect(nonAuthorResponse.status).toBe(404);
    await expect(nonAuthorResponse.json()).resolves.toEqual({
      code: "response_not_accessible",
      userMessage: "존재하지 않거나 접근할 수 없는 답변입니다.",
    });
    expect(await getFeedbackByResponseId(serviceClient, response.id, author.profile.id)).toBeNull();

    const authorResponse = await handleSaveResponseFeedbackRequest(
      buildFeedbackRequest(response.id, true, "도움이 됐어요."),
      buildSaveFeedbackHandlerDeps(serviceClient, {
        authUserId: author.user.id,
        moderationDecision: createModerationDecision(),
      }),
    );

    expect(authorResponse.status).toBe(200);
    await expect(authorResponse.json()).resolves.toEqual({
      resultCode: "saved",
    });
    expect(await getFeedbackByResponseId(serviceClient, response.id, author.profile.id)).not.toBeNull();
  });

  it("rejects feedback saves for example concerns without side effects", async () => {
    const serviceClient = createServiceClient();
    const actor = await createOnboardedUser();
    const recipient = await createOnboardedUser();
    const exampleConcern = await insertExampleConcern(serviceClient);
    const delivery = await insertDelivery(serviceClient, {
      concernId: exampleConcern.id,
      recipientProfileId: recipient.profile.id,
      routingOrder: 1,
    });
    const response = await insertResponse(serviceClient, {
      deliveryId: delivery.id,
    });

    const handlerResponse = await handleSaveResponseFeedbackRequest(
      buildFeedbackRequest(response.id, true, "예제 고민 후기"),
      buildSaveFeedbackHandlerDeps(serviceClient, {
        authUserId: actor.user.id,
        moderationDecision: createModerationDecision(),
      }),
    );

    expect(handlerResponse.status).toBe(200);
    await expect(handlerResponse.json()).resolves.toEqual({
      resultCode: "example_concern_not_allowed",
    });
    expect(await getFeedbackByResponseId(serviceClient, response.id)).toBeNull();

    const notifications = await listNotificationsByProfileId(serviceClient, recipient.profile.id);
    expect(
      notifications.filter((notification) =>
        notification.type === "response_liked" || notification.type === "response_commented",
      ),
    ).toEqual([]);

    const auditRows = await listAuditRowsBySubject(serviceClient, {
      subjectType: "response_feedback_comment",
      actorProfileId: actor.profile.id,
    });
    expect(auditRows).toHaveLength(0);
  });

  it("keeps push tokens self-owned", async () => {
    const serviceClient = createServiceClient();
    const owner = await createOnboardedUser();
    const otherUser = await createOnboardedUser();
    const ownerToken = `ExponentPushToken-${crypto.randomUUID()}`;

    const syncResult = await owner.client.rpc("sync_my_push_token", {
      p_expo_push_token: ownerToken,
      p_platform: "ios",
    });
    const storedToken = await serviceClient
      .from("push_tokens")
      .select("profile_id, expo_push_token, platform")
      .eq("expo_push_token", ownerToken)
      .maybeSingle();
    const otherRead = await otherUser.client
      .from("push_tokens")
      .select("id")
      .eq("profile_id", owner.profile.id);
    const forbiddenInsert = await otherUser.client.from("push_tokens").insert({
      profile_id: owner.profile.id,
      expo_push_token: `ExponentPushToken-${crypto.randomUUID()}`,
      platform: "android",
    });

    expect(syncResult.error).toBeNull();
    expect(storedToken.error).toBeNull();
    expect(storedToken.data).toMatchObject({
      profile_id: owner.profile.id,
      expo_push_token: ownerToken,
      platform: "ios",
    });
    expect(otherRead.error).toBeNull();
    expect(otherRead.data).toEqual([]);
    expect(forbiddenInsert.error).not.toBeNull();
  });

  it("blocks private moderation audit reads from normal authenticated clients", async () => {
    const serviceClient = createServiceClient();
    const user = await createOnboardedUser();
    const rawBody = `audit-row-${crypto.randomUUID()}`;
    const blockedConcernResult = await submitConcernWithDependencies(
      {
        authUserId: user.user.id,
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

    expect(blockedConcernResult.ok).toBe(true);

    const normalRead = await user.client.schema("private").from("moderation_audit_entries").select("id").limit(1);
    const serviceRead = await serviceClient.rpc("list_moderation_audit_entries_for_operator", {
      p_limit: 20,
      p_subject_type: "concern",
      p_blocked: true,
    });

    expect(normalRead.error).not.toBeNull();
    expect(serviceRead.error).toBeNull();
    expect((serviceRead.data ?? []).some((row) => row.raw_submitted_text === rawBody)).toBe(true);
  });
});
