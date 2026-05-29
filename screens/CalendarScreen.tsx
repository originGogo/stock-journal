import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Calendar, type DateData } from "react-native-calendars";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { getAllRecords, getCalendarStats, initDB } from "../database";
import { calcPL } from "../plUtils";
import type { JournalStackParamList } from "./EditRecordScreen";

type CalendarRecord = {
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

type NavProp = NativeStackNavigationProp<JournalStackParamList, "Home">;

// ── 颜色配置 ────────────────────────────────────────────────
const COLOR_WIN = "#2ea84f";
const COLOR_WIN_BG = "#e6f4ea";
const COLOR_LOSS = "#ea4335";
const COLOR_LOSS_BG = "#fce8e6";
const COLOR_NEUTRAL = "#1a73e8";
const COLOR_NEUTRAL_BG = "#e8f0fe";

// 格式化时间 UTC → UTC+8
function formatDate(raw: string): string {
  const normalized =
    raw.includes("T") || raw.endsWith("Z") ? raw : raw.replace(" ", "T") + "Z";
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return raw;
  const utc8 = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${utc8.getUTCFullYear()}-${p(utc8.getUTCMonth() + 1)}-${p(utc8.getUTCDate())}  ${p(utc8.getUTCHours())}:${p(utc8.getUTCMinutes())}`;
}

// 将 created_at 转成 YYYY-MM-DD（UTC+8）
function toDateKey(raw: string): string {
  const normalized =
    raw.includes("T") || raw.endsWith("Z") ? raw : raw.replace(" ", "T") + "Z";
  const d = new Date(normalized);
  const utc8 = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${utc8.getUTCFullYear()}-${p(utc8.getUTCMonth() + 1)}-${p(utc8.getUTCDate())}`;
}

export default function CalendarScreen() {
  const navigation = useNavigation<NavProp>();

  // 今天（UTC+8）
  const todayKey = toDateKey(new Date().toISOString());

  const [markedDates, setMarkedDates] = useState<Record<string, object>>({});
  const [allRecords, setAllRecords] = useState<CalendarRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [dailyRecords, setDailyRecords] = useState<CalendarRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // 每日汇总缓存
  const [dayStats, setDayStats] = useState<
    Record<string, { count: number; totalPL: number; hasPL: boolean }>
  >({});

  // ── 加载数据 ──────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          await initDB();
          const [records, stats] = await Promise.all([
            getAllRecords(),
            getCalendarStats(),
          ]);
          if (!active) return;

          setAllRecords(records as CalendarRecord[]);
          setDayStats(stats);

          // 构造 react-native-calendars 的 markedDates
          const marks: Record<string, object> = {};
          for (const [dateKey, info] of Object.entries(stats)) {
            let color = COLOR_NEUTRAL;
            let bgColor = COLOR_NEUTRAL_BG;
            if (info.hasPL) {
              if (info.totalPL > 0) {
                color = COLOR_WIN;
                bgColor = COLOR_WIN_BG;
              } else if (info.totalPL < 0) {
                color = COLOR_LOSS;
                bgColor = COLOR_LOSS_BG;
              }
            }
            marks[dateKey] = {
              customStyles: {
                container: {
                  backgroundColor: bgColor,
                  borderRadius: 8,
                },
                text: {
                  color,
                  fontWeight: "700",
                },
              },
            };
          }

          // 叠加选中日期高亮
          const selected = selectedDate;
          marks[selected] = mergeSelected(
            marks[selected],
            selected === todayKey,
          );
          setMarkedDates(marks);

          // 更新当前选中日期的列表
          filterDay(records as CalendarRecord[], selected);
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

  function filterDay(records: CalendarRecord[], dateKey: string) {
    const filtered = records.filter((r) => toDateKey(r.created_at) === dateKey);
    setDailyRecords(filtered);
  }

  function handleDayPress(day: DateData) {
    const newDate = day.dateString;
    setSelectedDate(newDate);
    filterDay(allRecords, newDate);

    // 更新 marks：保留原有标记，叠加选中样式
    setMarkedDates((prev) => {
      const next = { ...prev };
      // 移除旧选中（恢复原来的颜色）
      // 重建整个 map 太重，只更新两个 key
      next[newDate] = mergeSelected(prev[newDate], newDate === todayKey);
      return next;
    });
  }

  /** 将选中样式叠加到已有标记上 */
  function mergeSelected(
    existing: object | undefined,
    isToday: boolean,
  ): object {
    const existingCustom =
      (existing as { customStyles?: { container?: object; text?: object } })
        ?.customStyles ?? {};
    return {
      ...(existing ?? {}),
      selected: true,
      selectedColor: isToday ? "#1a73e8" : "#555",
      customStyles: {
        container: {
          ...(existingCustom.container ?? {}),
          borderWidth: 2,
          borderColor: isToday ? "#1a73e8" : "#555",
        },
        text: {
          ...(existingCustom.text ?? {}),
        },
      },
    };
  }

  // ── 当日汇总条 ────────────────────────────────────────────
  function DaySummary() {
    const info = dayStats[selectedDate];
    if (!info) {
      return (
        <View style={styles.summaryBar}>
          <Text style={styles.summaryDate}>{selectedDate}</Text>
          <Text style={styles.summaryNone}>当日无记录</Text>
        </View>
      );
    }
    const sign = info.totalPL >= 0 ? "+" : "";
    const plColor =
      info.totalPL > 0 ? COLOR_WIN : info.totalPL < 0 ? COLOR_LOSS : "#555";

    return (
      <View style={styles.summaryBar}>
        <Text style={styles.summaryDate}>{selectedDate}</Text>
        <Text style={styles.summaryCount}>{info.count} 条记录</Text>
        {info.hasPL && (
          <Text style={[styles.summaryPL, { color: plColor }]}>
            {sign}
            {info.totalPL.toFixed(2)}
          </Text>
        )}
      </View>
    );
  }

  // ── 记录卡片（紧凑版） ────────────────────────────────────
  function renderItem({ item }: { item: CalendarRecord }) {
    const pl = calcPL(
      item.entry_price,
      item.exit_price,
      item.quantity,
      item.direction ?? "long",
    );
    const isWin = pl ? pl.pl >= 0 : null;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.92}
        onPress={() => navigation.navigate("EditRecord", { record: item })}
      >
        <Image
          source={{ uri: item.image_uri }}
          style={styles.thumb}
          resizeMode="cover"
        />
        <View style={styles.cardBody}>
          <View style={styles.cardRow}>
            <Text style={styles.stockCode} numberOfLines={1}>
              {item.stock_code || "未填写代码"}
            </Text>
            <Text style={styles.time}>
              {formatDate(item.created_at).slice(12)}
            </Text>
          </View>
          {pl && (
            <View
              style={[styles.plBadge, isWin ? styles.plWinBg : styles.plLossBg]}
            >
              <Text
                style={[
                  styles.plBadgeText,
                  { color: isWin ? COLOR_WIN : COLOR_LOSS },
                ]}
              >
                {isWin ? "▲" : "▼"} {pl.pl >= 0 ? "+" : ""}
                {pl.pl.toFixed(2)} ({pl.pl >= 0 ? "+" : ""}
                {pl.plPct.toFixed(2)}%)
              </Text>
            </View>
          )}
          {item.note ? (
            <Text style={styles.note} numberOfLines={2}>
              {item.note}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }

  // ── 渲染 ─────────────────────────────────────────────────
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
      <FlatList
        data={dailyRecords}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* 日历 */}
            <Calendar
              markingType="custom"
              markedDates={markedDates}
              onDayPress={handleDayPress}
              theme={{
                calendarBackground: "#fff",
                textSectionTitleColor: "#888",
                todayTextColor: "#1a73e8",
                dayTextColor: "#222",
                textDisabledColor: "#ccc",
                arrowColor: "#1a73e8",
                monthTextColor: "#111",
                textMonthFontWeight: "700",
                textDayFontSize: 14,
                textMonthFontSize: 16,
              }}
              style={styles.calendar}
            />

            {/* 图例 */}
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: COLOR_WIN_BG, borderColor: COLOR_WIN },
                  ]}
                />
                <Text style={styles.legendText}>盈利</Text>
              </View>
              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: COLOR_LOSS_BG, borderColor: COLOR_LOSS },
                  ]}
                />
                <Text style={styles.legendText}>亏损</Text>
              </View>
              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    {
                      backgroundColor: COLOR_NEUTRAL_BG,
                      borderColor: COLOR_NEUTRAL,
                    },
                  ]}
                />
                <Text style={styles.legendText}>记录（无盈亏）</Text>
              </View>
            </View>

            {/* 当日汇总 */}
            <DaySummary />

            {/* 当日记录标题 */}
            {dailyRecords.length > 0 && (
              <Text style={styles.sectionTitle}>当日记录</Text>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={styles.emptyText}>当日无复盘记录</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f5f5" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingBottom: 40 },

  // 日历
  calendar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },

  // 图例
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e0e0e0",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  legendText: {
    fontSize: 12,
    color: "#666",
  },

  // 当日汇总栏
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    marginTop: 10,
    marginHorizontal: 14,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  summaryDate: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
    flex: 1,
  },
  summaryCount: {
    fontSize: 13,
    color: "#888",
  },
  summaryPL: {
    fontSize: 15,
    fontWeight: "800",
  },
  summaryNone: {
    fontSize: 13,
    color: "#bbb",
  },

  // 当日列表标题
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#888",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // 卡片
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    marginHorizontal: 14,
    marginBottom: 10,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  thumb: { width: 80, height: 80 },
  cardBody: {
    flex: 1,
    padding: 10,
    justifyContent: "center",
    gap: 4,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stockCode: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111",
    flex: 1,
    marginRight: 6,
  },
  time: { fontSize: 11, color: "#aaa" },
  note: { fontSize: 12, color: "#666", lineHeight: 17 },

  // P/L 徽章
  plBadge: {
    alignSelf: "flex-start",
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  plWinBg: { backgroundColor: COLOR_WIN_BG },
  plLossBg: { backgroundColor: COLOR_LOSS_BG },
  plBadgeText: { fontSize: 12, fontWeight: "700" },

  // 空状态
  emptyWrap: {
    alignItems: "center",
    paddingTop: 40,
  },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  emptyText: { fontSize: 15, color: "#bbb", fontWeight: "600" },
});
