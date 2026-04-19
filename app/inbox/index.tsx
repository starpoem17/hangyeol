import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { listInboxDeliveries } from "@/features/inbox/api";
import type { InboxDeliveryListItem } from "@/features/inbox/types";
import { useSessionContext } from "@/features/session/context";
import { supabase } from "@/lib/supabase";

function formatRelativeDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildConcernPreview(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();

  if (normalized.length <= 72) {
    return normalized;
  }

  return `${normalized.slice(0, 72)}...`;
}

const STATUS_LABELS: Record<InboxDeliveryListItem["status"], string> = {
  assigned: "새 고민",
  opened: "읽는 중",
  responded: "답변 완료",
};

function EntryActions({ onOpenNotifications, onOpenPostConcern }: { onOpenNotifications: () => void; onOpenPostConcern: () => void }) {
  return (
    <View style={styles.entryActions}>
      <Pressable onPress={onOpenPostConcern} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Post concern</Text>
      </Pressable>
      <Pressable onPress={onOpenNotifications} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Notifications</Text>
      </Pressable>
    </View>
  );
}

export default function InboxListScreen() {
  const router = useRouter();
  const { isLoading: isSessionLoading, session } = useSessionContext();
  const [items, setItems] = useState<InboxDeliveryListItem[]>([]);
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
          const nextItems = await listInboxDeliveries(supabase);

          if (!isActive) {
            return;
          }

          setItems(nextItems);
        } catch {
          if (!isActive) {
            return;
          }

          setErrorMessage("Inbox를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.");
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
        <Text style={styles.loadingText}>Inbox를 불러오고 있어요.</Text>
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.centered}>
        <EntryActions onOpenNotifications={() => router.push("/notifications")} onOpenPostConcern={() => router.push("/post-concern")} />
        <Text style={styles.title}>Inbox를 불러오지 못했어요</Text>
        <Text style={styles.description}>{errorMessage}</Text>
        <Pressable
          onPress={() => setReloadNonce((value) => value + 1)}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>다시 불러오기</Text>
        </Pressable>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.centered}>
        <EntryActions onOpenNotifications={() => router.push("/notifications")} onOpenPostConcern={() => router.push("/post-concern")} />
        <Text style={styles.title}>아직 전달된 고민이 없어요</Text>
        <Text style={styles.description}>새 고민이 도착하면 이곳에서 바로 확인할 수 있어요.</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <EntryActions onOpenNotifications={() => router.push("/notifications")} onOpenPostConcern={() => router.push("/post-concern")} />
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/inbox/[deliveryId]",
              params: {
                deliveryId: item.id,
              },
            })
          }
          style={styles.card}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.badge}>{STATUS_LABELS[item.status]}</Text>
            <Text style={styles.metaText}>{formatRelativeDateTime(item.deliveredAt)}</Text>
          </View>
          <Text style={styles.preview}>{buildConcernPreview(item.concern.body)}</Text>
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
    marginTop: 28,
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
  entryActions: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  badge: {
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "700",
  },
  metaText: {
    color: "#64748b",
    fontSize: 13,
  },
  preview: {
    marginTop: 14,
    color: "#0f172a",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
  },
});
