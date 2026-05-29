import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import JSZip from "jszip";
import {
  documentDirectory,
  cacheDirectory,
  copyAsync,
  getInfoAsync,
  makeDirectoryAsync,
  readDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
  EncodingType,
} from "expo-file-system/legacy";
import { resetDatabase, initDB as reInitDB } from "../database";

import {
  initDB,
  getOverallStats,
  getTagStats,
  getDailyStats,
} from "../database";

type TagStat = { tag: string; count: number };
type DayStat = { date: string; count: number };

export default function OverviewScreen() {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [total, setTotal] = useState(0);
  const [thisWeek, setThisWeek] = useState(0);
  const [topTag, setTopTag] = useState("—");
  const [tagStats, setTagStats] = useState<TagStat[]>([]);
  const [dailyStats, setDailyStats] = useState<DayStat[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          await initDB();
          const [overall, tags, daily] = await Promise.all([
            getOverallStats(),
            getTagStats(),
            getDailyStats(),
          ]);
          if (!active) return;
          setTotal(overall.total);
          setThisWeek(overall.thisWeek);
          setTopTag(tags.length > 0 ? tags[0].tag : "—");
          setTagStats(tags);
          setDailyStats(daily);
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

  // ── 全量导出：数据库 + 附件图片 → 单个 .zip ──────────────
  async function handleExport() {
    try {
      setExporting(true);

      const dbPath = `${documentDirectory}SQLite/stockjournal.db`;
      const dbInfo = await getInfoAsync(dbPath);
      if (!dbInfo.exists) {
        Alert.alert("导出失败", "数据库文件不存在，请先添加记录后再试。");
        return;
      }

      const zip = new JSZip();

      // 1. 把数据库加入 zip
      const dbB64 = await readAsStringAsync(dbPath, {
        encoding: EncodingType.Base64,
      });
      zip.file("stockjournal.db", dbB64, { base64: true });

      // 2. 把 attachments/ 下所有图片加入 zip
      const attDir = `${documentDirectory}attachments/`;
      const attDirInfo = await getInfoAsync(attDir);
      if (attDirInfo.exists) {
        const files = await readDirectoryAsync(attDir);
        for (const fileName of files) {
          const fileB64 = await readAsStringAsync(`${attDir}${fileName}`, {
            encoding: EncodingType.Base64,
          });
          zip.file(`attachments/${fileName}`, fileB64, { base64: true });
        }
      }

      // 3. 生成 zip 并写入缓存
      const zipB64 = await zip.generateAsync({ type: "base64" });
      const zipPath = `${cacheDirectory}stockjournal_backup.zip`;
      await writeAsStringAsync(zipPath, zipB64, {
        encoding: EncodingType.Base64,
      });

      // 4. 弹出分享菜单
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("提示", "当前设备不支持分享功能。");
        return;
      }
      await Sharing.shareAsync(zipPath, {
        mimeType: "application/zip",
        dialogTitle: "导出复盘日记（数据库+图片）",
        UTI: "public.zip-archive",
      });
    } catch (e) {
      Alert.alert("导出失败", String(e));
    } finally {
      setExporting(false);
    }
  }

  // ── 全量导入：从 .zip 恢复数据库 + 附件图片 ───────────────
  async function handleImport() {
    Alert.alert(
      "⚠️ 导入备份",
      "将从 .zip 备份包中恢复数据库和所有图片，会覆盖当前数据，此操作不可撤销！",
      [
        { text: "取消", style: "cancel" },
        {
          text: "确认导入",
          style: "destructive",
          onPress: async () => {
            try {
              setImporting(true);

              // 1. 选择 .zip 文件
              const picked = await DocumentPicker.getDocumentAsync({
                type: "*/*",
                copyToCacheDirectory: true,
              });
              if (picked.canceled || !picked.assets?.length) return;

              const zipUri = picked.assets[0].uri;

              // 2. 读取 zip
              const zipB64 = await readAsStringAsync(zipUri, {
                encoding: EncodingType.Base64,
              });
              const zip = await JSZip.loadAsync(zipB64, { base64: true });

              // 3. 恢复数据库
              const dbFile = zip.file("stockjournal.db");
              if (dbFile) {
                const dbB64 = await dbFile.async("base64");
                const sqliteDir = `${documentDirectory}SQLite/`;
                await makeDirectoryAsync(sqliteDir, {
                  intermediates: true,
                }).catch(() => {});
                await resetDatabase();
                await writeAsStringAsync(`${sqliteDir}stockjournal.db`, dbB64, {
                  encoding: EncodingType.Base64,
                });
                await reInitDB();
              }

              // 4. 恢复附件图片
              const attDir = `${documentDirectory}attachments/`;
              await makeDirectoryAsync(attDir, { intermediates: true }).catch(
                () => {},
              );
              const attFiles = Object.keys(zip.files).filter((name) =>
                name.startsWith("attachments/"),
              );
              for (const name of attFiles) {
                const fileName = name.replace("attachments/", "");
                if (!fileName) continue;
                const fileB64 = await zip.files[name].async("base64");
                await writeAsStringAsync(`${attDir}${fileName}`, fileB64, {
                  encoding: EncodingType.Base64,
                });
              }

              Alert.alert(
                "✅ 导入成功",
                `数据库已恢复${attFiles.length > 0 ? `，${attFiles.length} 张图片已恢复` : ""}。请重新进入各页面刷新数据。`,
              );
            } catch (e) {
              Alert.alert("导入失败", String(e));
              try {
                await reInitDB();
              } catch {
                /* ignore */
              }
            } finally {
              setImporting(false);
            }
          },
        },
      ],
    );
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

  const maxCount = Math.max(...dailyStats.map((d) => d.count), 1);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>数据看板</Text>
        <View style={styles.headerBtns}>
          <TouchableOpacity
            style={[
              styles.headerBtn,
              styles.importBtn,
              importing && styles.btnDisabled,
            ]}
            onPress={handleImport}
            disabled={importing || exporting}
            activeOpacity={0.8}
          >
            {importing ? (
              <ActivityIndicator size="small" color="#34a853" />
            ) : (
              <Text style={[styles.headerBtnText, { color: "#34a853" }]}>
                📥 导入
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.headerBtn,
              styles.exportBtn,
              exporting && styles.btnDisabled,
            ]}
            onPress={handleExport}
            disabled={exporting || importing}
            activeOpacity={0.8}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#1a73e8" />
            ) : (
              <Text style={[styles.headerBtnText, { color: "#1a73e8" }]}>
                📤 导出
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.cardRow}>
          <StatCard label="总记录数" value={String(total)} icon="📚" />
          <StatCard label="本周新增" value={String(thisWeek)} icon="📈" />
          <StatCard label="最常用标签" value={topTag} icon="🏷️" small />
        </View>

        <SectionTitle title="标签统计" />
        {tagStats.length === 0 ? (
          <EmptyHint text="暂无标签数据" />
        ) : (
          <View style={styles.block}>
            {tagStats.map((item, i) => {
              const pct =
                maxTagCount(tagStats) > 0
                  ? item.count / maxTagCount(tagStats)
                  : 0;
              return (
                <View key={item.tag} style={styles.tagRow}>
                  <Text style={styles.tagRank}>{i + 1}</Text>
                  <View style={styles.tagBarWrapper}>
                    <Text style={styles.tagLabel}>{item.tag}</Text>
                    <View style={styles.barBg}>
                      <View
                        style={[
                          styles.barFill,
                          { flex: pct, backgroundColor: tagColor(i) },
                        ]}
                      />
                      <View style={{ flex: 1 - pct }} />
                    </View>
                  </View>
                  <Text style={styles.tagCount}>{item.count}</Text>
                </View>
              );
            })}
          </View>
        )}

        <SectionTitle title="过去 7 天记录" />
        <View style={styles.block}>
          <View style={styles.chartRow}>
            {dailyStats.map((d) => {
              const barH =
                maxCount > 0 ? Math.round((d.count / maxCount) * 80) : 0;
              return (
                <View key={d.date} style={styles.chartCol}>
                  <Text style={styles.chartCount}>
                    {d.count > 0 ? d.count : ""}
                  </Text>
                  <View style={styles.chartBarBg}>
                    <View
                      style={[
                        styles.chartBar,
                        {
                          height: barH > 0 ? barH : 2,
                          opacity: barH > 0 ? 1 : 0.2,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.chartDate}>{d.date}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  label,
  value,
  icon,
  small,
}: {
  label: string;
  value: string;
  icon: string;
  small?: boolean;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text
        style={[styles.statValue, small && styles.statValueSmall]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <View style={styles.sectionTitleWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <View style={styles.emptyHint}>
      <Text style={styles.emptyHintText}>{text}</Text>
    </View>
  );
}

function maxTagCount(tags: TagStat[]) {
  return tags.length > 0 ? tags[0].count : 1;
}

const TAG_COLORS = [
  "#1a73e8",
  "#34a853",
  "#fbbc04",
  "#ea4335",
  "#9c27b0",
  "#00bcd4",
  "#ff9800",
];
function tagColor(i: number) {
  return TAG_COLORS[i % TAG_COLORS.length];
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

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
  exportBtn: { backgroundColor: "#e8f0fe" },
  btnDisabled: { opacity: 0.5 },
  headerBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  headerBtns: {
    flexDirection: "row",
    gap: 8,
  },
  headerBtn: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  importBtn: { backgroundColor: "#e6f4ea" },

  container: { padding: 14, paddingBottom: 40 },

  cardRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  statIcon: { fontSize: 24, marginBottom: 6 },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111",
    marginBottom: 4,
  },
  statValueSmall: { fontSize: 14, fontWeight: "700" },
  statLabel: { fontSize: 11, color: "#999", textAlign: "center" },

  block: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitleWrap: { marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#333" },

  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  tagRank: { width: 20, fontSize: 12, color: "#bbb", fontWeight: "700" },
  tagBarWrapper: { flex: 1, marginHorizontal: 8 },
  tagLabel: { fontSize: 13, color: "#333", marginBottom: 4, fontWeight: "500" },
  barBg: {
    flexDirection: "row",
    height: 8,
    backgroundColor: "#f0f0f0",
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: { borderRadius: 4 },
  tagCount: {
    width: 28,
    fontSize: 13,
    fontWeight: "700",
    color: "#555",
    textAlign: "right",
  },

  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 120,
    paddingTop: 10,
  },
  chartCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  chartCount: {
    fontSize: 10,
    color: "#1a73e8",
    fontWeight: "700",
    marginBottom: 2,
  },
  chartBarBg: {
    width: 28,
    height: 80,
    justifyContent: "flex-end",
    marginBottom: 4,
  },
  chartBar: { width: 28, backgroundColor: "#1a73e8", borderRadius: 4 },
  chartDate: { fontSize: 10, color: "#999", textAlign: "center" },

  emptyHint: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    marginBottom: 20,
  },
  emptyHintText: { color: "#bbb", fontSize: 13 },
});
