import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";

import { getAllRecords, initDB, deleteRecord } from "../database";
import { calcPL } from "../plUtils";

type RootStackParamList = {
  Home: undefined;
  AddRecord: undefined;
  EditRecord: { record: Record };
};

type HomeNavProp = NativeStackNavigationProp<RootStackParamList, "Home">;

type Record = {
  id: number;
  image_uri: string;
  stock_code: string;
  tags: string;
  note: string;
  created_at: string;
  entry_price: number | null;
  exit_price: number | null;
  quantity: number | null;
  direction: "long" | "short";
};

// 格式化时间：YYYY-MM-DD HH:mm（SQLite 存的是 UTC，手动转 UTC+8）
function formatDate(raw: string): string {
  // SQLite CURRENT_TIMESTAMP 格式为 "YYYY-MM-DD HH:MM:SS"，需补 Z 标记为 UTC
  const normalized =
    raw.includes("T") || raw.endsWith("Z") ? raw : raw.replace(" ", "T") + "Z";
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return raw;
  // 偏移 +8 小时
  const utc8 = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${utc8.getUTCFullYear()}-${pad(utc8.getUTCMonth() + 1)}-${pad(utc8.getUTCDate())}  ${pad(utc8.getUTCHours())}:${pad(utc8.getUTCMinutes())}`;
}

export default function HomeScreen() {
  const navigation = useNavigation<HomeNavProp>();

  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  // 每次页面聚焦（包括从 AddRecord 返回）都重新拉取数据
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          await initDB();
          const data = await getAllRecords();
          if (active) setRecords(data);
        } catch (e) {
          Alert.alert("加载失败", String(e));
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  function handleDelete(item: Record) {
    Alert.alert(
      "删除记录",
      `确定要删除「${item.stock_code || "该记录"}」吗？`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteRecord(item.id);
              setRecords((prev) => prev.filter((r) => r.id !== item.id));
            } catch (e) {
              Alert.alert("删除失败", String(e));
            }
          },
        },
      ],
    );
  }

  function renderItem({ item }: { item: Record }) {
    const tagList = item.tags
      ? item.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.95}
        onPress={() => navigation.navigate("EditRecord", { record: item })}
        onLongPress={() => handleDelete(item)}
        delayLongPress={400}
      >
        {/* 缩略图 */}
        <TouchableOpacity
          onPress={() => setPreviewUri(item.image_uri)}
          activeOpacity={0.85}
          style={styles.thumbContainer}
        >
          <Image
            source={{ uri: item.image_uri }}
            style={styles.thumb}
            resizeMode="cover"
          />
        </TouchableOpacity>

        {/* 右侧信息 */}
        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={styles.stockCode} numberOfLines={1}>
              {item.stock_code || "未填写代码"}
            </Text>
            <Text style={styles.date}>{formatDate(item.created_at)}</Text>
          </View>

          {/* P/L 徽章 */}
          {(() => {
            const pl = calcPL(
              item.entry_price,
              item.exit_price,
              item.quantity,
              item.direction ?? "long",
            );
            if (!pl) return null;
            const isWin = pl.pl >= 0;
            const sign = isWin ? "+" : "";
            return (
              <View
                style={[
                  styles.plBadge,
                  isWin ? styles.plBadgeWin : styles.plBadgeLoss,
                ]}
              >
                <Text
                  style={[
                    styles.plBadgeText,
                    isWin ? styles.plBadgeWinText : styles.plBadgeLossText,
                  ]}
                >
                  {isWin ? "▲" : "▼"} {sign}
                  {pl.pl.toFixed(2)} ({sign}
                  {pl.plPct.toFixed(2)}%)
                </Text>
              </View>
            );
          })()}

          {item.note ? (
            <Text style={styles.note} numberOfLines={3}>
              {item.note}
            </Text>
          ) : null}

          {tagList.length > 0 && (
            <View style={styles.tagRow}>
              {tagList.map((tag, i) => (
                <View key={i} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* 标题栏 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>复盘日记</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate("AddRecord")}
          activeOpacity={0.8}
        >
          <Text style={styles.addButtonText}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* 列表 */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1a73e8" />
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={
            records.length === 0 ? styles.emptyContainer : styles.listContent
          }
          ListEmptyComponent={
            <View style={styles.emptyInner}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>还没有复盘记录</Text>
              <Text style={styles.emptyHint}>点击右上角 ＋ 添加第一条</Text>
            </View>
          }
        />
      )}

      {/* 全屏图片预览 Modal */}
      <Modal
        visible={previewUri !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUri(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPreviewUri(null)}
        >
          {previewUri && (
            <Image
              source={{ uri: previewUri }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          )}
          <Text style={styles.closeHint}>点击任意处关闭</Text>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },

  // 标题栏
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1a73e8",
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: {
    color: "#fff",
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "400",
  },

  // 列表
  listContent: {
    padding: 14,
    paddingBottom: 30,
  },
  emptyContainer: {
    flex: 1,
  },

  // 卡片
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 14,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  thumbContainer: {
    width: 100,
    height: 100,
  },
  thumb: {
    width: 100,
    height: 100,
  },
  cardBody: {
    flex: 1,
    padding: 12,
    justifyContent: "space-between",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  stockCode: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
    flex: 1,
    marginRight: 8,
  },
  date: {
    fontSize: 11,
    color: "#aaa",
  },
  note: {
    fontSize: 13,
    color: "#555",
    lineHeight: 19,
    marginBottom: 6,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    backgroundColor: "#e8f0fe",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 12,
    color: "#1a73e8",
  },

  // P/L 徽章
  plBadge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
  },
  plBadgeWin: { backgroundColor: "#e6f4ea" },
  plBadgeLoss: { backgroundColor: "#fce8e6" },
  plBadgeText: { fontSize: 12, fontWeight: "700" },
  plBadgeWinText: { color: "#2ea84f" },
  plBadgeLossText: { color: "#ea4335" },

  // 空状态
  emptyInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 120,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#999",
  },
  emptyHint: {
    marginTop: 6,
    fontSize: 13,
    color: "#bbb",
  },

  // 加载中
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // 图片预览 Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullImage: {
    width: "100%",
    height: "85%",
  },
  closeHint: {
    marginTop: 16,
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
  },
});
