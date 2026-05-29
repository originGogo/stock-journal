// ─────────────────────────────────────────────────────────────
// AI 交易教练接口
// 使用 OpenAI 兼容格式，可无缝对接：
//   - DeepSeek:  API_BASE_URL = "https://api.deepseek.com/v1"
//   - 通义千问:  API_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
//   - OpenAI:    API_BASE_URL = "https://api.openai.com/v1"
// ─────────────────────────────────────────────────────────────

// ⚠️ 将你的 API Key 和接口地址填入这里
// DeepSeek:   AI_API_BASE_URL = "https://api.deepseek.com/v1"        AI_MODEL = "deepseek-chat"
// 通义千问:   AI_API_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"  AI_MODEL = "qwen-plus"
// OpenAI:     AI_API_BASE_URL = "https://api.openai.com/v1"           AI_MODEL = "gpt-4o"
export const AI_API_BASE_URL = "https://api.deepseek.com/v1"; // ← 按需修改
export const AI_API_KEY = "YOUR_API_KEY_HERE"; // ← ⚠️ 必须替换为你的真实 Key
export const AI_MODEL = "deepseek-chat"; // ← 按需修改

export type WeekRecord = {
  stock_code: string;
  tags: string;
  note: string;
};

/**
 * 将本周记录拼接成 Prompt 文本，发送给 AI，返回总结文字
 */
export async function generateWeeklyReport(
  records: WeekRecord[],
): Promise<string> {
  if (records.length === 0) {
    return "本周暂无交易记录，无法生成总结。";
  }

  // 拼接日记数据
  const diaryText = records
    .map((r, i) => {
      const parts: string[] = [];
      if (r.stock_code) parts.push(`股票：${r.stock_code}`);
      if (r.tags) parts.push(`标签：${r.tags}`);
      if (r.note) parts.push(`备注：${r.note}`);
      return `第${i + 1}条 — ${parts.join("，") || "（无详细信息）"}`;
    })
    .join("\n");

  const prompt =
    `我是一个股票交易者，以下是我这周的交易日记（包含操作的股票、标签和心情备注）：\n\n${diaryText}\n\n` +
    `请你像一个严厉的交易教练一样，用一段话总结我这周的交易状态，指出我最大的毛病，并给我下周的建议。`;

  if (AI_API_KEY === "YOUR_API_KEY_HERE") {
    throw new Error("请先在 aiCoach.ts 中填入你的 API Key！");
  }

  const response = await fetch(`${AI_API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI 接口请求失败 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content: string =
    data?.choices?.[0]?.message?.content ?? "AI 未返回有效内容。";
  return content.trim();
}
