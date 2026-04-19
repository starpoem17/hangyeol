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
  completeUserOnboarding,
  fetchBootstrappedProfile,
  getConcernById,
  getFeedbackByResponseId,
  getProfileById,
  getResponseByDeliveryId,
  hasPhase11EnvConfigured,
  listAuditRowsBySubject,
  listDeliveriesByConcernId,
  listNotificationsByProfileId,
  listProfileInterestKeys,
  loadLocalSupabaseEnv,
  signInAnonymousUser,
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

describePhase11("phase11 repo scenario happy path", () => {
  beforeAll(() => {
    loadLocalSupabaseEnv();
  });

  it("verifies the happy path against local Supabase-backed boundaries", async () => {
    const serviceClient = createServiceClient();
    const author = await signInAnonymousUser();

    const bootstrappedBeforeOnboarding = await fetchBootstrappedProfile(author.client, author.session);
    const persistedProfileBeforeOnboarding = await getProfileById(serviceClient, author.user.id);

    expect(bootstrappedBeforeOnboarding).toEqual({
      id: author.user.id,
      gender: null,
      onboardingCompleted: false,
    });
    expect(persistedProfileBeforeOnboarding).toMatchObject({
      id: author.user.id,
      gender: null,
      onboarding_completed: false,
    });

    const onboardingInterests = ["study", "career_path"];
    await completeUserOnboarding(author.client, {
      gender: "female",
      interestKeys: onboardingInterests,
    });

    const authorProfile = await fetchBootstrappedProfile(author.client, author.session);
    const authorInterestKeys = await listProfileInterestKeys(serviceClient, author.user.id);

    expect(authorProfile).toEqual({
      id: author.user.id,
      gender: "female",
      onboardingCompleted: true,
    });
    expect(authorInterestKeys).toEqual([...onboardingInterests].sort());

    const responderA = await createOnboardedUser({
      gender: "male",
      interestKeys: ["job_search", "study"],
    });
    const responderB = await createOnboardedUser({
      gender: "female",
      interestKeys: ["career_path", "future"],
    });
    const responderC = await createOnboardedUser({
      gender: "male",
      interestKeys: ["workplace", "self_esteem"],
    });

    const routingOrder = [responderB.profile.id, responderA.profile.id, responderC.profile.id];
    const rawConcernBody = `  repo-happy-concern-${crypto.randomUUID()}  `;
    const concernResult = await submitConcernWithDependencies(
      {
        authUserId: author.user.id,
        payload: {
          body: rawConcernBody,
        },
      },
      buildSubmitConcernDeps(serviceClient, {
        moderationDecision: createModerationDecision(),
        responderProfileIds: routingOrder,
      }),
    );

    expect(concernResult.ok).toBe(true);
    expect(concernResult.httpStatus).toBe(200);

    if (!concernResult.ok || concernResult.body.status !== "approved") {
      throw new Error("concern submission did not approve in happy path test");
    }
    expect(concernResult.body.status).toBe("approved");

    const concern = await getConcernById(serviceClient, concernResult.body.concernId);
    const concernAuditRows = await listAuditRowsBySubject(serviceClient, {
      subjectType: "concern",
      actorProfileId: author.user.id,
      rawSubmittedText: rawConcernBody,
    });
    const deliveries = await listDeliveriesByConcernId(serviceClient, concernResult.body.concernId);

    expect(concern).toMatchObject({
      id: concernResult.body.concernId,
      source_type: "real",
      author_profile_id: author.user.id,
      body: rawConcernBody.trim(),
    });
    expect(concernAuditRows).toHaveLength(1);
    expect(concernAuditRows[0]).toMatchObject({
      blocked: false,
      approved_entity_type: "concern",
      approved_entity_id: concernResult.body.concernId,
    });
    expect(deliveries).toHaveLength(3);
    expect(deliveries.map((delivery) => delivery.recipient_profile_id)).toEqual(routingOrder);
    expect(deliveries.map((delivery) => delivery.routing_order)).toEqual([1, 2, 3]);

    const concernDeliveredNotifications = [
      ...(await listNotificationsByProfileId(serviceClient, responderA.profile.id)),
      ...(await listNotificationsByProfileId(serviceClient, responderB.profile.id)),
      ...(await listNotificationsByProfileId(serviceClient, responderC.profile.id)),
    ].filter((notification) => notification.type === "concern_delivered");

    expect(concernDeliveredNotifications).toHaveLength(3);

    const chosenDelivery = deliveries[0];
    const rawResponseBody = `  repo-happy-response-${crypto.randomUUID()}  `;
    const responseResult = await submitResponseWithDependencies(
      {
        authUserId: responderB.user.id,
        payload: {
          deliveryId: chosenDelivery.id,
          body: rawResponseBody,
        },
      },
      buildSubmitResponseDeps(serviceClient, {
        moderationDecision: createModerationDecision(),
      }),
    );

    expect(responseResult.ok).toBe(true);
    expect(responseResult.httpStatus).toBe(200);
    if (!responseResult.ok) {
      throw new Error("response submission unexpectedly failed in happy path test");
    }
    expect(responseResult.body.status).toBe("approved");

    const response = await getResponseByDeliveryId(serviceClient, chosenDelivery.id);
    const updatedDelivery = await serviceClient
      .from("concern_deliveries")
      .select("status, opened_at, responded_at")
      .eq("id", chosenDelivery.id)
      .single();
    const authorNotificationsAfterResponse = await listNotificationsByProfileId(serviceClient, author.user.id);
    const responseAuditRows = await listAuditRowsBySubject(serviceClient, {
      subjectType: "response",
      actorProfileId: responderB.user.id,
      rawSubmittedText: rawResponseBody,
    });

    expect(response).toMatchObject({
      delivery_id: chosenDelivery.id,
      body: rawResponseBody.trim(),
    });
    expect(updatedDelivery.error).toBeNull();
    expect(updatedDelivery.data?.status).toBe("responded");
    expect(updatedDelivery.data?.opened_at).not.toBeNull();
    expect(updatedDelivery.data?.responded_at).not.toBeNull();
    expect(authorNotificationsAfterResponse.filter((notification) => notification.type === "response_received")).toHaveLength(1);
    expect(responseAuditRows).toHaveLength(1);
    expect(responseAuditRows[0]).toMatchObject({
      blocked: false,
      approved_entity_type: "response",
      approved_entity_id: response?.id,
    });

    if (!response) {
      throw new Error("response row missing in happy path test");
    }

    const feedbackComment = `repo-happy-feedback-${crypto.randomUUID()}`;
    const feedbackResponse = await handleSaveResponseFeedbackRequest(
      buildFeedbackRequest(response.id, true, feedbackComment),
      buildSaveFeedbackHandlerDeps(serviceClient, {
        authUserId: author.user.id,
        moderationDecision: createModerationDecision(),
      }),
    );

    expect(feedbackResponse.status).toBe(200);
    await expect(feedbackResponse.json()).resolves.toEqual({
      resultCode: "saved",
    });

    const feedback = await getFeedbackByResponseId(serviceClient, response.id, author.user.id);
    const feedbackAuditRows = await listAuditRowsBySubject(serviceClient, {
      subjectType: "response_feedback_comment",
      actorProfileId: author.user.id,
      rawSubmittedText: feedbackComment,
    });
    const responderNotificationsAfterFeedback = await listNotificationsByProfileId(serviceClient, responderB.user.id);

    expect(feedback).toMatchObject({
      response_id: response.id,
      concern_author_profile_id: author.user.id,
      liked: true,
      comment_body: feedbackComment,
    });
    expect(feedbackAuditRows).toHaveLength(1);
    expect(feedbackAuditRows[0]).toMatchObject({
      blocked: false,
      approved_entity_type: "response_feedback",
      approved_entity_id: feedback?.id,
    });
    expect(
      responderNotificationsAfterFeedback
        .filter((notification) => notification.type === "response_liked" || notification.type === "response_commented")
        .map((notification) => notification.type)
        .sort(),
    ).toEqual(["response_commented", "response_liked"]);
  });
});
