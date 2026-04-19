import { describe, expect, it, vi } from "vitest";

import type { SaveFeedbackRpcRow } from "./handler";
import { handleSaveResponseFeedbackRequest } from "./handler";

function createRpcNotificationRow(
  overrides: Partial<SaveFeedbackRpcRow> = {},
): SaveFeedbackRpcRow {
  return {
    feedback_id: "b75583a3-8372-4f08-b8a3-9c6bc1904d4d",
    result_code: "saved",
    notification_id: "e86cd6d0-a42e-4b3f-a507-6c1fb7c31c00",
    notification_profile_id: "da9b7e68-f249-4c31-b7a8-95ca1ff4c291",
    notification_type: "response_liked",
    notification_related_entity_type: "concern_delivery",
    notification_related_entity_id: "7931f724-cf8d-4c1f-b4f1-b99623a74eb9",
    ...overrides,
  };
}

describe("handleSaveResponseFeedbackRequest", () => {
  it("preserves two notification rows from the RPC result and passes both push jobs through the edge-function path", async () => {
    const requireAuthenticatedUserId = vi.fn(async () => "13ec7ee5-2fdb-4648-b3e9-d0d305f1386d");
    const loadProfileId = vi.fn(async () => "13ec7ee5-2fdb-4648-b3e9-d0d305f1386d");
    const saveFeedback = vi.fn(async () => [
      createRpcNotificationRow({
        notification_id: "fe4f9161-9c8c-442e-a47b-cb4d61dd5200",
        notification_type: "response_liked",
      }),
      createRpcNotificationRow({
        notification_id: "e4f86efb-f266-441c-977e-a0c79d54b7ab",
        notification_type: "response_commented",
      }),
    ]);
    const sendNotificationPushes = vi.fn(async () => undefined);
    const logError = vi.fn();

    const response = await handleSaveResponseFeedbackRequest(
      new Request("http://localhost/save-response-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({
          responseId: "e4e7ce0e-3673-4d5d-8774-13718ec7167f",
          liked: true,
          commentBody: "정말 도움이 됐어요.",
        }),
      }),
      {
        requireAuthenticatedUserId,
        loadProfileId,
        saveFeedback,
        sendNotificationPushes,
        logError,
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      resultCode: "saved",
    });
    expect(saveFeedback).toHaveBeenCalledWith({
      actorProfileId: "13ec7ee5-2fdb-4648-b3e9-d0d305f1386d",
      responseId: "e4e7ce0e-3673-4d5d-8774-13718ec7167f",
      liked: true,
      commentBody: "정말 도움이 됐어요.",
    });
    expect(sendNotificationPushes).toHaveBeenCalledTimes(1);
    expect(sendNotificationPushes).toHaveBeenCalledWith([
      {
        notificationId: "fe4f9161-9c8c-442e-a47b-cb4d61dd5200",
        profileId: "da9b7e68-f249-4c31-b7a8-95ca1ff4c291",
        type: "response_liked",
        relatedEntityType: "concern_delivery",
        relatedEntityId: "7931f724-cf8d-4c1f-b4f1-b99623a74eb9",
      },
      {
        notificationId: "e4f86efb-f266-441c-977e-a0c79d54b7ab",
        profileId: "da9b7e68-f249-4c31-b7a8-95ca1ff4c291",
        type: "response_commented",
        relatedEntityType: "concern_delivery",
        relatedEntityId: "7931f724-cf8d-4c1f-b4f1-b99623a74eb9",
      },
    ]);
    expect(logError).not.toHaveBeenCalled();
  });
});
