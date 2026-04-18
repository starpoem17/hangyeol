import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getMyConcernDetail } from "@/features/my-concerns/api";
import type { MyConcernDetail } from "@/features/my-concerns/types";
import { listMyConcernResponses } from "@/features/my-concern-responses/api";
import type { MyConcernResponseListItem } from "@/features/my-concern-responses/types";
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

function buildResponsePreview(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();

  if (normalized.length <= 88) {
    return normalized;
  }

  return `${normalized.slice(0, 88)}...`;
}

export default function MyConcernDetailScreen() {
  const router = useRouter();
  const { concernId } = useLocalSearchParams<{ concernId?: string }>();
  const { isLoading: isSessionLoading, session } = useSessionContext();
  const [concern, setConcern] = useState<MyConcernDetail | null>(null);
  const [responses, setResponses] = useState<MyConcernResponseListItem[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error" | "not_found">("loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
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

      if (typeof concernId !== "string") {
        setConcern(null);
        setResponses([]);
        setLoadState("not_found");
        return () => undefined;
      }

      const resolvedConcernId = concernId;
      let isActive = true;

      async function load() {
        setLoadState("loading");
        setLoadErrorMessage(null);

        try {
          const [nextConcern, nextResponses] = await Promise.all([
            getMyConcernDetail(supabase, resolvedConcernId),
            listMyConcernResponses(supabase, resolvedConcernId),
          ]);

          if (!isActive) {
            return;
          }

          if (!nextConcern) {
            setConcern(null);
            setResponses([]);
            setLoadState("not_found");
            return;
          }

          setConcern(nextConcern);
          setResponses(nextResponses);
          setLoadState("ready");
        } catch {
          if (!isActive) {
            return;
          }

          setLoadErrorMessage("내 고민 상세를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.");
          setLoadState("error");
        }
      }

      void load();

      return () => {
        isActive = false;
      };
    }, [concernId, isSessionLoading, reloadNonce, session]),
  );

  if (isSessionLoading || loadState === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>내 고민과 답변을 불러오고 있어요.</Text>
      </View>
    );
  }

  if (loadState === "error") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>내 고민을 불러오지 못했어요</Text>
        <Text style={styles.description}>{loadErrorMessage}</Text>
        <Pressable onPress={() => setReloadNonce((value) => value + 1)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }

  if (loadState === "not_found" || !concern) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>접근할 수 없는 고민이에요</Text>
        <Text style={styles.description}>존재하지 않거나 지금 계정에서 볼 수 없는 고민입니다.</Text>
        <Pressable onPress={() => router.replace("/post-concern/my-concerns")} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>My concerns로 돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.concernCard}>
        <Text style={styles.metaText}>작성 시각 {formatDateTime(concern.createdAt)}</Text>
        <Text style={styles.concernBody}>{concern.body}</Text>
      </View>

      <View style={styles.responseSection}>
        <Text style={styles.sectionTitle}>도착한 답변</Text>
        {responses.length === 0 ? (
          <View style={styles.emptyResponseCard}>
            <Text style={styles.emptyResponseText}>아직 도착한 답변이 없어요.</Text>
          </View>
        ) : (
          responses.map((response) => (
            <Pressable
              key={response.responseId}
              onPress={() =>
                router.push({
                  pathname: "/post-concern/my-concerns/responses/[responseId]",
                  params: {
                    responseId: response.responseId,
                  },
                })
              }
              style={styles.responseCard}
            >
              <Text style={styles.metaText}>{formatDateTime(response.createdAt)}</Text>
              <Text style={styles.responsePreview}>{buildResponsePreview(response.body)}</Text>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 20,
  },
  metaText: {
    color: "#64748b",
    fontSize: 13,
  },
  concernBody: {
    marginTop: 12,
    color: "#0f172a",
    fontSize: 17,
    lineHeight: 26,
    fontWeight: "600",
  },
  responseSection: {
    gap: 12,
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "700",
  },
  emptyResponseCard: {
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 18,
  },
  emptyResponseText: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
  },
  responseCard: {
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 18,
  },
  responsePreview: {
    marginTop: 10,
    color: "#0f172a",
    fontSize: 15,
    lineHeight: 24,
    fontWeight: "600",
  },
});
