import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { listMyConcerns } from "@/features/my-concerns/api";
import type { MyConcernListItem } from "@/features/my-concerns/types";
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

function buildConcernPreview(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();

  if (normalized.length <= 88) {
    return normalized;
  }

  return `${normalized.slice(0, 88)}...`;
}

export default function MyConcernsListScreen() {
  const router = useRouter();
  const { isLoading: isSessionLoading, session } = useSessionContext();
  const [items, setItems] = useState<MyConcernListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

      let isActive = true;

      async function load() {
        setIsLoading(true);
        setErrorMessage(null);

        try {
          const nextItems = await listMyConcerns(supabase);

          if (!isActive) {
            return;
          }

          setItems(nextItems);
        } catch {
          if (!isActive) {
            return;
          }

          setErrorMessage("내가 작성한 고민을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.");
        } finally {
          if (isActive) {
            setIsLoading(false);
          }
        }
      }

      void load();

      return () => {
        isActive = false;
      };
    }, [isSessionLoading, reloadNonce, session]),
  );

  if (isSessionLoading || (isLoading && items.length === 0)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>My concerns를 불러오고 있어요.</Text>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>My concerns를 불러오지 못했어요</Text>
        <Text style={styles.description}>{errorMessage}</Text>
        <Pressable onPress={() => setReloadNonce((value) => value + 1)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>다시 불러오기</Text>
        </Pressable>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>아직 작성한 실제 고민이 없어요</Text>
        <Text style={styles.description}>승인된 내 고민이 생기면 이곳에서 답변 도착 여부까지 함께 확인할 수 있어요.</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/post-concern/my-concerns/[concernId]",
              params: {
                concernId: item.id,
              },
            })
          }
          style={styles.card}
        >
          <Text style={styles.metaText}>{formatDateTime(item.createdAt)}</Text>
          <Text style={styles.preview}>{buildConcernPreview(item.body)}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
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
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 12,
  },
  card: {
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 18,
  },
  metaText: {
    color: "#64748b",
    fontSize: 13,
  },
  preview: {
    marginTop: 12,
    color: "#0f172a",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
  },
});
