import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import { initDB, getThisWeekRecords } from "../database";
import { generateWeeklyReport } from "../aiCoach";

// ── 类型 ──────────────────────────────────────────────────
type DBRecord = {
  id: number;
  image_uri: string;
  stock_code: string;
  tags: string;
  note: string;
  created_at: string;
};

type HeatmapCell = {
  label: string; // 周一~周日
  count: number;
};

// ── 数据聚合工具函数 ──────────────────────────────────────

/** 统计出现次数最多的非空字符串 */
function topItem(items: string[]): string {
  if (items.length === 0) return "—";
  const counter: Record<string, number> = {};
  items.forEach((s) => {
    if (s) counter[s] = (counter[s] ?? 0) + 1;
  });
  return Object.entries(counter).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
}

/** 生成本周一到今天共7格的热力图数据（UTC+8） */
function buildHeatmap(records: DBRecord[]): HeatmapCell[] {
  const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const cells: HeatmapCell[] = DAY_LABELS.map((label) => ({ label, count: 0 }));

  records.forEach((r) => {
    const normalized =
      r.created_at.includes("T") || r.created_at.endsWith("Z")
        ? r.created_at
        : r.created_at.replace(" ", "T") + "Z";
    const d = new Date(new Date(normalized).getTime() + 8 * 3600 * 1000);
    // getUTCDay: 0=周日, 1=周一 ... 6=周六
    const dow = d.getUTCDay();
    const idx = dow === 0 ? 6 : dow - 1; // 转成 0=周一
    cells[idx].count += 1;
  });
  return cells;
}

/** 热力图格子颜色 */
function heatColor(count: number): string {
  if (count === 0) return "#e8e8e8";
  if (count === 1) return "#c6efce";
  if (count === 2) return "#70c88a";
  if (count <= 4) return "#2ea84f";
  return "#1a6630";
}

// ── 主组件 ────────────────────────────────────────────────

