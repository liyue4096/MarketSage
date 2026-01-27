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
    const { ticker, companyName, triggerType, closePrice, peers, newsContext, metricsContext, debateContext } = event;
    console.log(`[BearAgent] Generating bearish thesis for ${ticker}`);
    const gemini = new GeminiClient();
    /**
     * REINFORCED SYSTEM INSTRUCTION
     * Strict hierarchy: Live Search Data > Training Data
     * Explicit date anchoring to prevent stale data usage
     */
    const systemInstruction = `You are a skeptical Wall Street Bearish Analyst (Short Seller).

=== DATE ANCHOR ===
Today's date is ${currentDate}. This is critical for your analysis.

=== MANDATORY DATA HIERARCHY ===
1. LIVE SEARCH DATA ONLY: You MUST use Google Search to find current prices, news, and metrics.
2. NEVER USE TRAINING DATA for numerical values (prices, volumes, percentages, dates).
3. If your training says a commodity price is X but Search shows a different value, you MUST use the Search result.
4. If you cannot find current data via Search, explicitly state "Data not found via search" rather than guessing.

=== EVIDENCE REQUIREMENTS ===
Every piece of evidence MUST include:
- A specific DATE (e.g., "As of January 20, 2026")
- A specific NUMERICAL VALUE from that date
- The SOURCE (website name or publication)

=== YOUR MANDATE ===
Identify valuation traps, structural risks, and peer-relative weakness.
You are debating a Bullish Analyst. Critique the "breakout" narrative with REAL data.

Focus on:
1. Why the ${triggerType} breakthrough might be a "bull trap"
2. Negative catalysts or risks in recent news (MUST search for them)
3. Why this company is weaker than peers (${peers.join(', ')})
${debateContext ? '4. Address counter-arguments raised by the Bull' : ''}`;
    /**
     * GROUNDED PROMPT with VERIFICATION STEP
     * Forces model to search and extract facts before analysis
     */
    const prompt = `
=== STEP 1: FACT EXTRACTION (Required) ===
Before writing your analysis, use Google Search to find and note:
1. Current commodity prices and any recent volatility (with exact date and source)
2. Company-specific risks: debt levels, operational issues, management concerns
3. Regulatory or geopolitical headwinds affecting the sector
4. Peer comparison data: how does ${ticker} compare to ${peers.join(', ')}?

=== STEP 2: ANALYSIS TASK ===
Analyze ${companyName} (${ticker}) which just crossed its ${triggerType} at $${closePrice}.

Context:
News: ${newsContext || 'Search for the latest 48-hour news on ' + ticker}
Metrics: ${metricsContext || 'Search for current debt/equity, cash burn, and valuation multiples'}
Peers: ${peers.join(', ')}
${debateContext ? `
=== DEBATE REBUTTAL ===
Address these bullish counter-arguments in your thesis:
${debateContext}

Provide your Final Defense with updated evidence.` : ''}

=== STEP 3: OUTPUT FORMAT ===
Respond with ONLY valid JSON. No text before or after the JSON.

{
  "thesis": [
    {
      "point": "Headline risk (one sentence)",
      "evidence": "Specific data with exact numbers from January 2026",
      "source": "Website or publication name where you found this",
      "dataDate": "The date of the data point (e.g., 'January 20, 2026')",
      "confidence": 0.0-1.0
    }
  ],
  "primaryRisk": "The single most dangerous risk factor based on your search findings"
}

CRITICAL REMINDERS:
- Every thesis point MUST have a source and dataDate from your Google Search
- Do NOT use any price data from before December 2025
- Focus on verifiable risks, not speculation
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
    }
    catch (error) {
        console.error("Bear Agent failed:", error);
        throw error;
    }
};
exports.handler = handler;
