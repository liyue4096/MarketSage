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

// Get current date for grounding
const currentDate = new Date().toLocaleDateString('en-US', {
  month: 'long', day: 'numeric', year: 'numeric'
});

export const handler: Handler<JudgeInput, JudgeOutput> = async (event) => {
  const { ticker, theses, rebuttals, defenses } = event;
  console.log(`[JudgeAgent] Synthesizing verdict for ${ticker}`);

  const gemini = new GeminiClient();

  /**
   * REINFORCED SYSTEM INSTRUCTION for Judge
   * Emphasizes verification of evidence quality and data recency
   */
  const systemInstruction = `You are the Investment Committee Chair (The Judge).

=== DATE ANCHOR ===
Today's date is ${currentDate}. Use this to evaluate the recency of evidence presented.

=== YOUR MANDATE ===
1. Review the debate between a Bull and Bear analyst objectively
2. CRITICALLY EVALUATE the quality of evidence:
   - Does each thesis point cite a specific source and date?
   - Is the data from January 2026 or is it stale/outdated?
   - Are the numbers verifiable from the cited sources?
3. PENALIZE arguments that:
   - Use vague evidence without specific dates or sources
   - Cite data from before December 2025 without acknowledging it's outdated
   - Make claims that seem inconsistent with current market reality
4. REWARD arguments that:
   - Include specific, dated sources from recent Google Search results
   - Use current (January 2026) commodity prices and market data
   - Acknowledge data limitations honestly

=== VERDICT OPTIONS ===
- "Strong Buy": Bull convincingly won with high-quality, current evidence
- "Neutral": Neither side had sufficiently strong current evidence, or evidence is mixed
- "Short": Bear convincingly won with verified risk factors

=== CONFIDENCE SCORING ===
- 8-10: Multiple thesis points with recent, sourced evidence from both sides
- 5-7: Good evidence but some gaps or outdated data
- 1-4: Poor evidence quality, mostly speculation or stale data`;

  const prompt = `
=== DEBATE RECORD FOR ${ticker} ===

ROUND 1: OPENING ARGUMENTS
Bull Thesis:
${JSON.stringify(theses[0] || theses.bull || {}, null, 2)}

Bear Thesis:
${JSON.stringify(theses[1] || theses.bear || {}, null, 2)}

ROUND 2: CROSS-EXAMINATION (REBUTTALS)
${JSON.stringify(rebuttals, null, 2)}

ROUND 3: FINAL DEFENSE
${defenses ? JSON.stringify(defenses, null, 2) : 'No final defense provided.'}

=== YOUR TASK ===
1. Evaluate the QUALITY of evidence on both sides:
   - Which side used more recent data (January 2026)?
   - Which side cited specific sources?
   - Which side's numbers are more credible?

2. Determine the debate winner based on evidence strength

3. Assign a Confidence Score (1-10) based on evidence quality

4. Write your verdict

=== OUTPUT FORMAT ===
Respond with ONLY valid JSON. No text before or after.

{
  "verdict": "Strong Buy" | "Neutral" | "Short",
  "confidence": 1-10,
  "primaryCatalyst": "The key driver or risk that decided your verdict",
  "consensusSummary": [
    "Key point 1 (with date/source if applicable)",
    "Key point 2 (with date/source if applicable)",
    "Key point 3 (with date/source if applicable)"
  ],
  "reportContent": "2-3 paragraph executive summary explaining your decision, specifically noting which evidence was most compelling and from what sources/dates..."
}

CRITICAL: In your reportContent, explicitly mention if any analyst used outdated data or failed to cite sources.
`;

  try {
    const { text, thinkingTrace } = await gemini.generateThinking(prompt, systemInstruction);

    // Extract JSON from response
    let cleanJson = text.replace(/```json\n?|\n?```/g, '').trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanJson = jsonMatch[0];
    }
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
