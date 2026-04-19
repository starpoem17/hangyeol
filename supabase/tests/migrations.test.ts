import { beforeAll, describe, expect, it } from "vitest";

import {
  createOnboardedUser,
  createServiceClient,
  hasPhase11EnvConfigured,
  insertDelivery,
  insertNotification,
  insertRealConcern,
  insertResponse,
  loadLocalSupabaseEnv,
} from "./harness";

const describePhase11 = hasPhase11EnvConfigured() ? describe : describe.skip;

describePhase11("phase11 migrations", () => {
  beforeAll(() => {
    loadLocalSupabaseEnv();
  });

  it("enforces concern source integrity constraints for real and example concerns", async () => {
    const serviceClient = createServiceClient();
    const author = await createOnboardedUser();

    const invalidReal = await serviceClient.from("concerns").insert({
      source_type: "real",
      body: `invalid-real-${crypto.randomUUID()}`,
    });
    const invalidExample = await serviceClient.from("concerns").insert({
      source_type: "example",
      body: `invalid-example-${crypto.randomUUID()}`,
    });
    const validReal = await serviceClient
      .from("concerns")
      .insert({
        source_type: "real",
        author_profile_id: author.profile.id,
        body: `valid-real-${crypto.randomUUID()}`,
      })
      .select("id, source_type, author_profile_id, example_key")
      .single();
    const validExample = await serviceClient
      .from("concerns")
      .insert({
        source_type: "example",
        example_key: `valid-example-${crypto.randomUUID()}`,
        body: `valid-example-body-${crypto.randomUUID()}`,
      })
      .select("id, source_type, author_profile_id, example_key")
      .single();

    expect(invalidReal.error?.code).toBe("23514");
    expect(invalidExample.error?.code).toBe("23514");
    expect(validReal.error).toBeNull();
    expect(validReal.data).toMatchObject({
      source_type: "real",
      author_profile_id: author.profile.id,
      example_key: null,
    });
    expect(validExample.error).toBeNull();
    expect(validExample.data).toMatchObject({
      source_type: "example",
      author_profile_id: null,
    });
    expect(typeof validExample.data?.example_key).toBe("string");
  });

  it("enforces uniqueness across deliveries, responses, and feedback", async () => {
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

    const duplicateDelivery = await serviceClient.from("concern_deliveries").insert({
      concern_id: concern.id,
      recipient_profile_id: recipient.profile.id,
      status: "assigned",
      routing_order: 2,
    });

    const response = await insertResponse(serviceClient, {
      deliveryId: delivery.id,
    });

    const duplicateResponse = await serviceClient.from("responses").insert({
      delivery_id: delivery.id,
      body: `duplicate-response-${crypto.randomUUID()}`,
    });

    const firstFeedback = await serviceClient
      .from("response_feedback")
      .insert({
        response_id: response.id,
        concern_author_profile_id: author.profile.id,
        liked: true,
        comment_body: `feedback-${crypto.randomUUID()}`,
      })
      .select("id")
      .single();
    const duplicateFeedback = await serviceClient.from("response_feedback").insert({
      response_id: response.id,
      concern_author_profile_id: author.profile.id,
      liked: false,
      comment_body: `duplicate-feedback-${crypto.randomUUID()}`,
    });

    expect(duplicateDelivery.error?.code).toBe("23505");
    expect(duplicateResponse.error?.code).toBe("23505");
    expect(firstFeedback.error).toBeNull();
    expect(duplicateFeedback.error?.code).toBe("23505");
  });

  it("marks notifications as read exactly once and preserves immutable columns", async () => {
    const serviceClient = createServiceClient();
    const owner = await createOnboardedUser();
    const relatedEntityId = crypto.randomUUID();
    const seededNotification = await insertNotification(serviceClient, {
      profileId: owner.profile.id,
      relatedEntityId,
      type: "response_received",
      relatedEntityType: "response",
    });

    const before = await owner.client
      .from("notifications")
      .select("id, profile_id, type, related_entity_type, related_entity_id, read_at, created_at")
      .eq("id", seededNotification.id)
      .single();

    expect(before.error).toBeNull();
    expect(before.data?.read_at).toBeNull();

    const firstMark = await owner.client.rpc("mark_notification_read", {
      p_notification_id: seededNotification.id,
    });
    const afterFirst = await owner.client
      .from("notifications")
      .select("id, profile_id, type, related_entity_type, related_entity_id, read_at, created_at")
      .eq("id", seededNotification.id)
      .single();
    const secondMark = await owner.client.rpc("mark_notification_read", {
      p_notification_id: seededNotification.id,
    });

    expect(firstMark.error).toBeNull();
    expect(firstMark.data).toBe(true);
    expect(afterFirst.error).toBeNull();
    expect(afterFirst.data?.read_at).not.toBeNull();
    expect(afterFirst.data).toMatchObject({
      id: before.data?.id,
      profile_id: before.data?.profile_id,
      type: before.data?.type,
      related_entity_type: before.data?.related_entity_type,
      related_entity_id: before.data?.related_entity_id,
      created_at: before.data?.created_at,
    });
    expect(secondMark.error).toBeNull();
    expect(secondMark.data).toBe(false);
  });
});
