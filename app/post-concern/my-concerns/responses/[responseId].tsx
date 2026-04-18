import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { getMyConcernResponseDetail } from "@/features/my-concern-responses/api";
import type { MyConcernResponseDetail } from "@/features/my-concern-responses/types";
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

export default function MyConcernResponseDetailScreen() {
  const router = useRouter();
  const { responseId } = useLocalSearchParams<{ responseId?: string }>();
  const { isLoading: isSessionLoading, session } = useSessionContext();
  const [responseDetail, setResponseDetail] = useState<MyConcernResponseDetail | null>(null);
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

      if (typeof responseId !== "string") {
        setResponseDetail(null);
        setLoadState("not_found");
        return () => undefined;
      }

      const resolvedResponseId = responseId;
      let isActive = true;

      async function load() {
        setLoadState("loading");
        setLoadErrorMessage(null);

        try {
          const nextResponseDetail = await getMyConcernResponseDetail(supabase, resolvedResponseId);

          if (!isActive) {
            return;
          }

          if (!nextResponseDetail) {
            setResponseDetail(null);
            setLoadState("not_found");
            return;
          }

          setResponseDetail(nextResponseDetail);
          setLoadState("ready");
        } catch {
          if (!isActive) {
            return;
          }

          setLoadErrorMessage("답변 상세를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.");
          setLoadState("error");
        }
      }

      void load();

      return () => {
        isActive = false;
      };
    }, [isSessionLoading, reloadNonce, responseId, session]),
  );

  if (isSessionLoading || loadState === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>답변 상세를 불러오고 있어요.</Text>
      </View>
    );
  }

  if (loadState === "error") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>답변 상세를 불러오지 못했어요</Text>
        <Text style={styles.description}>{loadErrorMessage}</Text>
        <Pressable onPress={() => setReloadNonce((value) => value + 1)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }

  if (loadState === "not_found" || !responseDetail) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>접근할 수 없는 답변이에요</Text>
        <Text style={styles.description}>존재하지 않거나 지금 계정에서 볼 수 없는 답변입니다.</Text>
        <Pressable onPress={() => router.replace("/post-concern/my-concerns")} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>My concerns로 돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.responseCard}>
        <Text style={styles.metaText}>{formatDateTime(responseDetail.createdAt)}</Text>
        <Text style={styles.responseBody}>{responseDetail.body}</Text>
      </View>

      <Pressable
        onPress={() =>
          router.push({
            pathname: "/post-concern/my-concerns/[concernId]",
            params: {
              concernId: responseDetail.concernId,
            },
          })
        }
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>해당 고민으로 돌아가기</Text>
      </Pressable>
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
  responseCard: {
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
  responseBody: {
    marginTop: 12,
    color: "#0f172a",
    fontSize: 17,
    lineHeight: 26,
    fontWeight: "600",
  },
  primaryButton: {
    alignSelf: "flex-start",
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
});
