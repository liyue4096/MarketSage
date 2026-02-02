/**
 * Translate Agent Lambda
 * Translates report content to Chinese using Gemini API
 */

const { GeminiClient } = require('/opt/nodejs/services/gemini-client');

type Handler<TEvent = any, TResult = any> = (event: TEvent, context: any) => Promise<TResult>;

interface ThesisPoint {
  point: string;
  evidence: string;
  source?: string;
  dataDate?: string;
  confidence?: number;
}

interface ThesisData {
  role?: 'BULL' | 'BEAR';
  thesis: ThesisPoint[];
  primaryCatalyst?: string;
  primaryRisk?: string;
  thinkingTrace?: string;
  timestamp?: string;
}

interface RebuttalPoint {
  originalPoint: string;
  rebuttal: string;
  evidence: string;
  source?: string;
  dataDate?: string;
  strengthOfRebuttal?: number;
}

interface RebuttalsData {
  bullRebuttals: RebuttalPoint[];
  bearRebuttals: RebuttalPoint[];
  thinkingTrace?: string;
  timestamp?: string;
}

interface TranslateInput {
  ticker: string;
  reportContent: string;
  consensusSummary: string[];
  triggerDate: string;
  bullOpening?: ThesisData;
  bearOpening?: ThesisData;
  rebuttals?: RebuttalsData;
}

interface TranslateOutput {
  ticker: string;
  triggerDate: string;
  reportContentChinese: string;
  consensusSummaryChinese: string[];
  bullOpeningChinese?: ThesisData;
  bearOpeningChinese?: ThesisData;
  rebuttalsChinese?: RebuttalsData;
  timestamp: string;
}

export const handler: Handler<TranslateInput, TranslateOutput> = async (event) => {
  const { ticker, reportContent, consensusSummary, triggerDate, bullOpening, bearOpening, rebuttals } = event;
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
- Risk -> 风险
- Opening Arguments -> 开场辩论
- Cross-Examination -> 交叉质询
- Rebuttal -> 反驳
- Evidence -> 证据
- Source -> 来源`;

  // Build sections for Opening Arguments and Cross-Examination if available
  let openingArgumentsSection = '';
  if (bullOpening && bearOpening) {
    openingArgumentsSection = `
=== OPENING ARGUMENTS - BULL THESIS ===
${bullOpening.thesis.map((point, i) => `${i + 1}. Point: ${point.point}
   Evidence: ${point.evidence}
   Source: ${point.source || 'N/A'}
   Date: ${point.dataDate || 'N/A'}`).join('\n\n')}

=== OPENING ARGUMENTS - BEAR THESIS ===
${bearOpening.thesis.map((point, i) => `${i + 1}. Point: ${point.point}
   Evidence: ${point.evidence}
   Source: ${point.source || 'N/A'}
   Date: ${point.dataDate || 'N/A'}`).join('\n\n')}`;
  }

  let crossExaminationSection = '';
  if (rebuttals) {
    crossExaminationSection = `
=== CROSS-EXAMINATION - BULL REBUTTALS ===
${rebuttals.bullRebuttals.map((r, i) => `${i + 1}. Original Point: ${r.originalPoint}
   Rebuttal: ${r.rebuttal}
   Evidence: ${r.evidence}
   Source: ${r.source || 'N/A'}
   Date: ${r.dataDate || 'N/A'}`).join('\n\n')}

=== CROSS-EXAMINATION - BEAR REBUTTALS ===
${rebuttals.bearRebuttals.map((r, i) => `${i + 1}. Original Point: ${r.originalPoint}
   Rebuttal: ${r.rebuttal}
   Evidence: ${r.evidence}
   Source: ${r.source || 'N/A'}
   Date: ${r.dataDate || 'N/A'}`).join('\n\n')}`;
  }

  const prompt = `Translate the following investment analysis content to Simplified Chinese.

=== REPORT CONTENT ===
${reportContent}

=== CONSENSUS SUMMARY POINTS ===
${consensusSummary.map((point, i) => `${i + 1}. ${point}`).join('\n')}
${openingArgumentsSection}
${crossExaminationSection}

=== OUTPUT FORMAT ===
Respond with ONLY valid JSON. No text before or after.

{
  "reportContentChinese": "Chinese translation of the report content...",
  "consensusSummaryChinese": [
    "Chinese translation of point 1",
    "Chinese translation of point 2",
    "Chinese translation of point 3"
  ]${bullOpening && bearOpening ? `,
  "bullOpeningChinese": {
    "thesis": [
      {
        "point": "translated point",
        "evidence": "translated evidence",
        "source": "keep original source or translate publication name",
        "dataDate": "keep original date"
      }
    ]
  },
  "bearOpeningChinese": {
    "thesis": [
      {
        "point": "translated point",
        "evidence": "translated evidence",
        "source": "keep original source or translate publication name",
        "dataDate": "keep original date"
      }
    ]
  }` : ''}${rebuttals ? `,
  "rebuttalsChinese": {
    "bullRebuttals": [
      {
        "originalPoint": "translated original point",
        "rebuttal": "translated rebuttal",
        "evidence": "translated evidence",
        "source": "keep original source or translate publication name",
        "dataDate": "keep original date"
      }
    ],
    "bearRebuttals": [
      {
        "originalPoint": "translated original point",
        "rebuttal": "translated rebuttal",
        "evidence": "translated evidence",
        "source": "keep original source or translate publication name",
        "dataDate": "keep original date"
      }
    ]
  }` : ''}
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
      bullOpeningChinese: parsed.bullOpeningChinese,
      bearOpeningChinese: parsed.bearOpeningChinese,
      rebuttalsChinese: parsed.rebuttalsChinese,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[TranslateAgent] Error:', error);
    throw error;
  }
};
