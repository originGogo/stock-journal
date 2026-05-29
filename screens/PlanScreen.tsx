import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import {
  initDB,
  insertPlan,
  getAllPlans,
  updatePlan,
  deletePlan,
  type PlanRow,
} from "../database";
import {
  requestNotificationPermission,
  schedulePlanNotification,
  cancelNotificationById,
} from "../notificationService";

const pad = (n: number) => String(n).padStart(2, "0");

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateTimeLabel(d: Date): string {
  const ds = toDateStr(d);
  const today = toDateStr(new Date());
  const tomorrow = (() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return toDateStr(t);
  })();
  const label = ds === today ? "今天" : ds === tomorrow ? "明天" : ds;
  return `${label} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** notify_at ISO string → Date */
function notifyAtToDate(notifyAt: string | null): Date | null {
  if (!notifyAt) return null;
  const d = new Date(notifyAt);
  return isNaN(d.getTime()) ? null : d;
}

function isPast(d: Date): boolean {
  return d.getTime() <= Date.now();
}

/** 默认：明天 09:25 */
function defaultTrigger(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 25, 0, 0);
  return d;
}

// ──────────────────────────────────────────────────────────────

export default function PlanScreen() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);

  // 新增 / 编辑表单状态
  const [editingPlan, setEditingPlan] = useState<PlanRow | null>(null); // null = 新增模式
  const [formVisible, setFormVisible] = useState(false);
  const [planText, setPlanText] = useState("");
  const [triggerDate, setTriggerDate] = useState<Date>(defaultTrigger);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    await initDB();
    const rows = await getAllPlans();
    setPlans(rows);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPlans();
    }, [loadPlans]),
  );

  // ── 打开表单 ──────────────────────────────────────────────

  function openAddForm() {
    setEditingPlan(null);
    setPlanText("");
    setTriggerDate(defaultTrigger());
    setFormVisible(true);
  }

  function openEditForm(plan: PlanRow) {
    setEditingPlan(plan);
    setPlanText(plan.plan_text);
    const d = notifyAtToDate(plan.notify_at);
    setTriggerDate(d && !isPast(d) ? d : defaultTrigger());
    setFormVisible(true);
  }

  // ── DateTimePicker 回调 ──────────────────────────────────

  function onDateChange(_: DateTimePickerEvent, selected?: Date) {
    setShowDatePicker(false);
    if (!selected) return;
    const next = new Date(selected);
    next.setHours(triggerDate.getHours(), triggerDate.getMinutes(), 0, 0);
    setTriggerDate(next);
  }

  function onTimeChange(_: DateTimePickerEvent, selected?: Date) {
    setShowTimePicker(false);
    if (!selected) return;
    const next = new Date(triggerDate);
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    setTriggerDate(next);
  }

  // ── 保存（新增 or 更新） ──────────────────────────────────

  async function handleSave() {
    const text = planText.trim();
    if (!text) {
      Alert.alert("提示", "请先写下交易计划内容");
      return;
    }
    if (triggerDate.getTime() <= Date.now()) {
      Alert.alert("时间无效", "提醒时间必须在当前时间之后，请重新选择。");
      return;
    }
    try {
      setSaving(true);
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert("权限不足", "请前往系统设置开启通知权限。");
        return;
      }

      const targetDate = toDateStr(triggerDate);
      const notifyAt = triggerDate.toISOString();

      if (editingPlan) {
        // 取消旧通知
        if (editingPlan.notification_id) {
          await cancelNotificationById(editingPlan.notification_id).catch(
            () => {},
          );
        }
        const newNotifId = await schedulePlanNotification(text, triggerDate);
        await updatePlan(
          editingPlan.id,
          text,
          targetDate,
          notifyAt,
          newNotifId,
        );
      } else {
        const newNotifId = await schedulePlanNotification(text, triggerDate);
        await insertPlan(text, targetDate, notifyAt, newNotifId);
      }

      setFormVisible(false);
      await loadPlans();
      Alert.alert(
        "✅ 计划已保存",
        `将在 ${formatDateTimeLabel(triggerDate)} 提醒你！`,
      );
    } catch (e) {
      Alert.alert("保存失败", String(e));
    } finally {
      setSaving(false);
    }
  }

  // ── 删除 ─────────────────────────────────────────────────

  function handleDelete(plan: PlanRow) {
    Alert.alert("删除计划", "同时取消该条提醒，确定删除？", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: async () => {
          if (plan.notification_id) {
            await cancelNotificationById(plan.notification_id).catch(() => {});
          }
          await deletePlan(plan.id);
          await loadPlans();
        },
      },
    ]);
  }

  // ── 渲染每条计划卡片 ────────────────────────────────────

  function renderPlan(plan: PlanRow) {
    const notifyDate = notifyAtToDate(plan.notify_at);
    const past = notifyDate ? isPast(notifyDate) : true;
    return (
      <View
        key={plan.id}
        style={[styles.planCard, past && styles.planCardPast]}
      >
        <View style={styles.planHeader}>
          <View style={styles.planBadge}>
            <Text
              style={[styles.planBadgeText, past && styles.planBadgeTextPast]}
            >
              {notifyDate ? formatDateTimeLabel(notifyDate) : plan.target_date}
            </Text>
            {past && <Text style={styles.pastTag}> 已过</Text>}
          </View>
          <View style={styles.planActions}>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => openEditForm(plan)}
              activeOpacity={0.7}
            >
              <Text style={styles.editBtnText}>编辑</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => handleDelete(plan)}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteBtnText}>删除</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.planText}>{plan.plan_text}</Text>
      </View>
    );
  }

  // ── 最小可选日期 ──────────────────────────────────────────

  const minDate = new Date();
  minDate.setHours(0, 0, 0, 0);

  // ── Render ──────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* 顶部标题栏 */}
        <View style={styles.topRow}>
          <Text style={styles.title}>📋 交易计划</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={openAddForm}
            activeOpacity={0.85}
          >
            <Text style={styles.addBtnText}>＋ 新建计划</Text>
          </TouchableOpacity>
        </View>

        {/* 计划列表 */}
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#1a73e8" />
        ) : plans.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>还没有任何计划</Text>
            <Text style={styles.emptyHint}>点击右上角「新建计划」开始吧</Text>
          </View>
        ) : (
          plans.map(renderPlan)
        )}

        {/* 使用说明 */}
        {!loading && (
          <View style={styles.hintCard}>
            <Text style={styles.hintTitle}>📖 使用说明</Text>
            <Text style={styles.hintLine}>
              • 可设今天或未来任意时间推送提醒
            </Text>
            <Text style={styles.hintLine}>
              • 点击「编辑」可修改内容和提醒时间
            </Text>
            <Text style={styles.hintLine}>• 点击「删除」同时取消该条通知</Text>
          </View>
        )}
      </ScrollView>

      {/* ── 新增/编辑 Modal ── */}
      <Modal
        visible={formVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFormVisible(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ScrollView
              contentContainerStyle={styles.modalContainer}
              keyboardShouldPersistTaps="handled"
            >
              {/* Modal 标题栏 */}
              <View style={styles.modalTopRow}>
                <TouchableOpacity onPress={() => setFormVisible(false)}>
                  <Text style={styles.modalCancel}>取消</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>
                  {editingPlan ? "编辑计划" : "新建计划"}
                </Text>
                <View style={{ width: 40 }} />
              </View>

              {/* 计划内容 */}
              <View style={styles.inputCard}>
                <Text style={styles.inputLabel}>交易预案</Text>
                <TextInput
                  style={styles.textInput}
                  value={planText}
                  onChangeText={setPlanText}
                  placeholder={
                    "写下交易预案、目标点位或纪律提醒...\n\n例如：\n• 600519 跌破 1800 不追\n• 单票止损上限 2%"
                  }
                  placeholderTextColor="#bbb"
                  multiline
                  textAlignVertical="top"
                  autoFocus
                />
              </View>

              {/* 提醒时间选择 */}
              <View style={styles.timeCard}>
                <Text style={styles.inputLabel}>🔔 提醒时间</Text>
                <View style={styles.timeRow}>
                  <TouchableOpacity
                    style={styles.timeBtn}
                    onPress={() => setShowDatePicker(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.timeBtnLabel}>日期</Text>
                    <Text style={styles.timeBtnValue}>
                      {(() => {
                        const ds = toDateStr(triggerDate);
                        const today = toDateStr(new Date());
                        const tomorrow = (() => {
                          const t = new Date();
                          t.setDate(t.getDate() + 1);
                          return toDateStr(t);
                        })();
                        return ds === today
                          ? "今天"
                          : ds === tomorrow
                            ? "明天"
                            : ds;
                      })()}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.timeDivider} />
                  <TouchableOpacity
                    style={styles.timeBtn}
                    onPress={() => setShowTimePicker(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.timeBtnLabel}>时间</Text>
                    <Text style={styles.timeBtnValue}>
                      {pad(triggerDate.getHours())}:
                      {pad(triggerDate.getMinutes())}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.timeHint}>
                  ⏰ 将在 {formatDateTimeLabel(triggerDate)} 推送提醒
                </Text>
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={triggerDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  minimumDate={minDate}
                  onChange={onDateChange}
                />
              )}
              {showTimePicker && (
                <DateTimePicker
                  value={triggerDate}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  is24Hour
                  onChange={onTimeChange}
                />
              )}

              {/* 保存按钮 */}
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>🔔 保存并设定提醒</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ── 样式 ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f5f5" },
  container: { padding: 20, paddingBottom: 48 },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: "700", color: "#111" },
  addBtn: {
    backgroundColor: "#1a73e8",
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  addBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // 空状态
  emptyBox: { alignItems: "center", marginTop: 60, marginBottom: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: "600", color: "#888" },
  emptyHint: { fontSize: 13, color: "#bbb", marginTop: 6 },

  // 计划卡片
  planCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  planCardPast: { opacity: 0.65 },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  planBadge: { flexDirection: "row", alignItems: "center" },
  planBadgeText: { fontSize: 13, fontWeight: "700", color: "#1a73e8" },
  planBadgeTextPast: { color: "#aaa" },
  pastTag: { fontSize: 11, color: "#aaa" },
  planActions: { flexDirection: "row", gap: 8 },
  editBtn: {
    backgroundColor: "#e8f0fe",
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  editBtnText: { fontSize: 13, color: "#1a73e8", fontWeight: "600" },
  deleteBtn: {
    backgroundColor: "#fdecea",
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  deleteBtnText: { fontSize: 13, color: "#ea4335", fontWeight: "600" },
  planText: { fontSize: 14, color: "#333", lineHeight: 22 },

  // 说明卡片
  hintCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  hintTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
    marginBottom: 10,
  },
  hintLine: { fontSize: 13, color: "#666", lineHeight: 22 },

  // Modal
  modalSafe: { flex: 1, backgroundColor: "#f5f5f5" },
  modalContainer: { padding: 20, paddingBottom: 48 },
  modalTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  modalCancel: { fontSize: 16, color: "#1a73e8" },
  modalTitle: { fontSize: 17, fontWeight: "700", color: "#111" },

  // 输入卡片
  inputCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#555",
    marginBottom: 10,
  },
  textInput: {
    fontSize: 15,
    color: "#222",
    lineHeight: 22,
    minHeight: 160,
    padding: 0,
  },

  // 时间选择
  timeCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 10,
  },
  timeBtn: {
    flex: 1,
    backgroundColor: "#f0f4ff",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  timeBtnLabel: { fontSize: 11, color: "#888", marginBottom: 4 },
  timeBtnValue: { fontSize: 18, fontWeight: "700", color: "#1a73e8" },
  timeDivider: { width: 16 },
  timeHint: { fontSize: 12, color: "#888", textAlign: "center" },

  // 保存按钮
  saveBtn: {
    backgroundColor: "#1a73e8",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#1a73e8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
