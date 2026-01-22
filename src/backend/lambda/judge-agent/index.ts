// import { Handler } from 'aws-lambda';
import { GeminiClient } from '../../lambda-layers/shared/nodejs/services/gemini-client';

type Handler<TEvent = any, TResult = any> = (event: TEvent, context: any) => Promise<TResult>;

interface JudgeInput {
  ticker: string;
  theses: any;
  rebuttals: any;
  defenses?: any;
}

interface JudgeOutput {
  ticker: string;
  verdict: 'Strong Buy' | 'Neutral' | 'Short';
  confidence: number;
  primaryCatalyst: string;
  consensusSummary: string[];
  reportContent: string;
  thoughtSignature: string;
  appendix: string;
  timestamp: string;
}

export const handler: Handler<JudgeInput, JudgeOutput> = async (event) => {
  const { ticker, theses, rebuttals, defenses } = event;
  console.log(`[JudgeAgent] Synthesizing verdict for ${ticker}`);

  const gemini = new GeminiClient();

  const systemInstruction = `You are the Investment Committee Chair (The Judge).
Your goal is to review the debate between a Bull and a Bear analyst and make a final investment decision.
You must be objective, weighing the evidence, rebuttals, and peer comparisons.
Outcome: "Strong Buy", "Neutral", or "Short" (which means Sell/Avoid).`;

  const prompt = `
Ticker: ${ticker}

Round 1: Opening Arguments
${JSON.stringify(theses)}

Round 2: Rebuttals
${JSON.stringify(rebuttals)}

Round 3: Final Defense
${defenses ? JSON.stringify(defenses) : 'No final defense provided.'}

Task:
1. Determine the winner of the debate.
2. Assign a Confidence Score (1-10).
3. Identify the Primary Catalyst (or Risk if Short).
4. Write a 3-point Consensus Summary.
5. Write a full Executive Summary (Report Content).

Output format (JSON):
{
  "verdict": "Strong Buy | Neutral | Short",
  "confidence": 1-10,
  "primaryCatalyst": "Key driver",
  "consensusSummary": ["Point 1", "Point 2", "Point 3"],
  "reportContent": "Full paragraph summarizing the decision..."
}
`;

  try {
    const { text, thinkingTrace } = await gemini.generateThinking(prompt, systemInstruction);
    
    const cleanJson = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    return {
      ticker,
      verdict: parsed.verdict,
      confidence: parsed.confidence,
      primaryCatalyst: parsed.primaryCatalyst,
      consensusSummary: parsed.consensusSummary,
      reportContent: parsed.reportContent,
      thoughtSignature: `sig_${ticker}_${Date.now()}`,
      appendix: thinkingTrace || 'Thinking trace unavailable',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Judge Agent failed:", error);
    throw error;
  }
};