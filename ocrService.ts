// ─────────────────────────────────────────────────────────────
// OCR 智能识图服务 —— 调用多模态视觉 AI 自动提取交割单信息
//
// ⚠️ 需要一个支持「视觉/图片输入」的模型，常见选项：
//   - 通义千问 VL：API_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1"
//                  MODEL = "qwen-vl-plus"  或  "qwen-vl-max"
//   - OpenAI       API_BASE = "https://api.openai.com/v1"
//                  MODEL = "gpt-4o"
//   - DeepSeek ❌  暂不支持图片输入
// ─────────────────────────────────────────────────────────────

import { readAsStringAsync } from "expo-file-system/legacy";

// ── 配置区（按需修改） ──────────────────────────────────────
export const OCR_API_BASE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1"; // ← 按需修改
export const OCR_API_KEY = "YOUR_OCR_API_KEY_HERE"; // ← ⚠️ 必须替换
export const OCR_MODEL = "qwen-vl-plus"; // ← 按需修改
// ──────────────────────────────────────────────────────────────

/** OCR 识别返回的结构化字段（均为可选，未识别到则缺省） */
export type OCRResult = {
  stock_code?: string;
  entry_price?: number;
  exit_price?: number;
  quantity?: number;
  direction?: "long" | "short";
};

/**
 * 将本地图片 URI 发送到多模态 AI，自动提取交易相关字段。
 * @param imageUri  本地文件路径（file://...）
 * @returns OCRResult  解析后的结构化数据
 */
export async function recognizeTradeImage(
  imageUri: string,
): Promise<OCRResult> {
  if (OCR_API_KEY === "YOUR_OCR_API_KEY_HERE") {
    throw new Error(
      "请先在 ocrService.ts 中填入支持视觉的 API Key！\n推荐使用通义千问（qwen-vl-plus）或 GPT-4o。",
    );
  }

  // 1. 读取图片为 Base64
  const base64 = await readAsStringAsync(imageUri, {
    encoding: "base64",
  });

  // 2. 推断 MIME 类型
  const ext = imageUri.split(".").pop()?.toLowerCase() ?? "jpeg";
  const mimeType = ext === "png" ? "image/png" : "image/jpeg";

  // 3. 构造多模态消息，要求 AI 返回纯 JSON
  const prompt = `请仔细分析这张截图（可能是交割单、K线图、股票成交记录等）。
提取以下信息并【只返回 JSON】，不要任何解释：
{
  "stock_code": "股票代码或名称（如 AAPL、600519、腾讯），未找到则省略",
  "entry_price": 买入/成交价（数字），未找到则省略,
  "exit_price": 卖出价（数字），未找到则省略,
  "quantity": 成交数量/股数（数字），未找到则省略,
  "direction": "long（买入做多）或 short（卖空做空），不确定则省略"
}`;

  // 4. 调用 Vision API
  const response = await fetch(`${OCR_API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OCR_API_KEY}`,
    },
    body: JSON.stringify({
      model: OCR_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`视觉 API 请求失败 (${response.status})：${errText}`);
  }

  // 5. 解析 AI 回复
  const data = await response.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";

  // 从回复中提取第一个 {...} JSON 块
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI 未返回可识别的 JSON 数据，请尝试更清晰的截图。");
  }

  let result: OCRResult;
  try {
    result = JSON.parse(jsonMatch[0]) as OCRResult;
  } catch {
    throw new Error("JSON 解析失败，AI 返回格式异常。");
  }

  return result;
}
