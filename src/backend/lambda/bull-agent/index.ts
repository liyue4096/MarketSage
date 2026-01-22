// import { Handler } from 'aws-lambda'; // Unavailable in test env
import { GeminiClient } from '../../lambda-layers/shared/nodejs/services/gemini-client';

type Handler<TEvent = any, TResult = any> = (event: TEvent, context: any) => Promise<TResult>;

interface AgentInput {
  ticker: string;
  companyName: string;
  triggerType: '60MA' | '250MA';
  closePrice: number;
  peers: string[];
  newsContext?: string;
  metricsContext?: string;
  debateContext?: string;
}

interface ThesisPoint {
  point: string;
  evidence: string;
  source?: string;
  confidence: number;
}

interface AgentOutput {
  ticker: string;
  role: 'BULL';
  thesis: ThesisPoint[];
  primaryCatalyst: string;
  thinkingTrace: string;
  timestamp: string;
}

const currentDate = new Date().toLocaleDateString('en-US', {
  month: 'long', day: 'numeric', year: 'numeric'
});

export const handler: Handler<AgentInput, AgentOutput> = async (event) => {
  const { ticker, companyName, triggerType, closePrice, peers, newsContext, metricsContext, debateContext } = event;
  console.log(`[BullAgent] Generating bullish thesis for ${ticker}`);

  const gemini = new GeminiClient();

  const systemInstruction = `You are an elite Wall Street Bullish Analyst. Today's date is ${currentDate}.
Your mandate is to identify growth catalysts, momentum, and sector leadership.
You are debating a Bearish Analyst. You must be persuasive but grounded in REAL data.

CRITICAL: Use Google Search to find real, current information about the company.
Do NOT make up or imagine facts. All evidence must come from verifiable sources.

Focus on:
1. The technical significance of the ${triggerType} breakthrough.
2. Positive catalysts in recent news (search for them).
3. Why this company will outperform its peers (${peers.join(', ')}).
${debateContext ? '4. Address the counter-arguments raised by the Bear.' : ''}`;

  const prompt = `
Analyze ${companyName} (${ticker}) which just crossed its ${triggerType} at $${closePrice}.

Context:
News: ${newsContext || 'No specific news provided.'}
Metrics: ${metricsContext || 'No specific metrics provided.'}
Peers: ${peers.join(', ')}
${debateContext ? `
Debate Context (Rebuttals):
${debateContext}

Provide your Final Defense.` : ''}

Provide a structured bullish memo.
IMPORTANT: You MUST respond with ONLY valid JSON, no other text before or after.
Output format (JSON only):
{
  "thesis": [
    { "point": "headline argument", "evidence": "supporting data/news from your search", "confidence": 0.0-1.0 }
  ],
  "primaryCatalyst": "The single most important growth driver"
}
`;

  try {
    const { text, thinkingTrace } = await gemini.generateThinking(prompt, systemInstruction);

    // Extract JSON from response (handle markdown code blocks and extra text)
    let cleanJson = text.replace(/```json\n?|\n?```/g, '').trim();
    // Try to find JSON object in the response
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanJson = jsonMatch[0];
    }
    const parsed = JSON.parse(cleanJson);

    return {
      ticker,
      role: 'BULL',
      thesis: parsed.thesis,
      primaryCatalyst: parsed.primaryCatalyst,
      thinkingTrace: thinkingTrace || 'Thinking trace unavailable',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Bull Agent failed:", error);
    throw error;
  }
};