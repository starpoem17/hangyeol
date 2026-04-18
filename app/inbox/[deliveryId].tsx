import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getInboxDeliveryDetail, getInboxResponseByDeliveryId, markConcernDeliveryOpened } from "@/features/inbox/api";
import type { InboxDeliveryDetail, InboxResponse } from "@/features/inbox/types";
import { submitResponse, type SubmitResponseFailure } from "@/features/responses/api";
import { validateSubmitResponsePayload } from "@/features/responses/validation";
import { useSessionContext } from "@/features/session/context";
import { supabase } from "@/lib/supabase";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function InboxDetailScreen() {
  const router = useRouter();
  const { deliveryId } = useLocalSearchParams<{ deliveryId?: string }>();
  const { isLoading: isSessionLoading, session } = useSessionContext();
  const [delivery, setDelivery] = useState<InboxDeliveryDetail | null>(null);
  const [response, setResponse] = useState<InboxResponse | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error" | "not_found">("loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!isSessionLoading && !session) {
      router.replace("/");
    }
  }, [isSessionLoading, router, session]);

  useFocusEffect(
    useCallback(() => {
      if (isSessionLoading || !session) {
        return () => undefined;
      }

      if (typeof deliveryId !== "string") {
        setLoadState("not_found");
        setDelivery(null);
        setResponse(null);
        return () => undefined;
      }

      const resolvedDeliveryId = deliveryId;
      let isActive = true;

      async function load() {
        setLoadState("loading");
        setLoadErrorMessage(null);

        try {
          let nextDelivery = await getInboxDeliveryDetail(supabase, resolvedDeliveryId);

          if (!isActive) {
            return;
          }

          if (!nextDelivery) {
            setDelivery(null);
            setResponse(null);
            setLoadState("not_found");
            return;
          }

          if (nextDelivery.status === "assigned") {
            await markConcernDeliveryOpened(supabase, resolvedDeliveryId);
            nextDelivery = await getInboxDeliveryDetail(supabase, resolvedDeliveryId);

            if (!isActive) {
              return;
            }

            if (!nextDelivery) {
              setDelivery(null);
              setResponse(null);
              setLoadState("not_found");
              return;
            }
          }

          const nextResponse = await getInboxResponseByDeliveryId(supabase, resolvedDeliveryId);

          if (!isActive) {
            return;
          }

          setDelivery(nextDelivery);
          setResponse(nextResponse);
          setLoadState("ready");
        } catch {
          if (!isActive) {
            return;
          }

          setLoadErrorMessage("상세 화면을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.");
          setLoadState("error");
        }
      }

      void load();

      return () => {
        isActive = false;
      };
    }, [deliveryId, isSessionLoading, reloadNonce, session]),
  );

  const validation =
    typeof deliveryId === "string"
      ? validateSubmitResponsePayload({
          deliveryId,
          body: draftBody,
        })
      : {
          success: false as const,
          error: {
            code: "invalid_delivery_id" as const,
            userMessage: "대상 고민을 다시 확인해 주세요.",
          },
        };

  const draftError = hasTriedSubmit && !validation.success ? validation.error.userMessage : null;
  const canSubmit = loadState === "ready" && delivery?.status !== "responded" && !response && !isSubmitting && validation.success;

  const handleSubmit = async () => {
    setHasTriedSubmit(true);
    setSubmitMessage(null);

    if (!validation.success || typeof deliveryId !== "string") {
      return;
    }

    const resolvedDeliveryId = deliveryId;
    setIsSubmitting(true);

    try {
      const result = await submitResponse(supabase, {
        deliveryId: resolvedDeliveryId,
        body: draftBody,
      });

      if (result.status === "blocked") {
        setSubmitMessage(result.userMessage);
        return;
      }

      setDraftBody("");
      setHasTriedSubmit(false);

      const nextDelivery = await getInboxDeliveryDetail(supabase, resolvedDeliveryId);
      const nextResponse = await getInboxResponseByDeliveryId(supabase, resolvedDeliveryId);

      if (!nextDelivery) {
        setDelivery(null);
        setResponse(null);
        setLoadState("not_found");
        return;
      }

      setDelivery(nextDelivery);
      setResponse(nextResponse);
      setLoadState("ready");
    } catch (error) {
      const failure = error as SubmitResponseFailure;

      if (failure.kind === "application" && failure.code === "delivery_not_accessible") {
        setDelivery(null);
        setResponse(null);
        setLoadState("not_found");
        return;
      }

      if (failure.kind === "application" && failure.code === "delivery_already_responded") {
        const nextDelivery = await getInboxDeliveryDetail(supabase, resolvedDeliveryId);
        const nextResponse = await getInboxResponseByDeliveryId(supabase, resolvedDeliveryId);

        if (nextDelivery) {
          setDelivery(nextDelivery);
          setResponse(nextResponse);
          setLoadState("ready");
        }
      }

      setSubmitMessage(failure.userMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSessionLoading || loadState === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>상세 내용을 동기화하고 있어요.</Text>
      </View>
    );
  }

  if (loadState === "error") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>상세 내용을 불러오지 못했어요</Text>
        <Text style={styles.description}>{loadErrorMessage}</Text>
        <Pressable onPress={() => setReloadNonce((value) => value + 1)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }

  if (loadState === "not_found" || !delivery) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>접근할 수 없는 고민이에요</Text>
        <Text style={styles.description}>전달되지 않았거나 이미 확인할 수 없는 대상입니다.</Text>
        <Pressable onPress={() => router.replace("/inbox")} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Inbox로 돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.concernCard}>
          <Text style={styles.metaText}>전달됨 {formatDateTime(delivery.deliveredAt)}</Text>
          <Text style={styles.concernBody}>{delivery.concern.body}</Text>
        </View>

        {response ? (
          <View style={styles.responseCard}>
            <Text style={styles.sectionEyebrow}>제출한 답변</Text>
            <Text style={styles.metaText}>{formatDateTime(response.createdAt)}</Text>
            <Text style={styles.responseBody}>{response.body}</Text>
          </View>
        ) : (
          <View style={styles.composeCard}>
            <Text style={styles.sectionEyebrow}>답변 작성</Text>
            <TextInput
              multiline
              editable={!isSubmitting}
              onChangeText={setDraftBody}
              placeholder="이 고민에 전하고 싶은 답변을 적어주세요."
              placeholderTextColor="#94a3b8"
              style={styles.input}
              textAlignVertical="top"
              value={draftBody}
            />
            {draftError ? <Text style={styles.errorText}>{draftError}</Text> : null}
            {submitMessage ? <Text style={styles.errorText}>{submitMessage}</Text> : null}
            <Pressable disabled={!canSubmit} onPress={handleSubmit} style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}>
              {isSubmitting ? <ActivityIndicator color="#f8fafc" /> : <Text style={styles.submitButtonText}>답변 제출</Text>}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 16,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    backgroundColor: "#f8fafc",
  },
  loadingText: {
    marginTop: 16,
    color: "#334155",
    fontSize: 16,
  },
  title: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    marginTop: 12,
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 24,
    backgroundColor: "#0f172a",
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
  },
  concernCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  composeCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: "#dbeafe",
  },
  responseCard: {
    backgroundColor: "#eef2ff",
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  sectionEyebrow: {
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "700",
  },
  metaText: {
    marginTop: 8,
    color: "#64748b",
    fontSize: 13,
  },
  concernBody: {
    marginTop: 16,
    color: "#0f172a",
    fontSize: 18,
    lineHeight: 28,
    fontWeight: "600",
  },
  responseBody: {
    marginTop: 16,
    color: "#1e293b",
    fontSize: 16,
    lineHeight: 26,
  },
  input: {
    minHeight: 180,
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: "#0f172a",
    fontSize: 16,
    lineHeight: 24,
  },
  errorText: {
    marginTop: 12,
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    marginTop: 18,
    backgroundColor: "#0f172a",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitButtonText: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
  },
});
