"use strict";
/**
 * Translate Agent Lambda
 * Translates report content to Chinese using Gemini API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;

const { GeminiClient } = require('/opt/nodejs/services/gemini-client');

const handler = async (event) => {
  const { ticker, reportContent, consensusSummary, triggerDate } = event;
  console.log(`[TranslateAgent] Translating report for ${ticker} (${triggerDate})`);

  const gemini = new GeminiClient();

  const systemInstruction = `You are a professional financial translator specializing in translating investment analysis reports from English to Simplified Chinese.

=== TRANSLATION GUIDELINES ===
1. Maintain professional financial terminology
2. Keep ticker symbols (e.g., AAPL, NVDA) unchanged
3. Keep numbers, percentages, and dates unchanged
4. Translate technical terms accurately (e.g., "Strong Buy" -> "强力买入", "Short" -> "做空", "Neutral" -> "中性")
5. Preserve the structure and formatting of the original text
6. Use formal, professional Chinese suitable for financial reports

=== FINANCIAL TERMINOLOGY REFERENCE ===
- Strong Buy -> 强力买入
- Buy -> 买入
- Neutral -> 中性
- Sell -> 卖出
- Short -> 做空
- Bull/Bullish -> 看涨/多头
- Bear/Bearish -> 看跌/空头
- Moving Average (MA) -> 移动平均线
- Breakthrough -> 突破
- Support -> 支撑位
- Resistance -> 阻力位
- Volume -> 成交量
- P/E Ratio -> 市盈率
- Revenue -> 营收
- Earnings -> 盈利
- Guidance -> 业绩指引
- Catalyst -> 催化剂
- Risk -> 风险`;

  const prompt = `Translate the following investment analysis content to Simplified Chinese.

=== REPORT CONTENT ===
${reportContent}

=== CONSENSUS SUMMARY POINTS ===
${consensusSummary.map((point, i) => `${i + 1}. ${point}`).join('\n')}

=== OUTPUT FORMAT ===
Respond with ONLY valid JSON. No text before or after.

{
  "reportContentChinese": "Chinese translation of the report content...",
  "consensusSummaryChinese": [
    "Chinese translation of point 1",
    "Chinese translation of point 2",
    "Chinese translation of point 3"
  ]
}`;

  try {
    const { text } = await gemini.generate(prompt, systemInstruction);

    // Extract JSON from response
    let cleanJson = text.replace(/```json\n?|\n?```/g, '').trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanJson = jsonMatch[0];
    }
    const parsed = JSON.parse(cleanJson);

    console.log(`[TranslateAgent] Translation completed for ${ticker}`);

    return {
      ticker,
      triggerDate,
      reportContentChinese: parsed.reportContentChinese,
      consensusSummaryChinese: parsed.consensusSummaryChinese,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[TranslateAgent] Error:', error);
    throw error;
  }
};

exports.handler = handler;
