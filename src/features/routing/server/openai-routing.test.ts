import { describe, expect, it, vi } from "vitest";

import { buildOpenAiRoutingRequestBody, parseOpenAiRoutingResponse, selectRespondersWithOpenAi } from "./openai-routing";

const routingInput = {
  required_delivery_count: 3 as const,
  concern_author: {
    gender: "female" as const,
    interests: ["study"],
    concern_body: "진로 고민",
  },
  eligible_candidates: [
    {
      profile_id: "6d53d533-fab4-40f8-b5a2-0e81cfcd25e4",
      gender: "male" as const,
      interests: ["study"],
      prior_concern_bodies: ["과거 고민 1"],
      prior_response_bodies: ["과거 답변 1"],
    },
    {
      profile_id: "863fd77e-c431-4ef6-8ea5-c28510d7c7fd",
      gender: "female" as const,
      interests: ["career_path"],
      prior_concern_bodies: ["과거 고민 2"],
      prior_response_bodies: ["과거 답변 2"],
    },
    {
      profile_id: "4f121b58-5070-4679-af94-02505ab4f7ec",
      gender: "male" as const,
      interests: ["anxiety"],
      prior_concern_bodies: ["과거 고민 3"],
      prior_response_bodies: ["과거 답변 3"],
    },
  ],
};

describe("openai routing", () => {
  it("builds the exact structured-output request body", () => {
    expect(buildOpenAiRoutingRequestBody(routingInput)).toEqual({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "The server already filtered the eligible responder pool. Return exactly the required number of responder profile ids from the provided eligible candidates. Never return ids outside the pool. Never return duplicates. If perfect matches do not exist, still choose the best available candidates from the eligible pool. Return only JSON that matches the supplied schema.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(routingInput),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "route_concern_selection",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              responder_profile_ids: {
                type: "array",
                items: {
                  type: "string",
                  format: "uuid",
                },
                minItems: 3,
                maxItems: 3,
              },
            },
            required: ["responder_profile_ids"],
          },
        },
      },
    });
  });

  it("accepts valid structured output from the verified output_text path", () => {
    expect(
      parseOpenAiRoutingResponse({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  responder_profile_ids: routingInput.eligible_candidates.map((candidate) => candidate.profile_id),
                }),
              },
            ],
          },
        ],
      }),
    ).toEqual({
      ok: true,
      responderProfileIds: routingInput.eligible_candidates.map((candidate) => candidate.profile_id),
      rawResponse: {
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  responder_profile_ids: routingInput.eligible_candidates.map((candidate) => candidate.profile_id),
                }),
              },
            ],
          },
        ],
      },
    });
  });

  it("rejects refusal content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "refusal",
                  refusal: "cannot comply",
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(
      selectRespondersWithOpenAi(routingInput, {
        apiKey: "test-key",
        fetchImpl,
      }),
    ).resolves.toEqual({
      ok: false,
      code: "routing_model_refused",
      rawResponse: {
        output: [
          {
            type: "message",
            content: [
              {
                type: "refusal",
                refusal: "cannot comply",
              },
            ],
          },
        ],
      },
    });
  });

  it("rejects 2xx payloads missing the verified structured-output path", async () => {
    await expect(
      selectRespondersWithOpenAi(routingInput, {
        apiKey: "test-key",
        fetchImpl: vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              output: [
                {
                  type: "message",
                  content: [
                    {
                      type: "unexpected_content",
                    },
                  ],
                },
              ],
            }),
            { status: 200 },
          ),
        ),
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "routing_output_missing",
    });
  });

  it("rejects malformed JSON in the verified output_text path", async () => {
    await expect(
      selectRespondersWithOpenAi(routingInput, {
        apiKey: "test-key",
        fetchImpl: vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              output: [
                {
                  type: "message",
                  content: [
                    {
                      type: "output_text",
                      text: "{not-json",
                    },
                  ],
                },
              ],
            }),
            { status: 200 },
          ),
        ),
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "routing_output_invalid",
    });
  });

  it("rejects schema mismatches, out-of-pool ids, duplicates, and wrong counts", async () => {
    const responses = [
      {
        responder_profile_ids: ["not-a-uuid", routingInput.eligible_candidates[1].profile_id],
      },
      {
        responder_profile_ids: [
          "13d8682f-0ba5-4268-8148-83c0d6d7c261",
          routingInput.eligible_candidates[0].profile_id,
          routingInput.eligible_candidates[1].profile_id,
        ],
      },
      {
        responder_profile_ids: [
          routingInput.eligible_candidates[0].profile_id,
          routingInput.eligible_candidates[0].profile_id,
          routingInput.eligible_candidates[1].profile_id,
        ],
      },
      {
        responder_profile_ids: [
          routingInput.eligible_candidates[0].profile_id,
          routingInput.eligible_candidates[1].profile_id,
        ],
      },
      {
        responder_profile_ids: [
          routingInput.eligible_candidates[0].profile_id,
          routingInput.eligible_candidates[1].profile_id,
          "33ecdb7a-7d4f-4f8b-92b1-141d771af443",
        ],
      },
    ];

    for (const rawResponse of responses) {
      await expect(
        selectRespondersWithOpenAi(routingInput, {
          apiKey: "test-key",
          fetchImpl: vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                output: [
                  {
                    type: "message",
                    content: [
                      {
                        type: "output_text",
                        text: JSON.stringify(rawResponse),
                      },
                    ],
                  },
                ],
              }),
              { status: 200 },
            ),
          ),
        }),
      ).resolves.toMatchObject({
        ok: false,
        code: "routing_output_invalid",
      });
    }
  });

  it("treats network and http failures as routing_unavailable", async () => {
    await expect(
      selectRespondersWithOpenAi(routingInput, {
        apiKey: "test-key",
        fetchImpl: vi.fn().mockRejectedValue(new Error("network down")),
      }),
    ).resolves.toEqual({
      ok: false,
      code: "routing_unavailable",
    });

    await expect(
      selectRespondersWithOpenAi(routingInput, {
        apiKey: "test-key",
        fetchImpl: vi.fn().mockResolvedValue(new Response("oops", { status: 500 })),
      }),
    ).resolves.toEqual({
      ok: false,
      code: "routing_unavailable",
    });
  });
});
