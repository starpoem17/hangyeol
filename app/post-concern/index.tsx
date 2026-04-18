import { useEffect } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useSessionContext } from "@/features/session/context";

export default function PostConcernIndexScreen() {
  const router = useRouter();
  const { isLoading: isSessionLoading, session } = useSessionContext();

  useEffect(() => {
    if (!isSessionLoading && !session) {
      router.replace("/");
    }
  }, [isSessionLoading, router, session]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Phase 6</Text>
        <Text style={styles.title}>이번 단계에서는 My concerns 보기만 연결합니다.</Text>
        <Text style={styles.description}>
          고민 작성 UI는 아직 이 범위에 포함되지 않습니다. 내가 작성한 실제 고민과 도착한 답변만 여기서 확인할 수 있게 합니다.
        </Text>
        <Pressable onPress={() => router.push("/post-concern/my-concerns")} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>My concerns 열기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f8fafc",
  },
  card: {
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 20,
  },
  eyebrow: {
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  title: {
    marginTop: 10,
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 30,
  },
  description: {
    marginTop: 12,
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
  },
  primaryButton: {
    marginTop: 20,
    alignSelf: "flex-start",
    borderRadius: 14,
    backgroundColor: "#0f172a",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
  },
});
