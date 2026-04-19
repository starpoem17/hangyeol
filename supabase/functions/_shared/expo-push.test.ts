import { afterEach, describe, expect, it, vi } from "vitest";

import { sendNotificationPushes } from "./expo-push";

function createServiceClient(tokens: Array<{ profile_id: string; expo_push_token: string }>) {
  const selectIn = vi.fn(async () => ({
    data: tokens,
    error: null,
  }));
  const deleteEq = vi.fn(async () => ({
    error: null,
  }));

  return {
    client: {
      from(table: string) {
        if (table === "push_tokens") {
          return {
            select() {
              return {
                in: selectIn,
              };
            },
            delete() {
              return {
                eq: deleteEq,
              };
            },
          };
        }

        throw new Error(`unexpected table ${table}`);
      },
    },
    selectIn,
    deleteEq,
  };
}

describe("sendNotificationPushes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("dispatches one Expo message per notification row instead of collapsing same-profile jobs", async () => {
    const { client, deleteEq, selectIn } = createServiceClient([
      {
        profile_id: "9d609f84-736f-4d3b-ac8b-7c2ca0fecb64",
        expo_push_token: "ExponentPushToken[token-1]",
      },
    ]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { status: "ok" },
          { status: "ok" },
        ],
      }),
    }));

    vi.stubGlobal("fetch", fetchMock);

    await sendNotificationPushes(client, [
      {
        notificationId: "9bcd2d79-c770-4125-ae1e-aa2c083c2076",
        profileId: "9d609f84-736f-4d3b-ac8b-7c2ca0fecb64",
        type: "response_liked",
        relatedEntityType: "concern_delivery",
        relatedEntityId: "bf1b23d1-a60f-4fda-ac9e-f8df3b150443",
      },
      {
        notificationId: "cf71e8aa-db17-47d0-9e7c-cd155fd25088",
        profileId: "9d609f84-736f-4d3b-ac8b-7c2ca0fecb64",
        type: "response_commented",
        relatedEntityType: "concern_delivery",
        relatedEntityId: "bf1b23d1-a60f-4fda-ac9e-f8df3b150443",
      },
    ]);

    expect(selectIn).toHaveBeenCalledWith("profile_id", ["9d609f84-736f-4d3b-ac8b-7c2ca0fecb64"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toMatchObject([
      {
        to: "ExponentPushToken[token-1]",
        data: {
          notificationId: "9bcd2d79-c770-4125-ae1e-aa2c083c2076",
          type: "response_liked",
        },
      },
      {
        to: "ExponentPushToken[token-1]",
        data: {
          notificationId: "cf71e8aa-db17-47d0-9e7c-cd155fd25088",
          type: "response_commented",
        },
      },
    ]);
    expect(deleteEq).not.toHaveBeenCalled();
  });
});
