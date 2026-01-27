"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
// import { Handler } from 'aws-lambda';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GeminiClient } = require('/opt/nodejs/services/gemini-client');
// Get current date for grounding
const currentDate = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
});
const handler = async (event) => {
    const { ticker, theses } = event;
    console.log(`[RebuttalAgent] Generating rebuttals for ${ticker}`);
    const bullThesis = theses.find(t => t.role === 'BULL');
    const bearThesis = theses.find(t => t.role === 'BEAR');
    if (!bullThesis || !bearThesis) {
        throw new Error("Missing Bull or Bear thesis for rebuttal");
    }
    const gemini = new GeminiClient();
    /**
     * REINFORCED SYSTEM INSTRUCTION for Rebuttal Agent
     * Emphasizes fact-checking opponent's claims with current data
     */
    const systemInstruction = `You are orchestrating Round 2 of a debate between a Bull and Bear analyst.

=== DATE ANCHOR ===
Today's date is ${currentDate}. Use this to evaluate the recency of arguments.

=== YOUR MANDATE ===
Generate hard-hitting, evidence-based rebuttals for each side.

=== REBUTTAL RULES ===
1. FACT-CHECK the opponent's claims using Google Search
2. If opponent cited outdated data, find CURRENT data to counter it
3. If opponent's source is unreliable, find a better source
4. Each rebuttal MUST include:
   - A specific counter-argument
   - Counter-evidence with DATE and SOURCE from your search
   - Assessment of rebuttal strength

=== WHAT MAKES A STRONG REBUTTAL ===
- Directly addresses the opponent's specific claim
- Uses MORE RECENT data than opponent (January 2026)
- Cites a credible source
- Exposes logical flaws or outdated assumptions

=== WHAT MAKES A WEAK REBUTTAL ===
- Generic disagreement without specific evidence
- Using older data than opponent
- No source citation
- Ad hominem attacks or speculation`;
    const prompt = `
=== DEBATE CONTEXT FOR ${ticker} ===

BULL ARGUMENT:
Primary Catalyst: ${bullThesis.primaryCatalyst}
Thesis Points:
${JSON.stringify(bullThesis.thesis, null, 2)}

BEAR ARGUMENT:
Primary Risk: ${bearThesis.primaryRisk}
Thesis Points:
${JSON.stringify(bearThesis.thesis, null, 2)}

=== YOUR TASK ===
1. Use Google Search to fact-check EACH thesis point
2. Generate rebuttals from Bull against Bear's points
3. Generate rebuttals from Bear against Bull's points
4. Each rebuttal must cite a specific source and date

=== OUTPUT FORMAT ===
Respond with ONLY valid JSON. No text before or after.

{
  "bullRebuttals": [
    {
      "originalPoint": "The exact Bear point being challenged",
      "rebuttal": "Bull's counter-argument",
      "evidence": "Specific counter-evidence with numbers from January 2026",
      "source": "Website or publication name",
      "dataDate": "Date of the counter-evidence (e.g., 'January 20, 2026')",
      "strengthOfRebuttal": 0.0-1.0
    }
  ],
  "bearRebuttals": [
    {
      "originalPoint": "The exact Bull point being challenged",
      "rebuttal": "Bear's counter-argument",
      "evidence": "Specific counter-evidence with numbers from January 2026",
      "source": "Website or publication name",
      "dataDate": "Date of the counter-evidence (e.g., 'January 20, 2026')",
      "strengthOfRebuttal": 0.0-1.0
    }
  ]
}

CRITICAL REMINDERS:
- Every rebuttal MUST have a source and dataDate
- Rebuttals using January 2026 data against December 2025 data are STRONG
- Rebuttals without sources are WEAK (rate them 0.3 or lower)
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
            bullRebuttals: parsed.bullRebuttals,
            bearRebuttals: parsed.bearRebuttals,
            thinkingTrace: thinkingTrace || 'Thinking trace unavailable',
            timestamp: new Date().toISOString(),
        };
    }
    catch (error) {
        console.error("Rebuttal Agent failed:", error);
        throw error;
    }
};
exports.handler = handler;
