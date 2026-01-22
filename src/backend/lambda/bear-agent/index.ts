// import { Handler } from 'aws-lambda';
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
  role: 'BEAR';
  thesis: ThesisPoint[];
  primaryRisk: string;
  thinkingTrace: string;
  timestamp: string;
}

const currentDate = new Date().toLocaleDateString('en-US', {
  month: 'long', day: 'numeric', year: 'numeric'
});

export const handler: Handler<AgentInput, AgentOutput> = async (event) => {
  const { ticker, companyName, triggerType, closePrice, peers, newsContext, metricsContext, debateContext } = event;
  console.log(`[BearAgent] Generating bearish thesis for ${ticker}`);

  const gemini = new GeminiClient();

  const systemInstruction = `You are a skeptical Wall Street Bearish Analyst (Short Seller). Today's date is ${currentDate}.
Your mandate is to identify valuation traps, structural risks, and peer-relative weakness.
You are debating a Bullish Analyst. You must critique the "breakout" narrative.

CRITICAL: Use Google Search to find real, current information about the company.
Do NOT make up or imagine facts. All evidence must come from verifiable sources.

Focus on:
1. Why the ${triggerType} breakthrough might be a "bull trap".
2. Negative catalysts or risks in recent news (search for them).
3. Why this company is weaker than its peers (${peers.join(', ')}).
${debateContext ? '4. Address the counter-arguments raised by the Bull.' : ''}`;

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

Provide a structured bearish memo.
IMPORTANT: You MUST respond with ONLY valid JSON, no other text before or after.
Output format (JSON only):
{
  "thesis": [
    { "point": "headline risk", "evidence": "supporting data/news from your search", "confidence": 0.0-1.0 }
  ],
  "primaryRisk": "The single most dangerous risk factor"
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
      role: 'BEAR',
      thesis: parsed.thesis,
      primaryRisk: parsed.primaryRisk,
      thinkingTrace: thinkingTrace || 'Thinking trace unavailable',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Bear Agent failed:", error);
    throw error;
  }
};