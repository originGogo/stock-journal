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
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";

import { pickAndSaveImage } from "../pickAndSaveImage";
import { insertRecord } from "../database";
import { calcPL, formatPL } from "../plUtils";
import { recognizeTradeImage } from "../ocrService";

type RootStackParamList = {
  Home: undefined;
  AddRecord: undefined;
};

type AddRecordNavProp = NativeStackNavigationProp<
  RootStackParamList,
  "AddRecord"
>;

export default function AddRecordScreen() {
  const navigation = useNavigation<AddRecordNavProp>();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [stockCode, setStockCode] = useState("");
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  // P/L 字段
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

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

  async function handleOCR() {
    if (!imageUri) return;
    try {
      setScanning(true);
      const result = await recognizeTradeImage(imageUri);

      // 填充识别到的字段（不覆盖用户已手动输入的非空值）
      if (result.stock_code) setStockCode(result.stock_code);
      if (result.entry_price != null) setEntryPrice(String(result.entry_price));
      if (result.exit_price != null) setExitPrice(String(result.exit_price));
      if (result.quantity != null) setQuantity(String(result.quantity));
      if (result.direction) setDirection(result.direction);

      const filled = [
        result.stock_code,
        result.entry_price,
        result.exit_price,
        result.quantity,
      ].filter(Boolean).length;
      Alert.alert(
        "识别完成 ✅",
        filled > 0
          ? `已自动填入 ${filled} 个字段，请核对后保存。`
          : "未能从图片中识别到交易数据，请手动填写。",
      );
    } catch (e) {
      Alert.alert("识别失败", String(e));
    } finally {
      setScanning(false);
    }
  }

  async function handleSave() {
    if (!imageUri) {
      Alert.alert("提示", "请先选择一张图片");
      return;
    }
    try {
      setSaving(true);
      await insertRecord({
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
        {/* 选图区域 */}
        <TouchableOpacity
          style={styles.imagePicker}
          onPress={handlePickImage}
          activeOpacity={0.8}
        >
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.preview}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Text style={styles.imagePlaceholderIcon}>＋</Text>
              <Text style={styles.imagePlaceholderText}>点击选择截图</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* 智能识别按钮（选图后出现） */}
        {imageUri && (
          <TouchableOpacity
            style={[styles.ocrButton, scanning && styles.ocrButtonDisabled]}
            onPress={handleOCR}
            disabled={scanning}
            activeOpacity={0.8}
          >
            {scanning ? (
              <>
                <ActivityIndicator
                  color="#1a73e8"
                  size="small"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.ocrButtonText}>AI 识别中…</Text>
              </>
            ) : (
              <Text style={styles.ocrButtonText}>🔍 智能识别 · 自动填表</Text>
            )}
          </TouchableOpacity>
        )}

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
            <Text style={styles.saveButtonText}>保存</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },

  // 选图
  imagePicker: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 24,
    backgroundColor: "#e8e8e8",
  },
  preview: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  imagePlaceholderIcon: {
    fontSize: 40,
    color: "#bbb",
  },
  imagePlaceholderText: {
    marginTop: 8,
    fontSize: 15,
    color: "#bbb",
  },

  // OCR 按钮
  ocrButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e8f0fe",
    borderRadius: 10,
    paddingVertical: 11,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#c5d8fb",
  },
  ocrButtonDisabled: {
    opacity: 0.6,
  },
  ocrButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1a73e8",
  },

  // 表单
  field: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
    marginBottom: 6,
  },
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
  noteInput: {
    height: 120,
    paddingTop: 12,
  },

  // P/L 区块
  sectionHeader: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e0e0e0",
    paddingTop: 18,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
  },
  dirRow: {
    flexDirection: "row",
    gap: 10,
  },
  dirBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  dirBtnActive: {
    borderColor: "#1a73e8",
    backgroundColor: "#e8f0fe",
  },
  dirBtnShort: {
    borderColor: "#ea4335",
    backgroundColor: "#fce8e6",
  },
  dirBtnText: {
    fontSize: 14,
    color: "#888",
    fontWeight: "600",
  },
  dirBtnTextActive: {
    color: "#111",
  },
  priceRow: {
    flexDirection: "row",
    gap: 10,
  },
  priceField: {
    flex: 1,
    marginBottom: 18,
  },
  plPreview: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  plWin: {
    backgroundColor: "#e6f4ea",
  },
  plLoss: {
    backgroundColor: "#fce8e6",
  },
  plPreviewLabel: {
    fontSize: 13,
    color: "#666",
    fontWeight: "600",
  },
  plPreviewValue: {
    fontSize: 15,
    fontWeight: "800",
  },
  plWinText: {
    color: "#2ea84f",
  },
  plLossText: {
    color: "#ea4335",
  },

  // 保存按钮
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
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 1,
  },
});
