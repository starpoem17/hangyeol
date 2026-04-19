import { describe, expect, it } from "vitest";

import { buildExpoPushMessage } from "./push-message";

describe("buildExpoPushMessage", () => {
  it("builds the exact normalized payload contract with all-string data fields", () => {
    expect(
      buildExpoPushMessage({
        expoPushToken: "ExponentPushToken[token-1]",
        notificationId: "2d9426b0-1858-4d67-bfa0-572610df2b85",
        type: "response_received",
        relatedEntityType: "response",
        relatedEntityId: "0ff37297-8df3-4af6-a3d2-765588f2cf7a",
      }),
    ).toMatchObject({
      to: "ExponentPushToken[token-1]",
      sound: "default",
      data: {
        notificationId: "2d9426b0-1858-4d67-bfa0-572610df2b85",
        type: "response_received",
        relatedEntityType: "response",
        relatedEntityId: "0ff37297-8df3-4af6-a3d2-765588f2cf7a",
      },
    });
  });

  it("uses delivery-oriented copy for feedback result notifications", () => {
    const message = buildExpoPushMessage({
      expoPushToken: "ExponentPushToken[token-2]",
      notificationId: "2d9426b0-1858-4d67-bfa0-572610df2b85",
      type: "response_commented",
      relatedEntityType: "concern_delivery",
      relatedEntityId: "0ff37297-8df3-4af6-a3d2-765588f2cf7a",
    });

    expect(message.title).toContain("후기");
    expect(message.body).toContain("Inbox");
  });
});
