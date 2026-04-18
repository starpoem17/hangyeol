import { OpenAiRoutingOutputSchema, type OpenAiRoutingInput } from "../contracts.ts";

export type OpenAiRoutingSelectionSuccess = {
  ok: true;
  responderProfileIds: string[];
  rawResponse: unknown;
};

export type OpenAiRoutingSelectionFailure = {
  ok: false;
  code: "routing_unavailable" | "routing_model_refused" | "routing_output_missing" | "routing_output_invalid";
  rawResponse?: unknown;
};

type FetchLike = typeof fetch;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findFirstMessageContent(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.output)) {
    return null;
  }

  const message = payload.output.find(
    (item): item is Record<string, unknown> =>
      isRecord(item) && item.type === "message" && Array.isArray(item.content),
  );

  if (!message || !Array.isArray(message.content)) {
    return null;
  }

  return message.content.find((item): item is Record<string, unknown> => isRecord(item)) ?? null;
}

export function buildOpenAiRoutingRequestBody(input: OpenAiRoutingInput) {
  return {
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
            text: JSON.stringify(input),
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
              minItems: input.required_delivery_count,
              maxItems: input.required_delivery_count,
            },
          },
          required: ["responder_profile_ids"],
        },
      },
    },
  };
}

export function parseOpenAiRoutingResponse(
  payload: unknown,
): OpenAiRoutingSelectionSuccess | OpenAiRoutingSelectionFailure {
  const content = findFirstMessageContent(payload);

  if (!content) {
    return {
      ok: false,
      code: "routing_output_missing",
      rawResponse: payload,
    };
  }

  if (content.type === "refusal" && typeof content.refusal === "string") {
    return {
      ok: false,
      code: "routing_model_refused",
      rawResponse: payload,
    };
  }

  if (content.type !== "output_text" || typeof content.text !== "string") {
    return {
      ok: false,
      code: "routing_output_missing",
      rawResponse: payload,
    };
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(content.text);
  } catch {
    return {
      ok: false,
      code: "routing_output_invalid",
      rawResponse: payload,
    };
  }

  const schemaResult = OpenAiRoutingOutputSchema.safeParse(parsedJson);

  if (!schemaResult.success) {
    return {
      ok: false,
      code: "routing_output_invalid",
      rawResponse: payload,
    };
  }

  return {
    ok: true,
    responderProfileIds: schemaResult.data.responder_profile_ids,
    rawResponse: payload,
  };
}

export function validateOpenAiResponderSelection(input: {
  responderProfileIds: string[];
  eligibleProfileIds: string[];
  requiredDeliveryCount: 1 | 2 | 3;
}): OpenAiRoutingSelectionSuccess | OpenAiRoutingSelectionFailure {
  const eligibleProfileIds = new Set(input.eligibleProfileIds);
  const uniqueProfileIds = new Set(input.responderProfileIds);

  if (
    input.responderProfileIds.length !== input.requiredDeliveryCount ||
    uniqueProfileIds.size !== input.responderProfileIds.length ||
    input.responderProfileIds.some((profileId) => !eligibleProfileIds.has(profileId))
  ) {
    return {
      ok: false,
      code: "routing_output_invalid",
    };
  }

  return {
    ok: true,
    responderProfileIds: input.responderProfileIds,
    rawResponse: null,
  };
}

export async function selectRespondersWithOpenAi(
  input: OpenAiRoutingInput,
  dependencies: {
    apiKey: string;
    fetchImpl?: FetchLike;
  },
): Promise<OpenAiRoutingSelectionSuccess | OpenAiRoutingSelectionFailure> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;

  let response: Response;

  try {
    response = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${dependencies.apiKey}`,
      },
      body: JSON.stringify(buildOpenAiRoutingRequestBody(input)),
    });
  } catch {
    return {
      ok: false,
      code: "routing_unavailable",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: "routing_unavailable",
    };
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      code: "routing_output_invalid",
    };
  }

  const parsed = parseOpenAiRoutingResponse(payload);

  if (!parsed.ok) {
    return parsed;
  }

  const validated = validateOpenAiResponderSelection({
    responderProfileIds: parsed.responderProfileIds,
    eligibleProfileIds: input.eligible_candidates.map((candidate) => candidate.profile_id),
    requiredDeliveryCount: input.required_delivery_count,
  });

  if (!validated.ok) {
    return {
      ...validated,
      rawResponse: payload,
    };
  }

  return {
    ok: true,
    responderProfileIds: parsed.responderProfileIds,
    rawResponse: payload,
  };
}