export default function ReportScreen() {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<DBRecord[]>([]);

  // AI 状态
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          await initDB();
          const data = await getThisWeekRecords();
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

  // ── 聚合计算 ────────────────────────────────────────────
  const totalOps = records.length;

  const topStock = topItem(records.map((r) => r.stock_code).filter(Boolean));
  const stockCount = records.filter((r) => r.stock_code === topStock).length;

  const allTags = records.flatMap((r) =>
    r.tags
      ? r.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
  );
  const topTag = topItem(allTags);

  const heatmap = buildHeatmap(records);

  // ── AI 请求 ─────────────────────────────────────────────
  async function handleGenerateReport() {
    setAiLoading(true);
    setAiResult(null);
    try {
      const result = await generateWeeklyReport(
        records.map((r) => ({
          stock_code: r.stock_code,
          tags: r.tags,
          note: r.note,
        })),
      );
      setAiResult(result);
    } catch (e) {
      Alert.alert("AI 请求失败", String(e));
    } finally {
      setAiLoading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1a73e8" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>周报</Text>
        <Text style={styles.headerSub}>过去 7 天复盘总结</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* ── 模块 1：本周活跃度热力图 ── */}
        <SectionTitle title="本周活跃度" />
        <View style={styles.block}>
          <View style={styles.heatmapRow}>
            {heatmap.map((cell) => (
              <View key={cell.label} style={styles.heatCell}>
                <View
                  style={[
                    styles.heatBox,
                    { backgroundColor: heatColor(cell.count) },
                  ]}
                />
                <Text style={styles.heatLabel}>{cell.label}</Text>
                {cell.count > 0 && (
                  <Text style={styles.heatCount}>{cell.count}</Text>
                )}
              </View>
            ))}
          </View>
        </View>

        {/* ── 模块 2：核心结论 ── */}
        <SectionTitle title="核心结论" />
        {totalOps === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyText}>本周暂无复盘记录 📭</Text>
          </View>
        ) : (
          <View style={styles.highlightBlock}>
            <HighlightRow
              icon="📊"
              label="本周操作次数"
              value={`${totalOps} 次`}
            />
            <Divider />
            <HighlightRow
              icon="👑"
              label="最受宠股票"
              value={
                topStock !== "—"
                  ? `${topStock}（操作了 ${stockCount} 次）`
                  : "—"
              }
            />
            <Divider />
            <HighlightRow
              icon="🎭"
              label="核心策略/情绪"
              value={topTag !== "—" ? topTag : "—"}
            />
          </View>
        )}

        {/* ── 模块 3：图文时间轴画廊 ── */}
        {records.length > 0 && (
          <>
            <SectionTitle title="本周战场回顾" />
            <FlatList
              data={records}
              keyExtractor={(item) => String(item.id)}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryList}
              renderItem={({ item }) => (
                <View style={styles.galleryCard}>
                  <Image
                    source={{ uri: item.image_uri }}
                    style={styles.galleryImage}
                    resizeMode="cover"
                  />
                  <View style={styles.galleryInfo}>
                    <Text style={styles.galleryStock} numberOfLines={1}>
                      {item.stock_code || "—"}
                    </Text>
                    {item.tags ? (
                      <Text style={styles.galleryTag} numberOfLines={1}>
                        {item.tags}
                      </Text>
                    ) : null}
                  </View>
                </View>
              )}
            />
          </>
        )}

        {/* ── 模块 4：AI 交易教练 ── */}
        <SectionTitle title="AI 交易教练" />
        <View style={styles.block}>
          <TouchableOpacity
            style={[styles.aiButton, aiLoading && styles.aiButtonDisabled]}
            onPress={handleGenerateReport}
            disabled={aiLoading}
            activeOpacity={0.85}
          >
            {aiLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.aiButtonText}>✨ 生成 AI 周总结</Text>
            )}
          </TouchableOpacity>

          {aiLoading && <Text style={styles.aiHint}>正在请求 AI，请稍候…</Text>}

          {aiResult && (
            <View style={styles.aiResultBox}>
              <Text style={styles.aiResultTitle}>🤖 教练点评</Text>
              <Text style={styles.aiResultText}>{aiResult}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── 辅助小组件 ─────────────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  return (
    <View style={styles.sectionTitleWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function HighlightRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.highlightRow}>
      <Text style={styles.highlightIcon}>{icon}</Text>
      <View style={styles.highlightText}>
        <Text style={styles.highlightLabel}>{label}</Text>
        <Text style={styles.highlightValue}>{value}</Text>
      </View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

// ── 样式 ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#111" },
  headerSub: { fontSize: 12, color: "#999", marginTop: 2 },

  container: { padding: 14, paddingBottom: 60 },

  sectionTitleWrap: { marginBottom: 10, marginTop: 6 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#333" },

  block: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },

  // 热力图
  heatmapRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  heatCell: { alignItems: "center", flex: 1 },
  heatBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    marginBottom: 5,
  },
  heatLabel: { fontSize: 10, color: "#888" },
  heatCount: {
    fontSize: 10,
    fontWeight: "700",
    color: "#2ea84f",
    marginTop: 2,
  },

  // 核心结论
  highlightBlock: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  highlightRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  highlightIcon: { fontSize: 26, marginRight: 14 },
  highlightText: { flex: 1 },
  highlightLabel: { fontSize: 12, color: "#999", marginBottom: 3 },
  highlightValue: { fontSize: 15, fontWeight: "700", color: "#111" },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#f0f0f0",
  },

  // 空状态
  emptyBlock: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    marginBottom: 20,
  },
  emptyText: { color: "#bbb", fontSize: 14 },

  // 画廊
  galleryList: { paddingBottom: 20, paddingLeft: 2 },
  galleryCard: {
    width: 140,
    backgroundColor: "#fff",
    borderRadius: 12,
    marginRight: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
    elevation: 2,
  },
  galleryImage: { width: 140, height: 110 },
  galleryInfo: { padding: 8 },
  galleryStock: { fontSize: 13, fontWeight: "700", color: "#111" },
  galleryTag: { fontSize: 11, color: "#1a73e8", marginTop: 3 },

  // AI
  aiButton: {
    backgroundColor: "#1a73e8",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#1a73e8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  aiButtonDisabled: { opacity: 0.6 },
  aiButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  aiHint: {
    textAlign: "center",
    color: "#aaa",
    fontSize: 12,
    marginTop: 12,
  },
  aiResultBox: {
    marginTop: 16,
    backgroundColor: "#f8faff",
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: "#1a73e8",
  },
  aiResultTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1a73e8",
    marginBottom: 8,
  },
  aiResultText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 22,
  },
});
