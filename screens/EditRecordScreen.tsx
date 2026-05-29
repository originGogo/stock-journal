import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { pickAndSaveImage } from "../pickAndSaveImage";
import { updateRecord } from "../database";
import { calcPL, formatPL } from "../plUtils";

// ── 路由类型（与 MainTabNavigator 保持一致）─────────────────
export type JournalStackParamList = {
  Home: undefined;
  AddRecord: undefined;
  EditRecord: {
    record: {
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
  };
};

type Props = NativeStackScreenProps<JournalStackParamList, "EditRecord">;

export default function EditRecordScreen({ route, navigation }: Props) {
  const { record } = route.params;

  const [imageUri, setImageUri] = useState<string>(record.image_uri);
  const [stockCode, setStockCode] = useState(record.stock_code ?? "");
  const [tags, setTags] = useState(record.tags ?? "");
  const [note, setNote] = useState(record.note ?? "");
  // P/L 字段
  const [direction, setDirection] = useState<"long" | "short">(
    record.direction ?? "long",
  );
  const [entryPrice, setEntryPrice] = useState(
    record.entry_price != null ? String(record.entry_price) : "",
  );
  const [exitPrice, setExitPrice] = useState(
    record.exit_price != null ? String(record.exit_price) : "",
  );
  const [quantity, setQuantity] = useState(
    record.quantity != null ? String(record.quantity) : "",
  );
  const [saving, setSaving] = useState(false);

  // 实时盈亏预览
  const plResult = useMemo(() => {
    const entry = parseFloat(entryPrice);
    const exit = parseFloat(exitPrice);
    const qty = parseFloat(quantity);
    return calcPL(
      isNaN(entry) ? null : entry,
      isNaN(exit) ? null : exit,
      isNaN(qty) ? null : qty,
      direction,
    );
  }, [entryPrice, exitPrice, quantity, direction]);

  async function handlePickImage() {
    const uri = await pickAndSaveImage();
    if (uri) setImageUri(uri);
  }

  async function handleSave() {
    if (!imageUri) {
      Alert.alert("提示", "图片不能为空");
      return;
    }
    try {
      setSaving(true);
      await updateRecord({
        id: record.id,
        image_uri: imageUri,
        stock_code: stockCode.trim(),
        tags: tags.trim(),
        note: note.trim(),
        entry_price: parseFloat(entryPrice) || null,
        exit_price: parseFloat(exitPrice) || null,
        quantity: parseFloat(quantity) || null,
        direction,
      });
      navigation.goBack();
    } catch (e) {
      Alert.alert("保存失败", String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* 图片区域 */}
        <TouchableOpacity
          style={styles.imagePicker}
          onPress={handlePickImage}
          activeOpacity={0.8}
        >
          <Image
            source={{ uri: imageUri }}
            style={styles.preview}
            resizeMode="cover"
          />
          <View style={styles.imageOverlay}>
            <Text style={styles.imageOverlayText}>点击更换图片</Text>
          </View>
        </TouchableOpacity>

        {/* 股票代码 */}
        <View style={styles.field}>
          <Text style={styles.label}>股票代码 / 名称</Text>
          <TextInput
            style={styles.input}
            value={stockCode}
            onChangeText={setStockCode}
            placeholder="如：AAPL、腾讯"
            placeholderTextColor="#aaa"
            returnKeyType="next"
            autoCapitalize="characters"
          />
        </View>

        {/* 标签 */}
        <View style={styles.field}>
          <Text style={styles.label}>标签</Text>
          <TextInput
            style={styles.input}
            value={tags}
            onChangeText={setTags}
            placeholder="如：#追高, #止损"
            placeholderTextColor="#aaa"
            returnKeyType="next"
          />
        </View>

        {/* 复盘备注 */}
        <View style={styles.field}>
          <Text style={styles.label}>复盘备注</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            placeholder="记录你的复盘思路..."
            placeholderTextColor="#aaa"
            multiline
            textAlignVertical="top"
            returnKeyType="default"
          />
        </View>

        {/* ── P/L 数值化区块 ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>损益计算（选填）</Text>
        </View>

        {/* 方向切换 */}
        <View style={styles.field}>
          <Text style={styles.label}>交易方向</Text>
          <View style={styles.dirRow}>
            <TouchableOpacity
              style={[
                styles.dirBtn,
                direction === "long" && styles.dirBtnActive,
              ]}
              onPress={() => setDirection("long")}
            >
              <Text
                style={[
                  styles.dirBtnText,
                  direction === "long" && styles.dirBtnTextActive,
                ]}
              >
                📈 做多
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.dirBtn,
                direction === "short" && styles.dirBtnShort,
              ]}
              onPress={() => setDirection("short")}
            >
              <Text
                style={[
                  styles.dirBtnText,
                  direction === "short" && styles.dirBtnTextActive,
                ]}
              >
                📉 做空
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 价格 & 数量 */}
        <View style={styles.priceRow}>
          <View style={[styles.field, styles.priceField]}>
            <Text style={styles.label}>买入价</Text>
            <TextInput
              style={styles.input}
              value={entryPrice}
              onChangeText={setEntryPrice}
              placeholder="0.00"
              placeholderTextColor="#aaa"
              keyboardType="numeric"
            />
          </View>
          <View style={[styles.field, styles.priceField]}>
            <Text style={styles.label}>卖出价</Text>
            <TextInput
              style={styles.input}
              value={exitPrice}
              onChangeText={setExitPrice}
              placeholder="0.00"
              placeholderTextColor="#aaa"
              keyboardType="numeric"
            />
          </View>
          <View style={[styles.field, styles.priceField]}>
            <Text style={styles.label}>数量</Text>
            <TextInput
              style={styles.input}
              value={quantity}
              onChangeText={setQuantity}
              placeholder="0"
              placeholderTextColor="#aaa"
              keyboardType="numeric"
            />
          </View>
        </View>

        {/* 实时盈亏预览 */}
        {plResult !== null && (
          <View
            style={[
              styles.plPreview,
              plResult.pl >= 0 ? styles.plWin : styles.plLoss,
            ]}
          >
            <Text style={styles.plPreviewLabel}>预计盈亏</Text>
            <Text
              style={[
                styles.plPreviewValue,
                plResult.pl >= 0 ? styles.plWinText : styles.plLossText,
              ]}
            >
              {formatPL(plResult.pl, plResult.plPct)}
            </Text>
          </View>
        )}

        {/* 保存按钮 */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>保存修改</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#f5f5f5" },
  container: { padding: 20, paddingBottom: 40 },

  imagePicker: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 24,
    backgroundColor: "#e8e8e8",
  },
  preview: { width: "100%", height: "100%" },
  imageOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingVertical: 8,
    alignItems: "center",
  },
  imageOverlayText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  field: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: "600", color: "#555", marginBottom: 6 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#222",
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  noteInput: { height: 120, paddingTop: 12 },

  // P/L 区块
  sectionHeader: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e0e0e0",
    paddingTop: 18,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#333" },
  dirRow: { flexDirection: "row", gap: 10 },
  dirBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  dirBtnActive: { borderColor: "#1a73e8", backgroundColor: "#e8f0fe" },
  dirBtnShort: { borderColor: "#ea4335", backgroundColor: "#fce8e6" },
  dirBtnText: { fontSize: 14, color: "#888", fontWeight: "600" },
  dirBtnTextActive: { color: "#111" },
  priceRow: { flexDirection: "row", gap: 10 },
  priceField: { flex: 1, marginBottom: 18 },
  plPreview: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  plWin: { backgroundColor: "#e6f4ea" },
  plLoss: { backgroundColor: "#fce8e6" },
  plPreviewLabel: { fontSize: 13, color: "#666", fontWeight: "600" },
  plPreviewValue: { fontSize: 15, fontWeight: "800" },
  plWinText: { color: "#2ea84f" },
  plLossText: { color: "#ea4335" },

  saveButton: {
    marginTop: 10,
    backgroundColor: "#1a73e8",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#1a73e8",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 1,
  },
});
