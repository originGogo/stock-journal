import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Paths, Directory, File } from "expo-file-system";

// 压缩目标宽度（px）和质量（0~1），可按需调整
const MAX_WIDTH = 1280;
const COMPRESS_QUALITY = 0.75;

/**
 * 选择图片，压缩后保存到本地 attachments/ 持久目录，返回最终本地路径。
 * @returns 选中图片的本地沙盒路径，取消则返回 null
 */
export async function pickAndSaveImage(): Promise<string | null> {
  // 请求权限
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    alert("需要相册权限");
    return null;
  }

  // 打开图片选择器
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: "images",
    quality: 1, // 原图进来，由 manipulateAsync 统一压缩
    allowsEditing: false,
    base64: false,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const sourceUri = asset.uri;
  if (!sourceUri) return null;

  // ── 压缩 ──────────────────────────────────────────────────
  const compressed = await manipulateAsync(
    sourceUri,
    [{ resize: { width: MAX_WIDTH } }],
    { compress: COMPRESS_QUALITY, format: SaveFormat.JPEG },
  );

  // ── 保存到 attachments/ 目录 ──────────────────────────────
  const fileName = `att_${Date.now()}.jpg`;

  const attachmentsDir = new Directory(Paths.document, "attachments");
  if (!attachmentsDir.exists) {
    attachmentsDir.create();
  }

  const sourceFile = new File(compressed.uri);
  const destFile = new File(attachmentsDir, fileName);
  sourceFile.copy(destFile);

  return destFile.uri;
}
