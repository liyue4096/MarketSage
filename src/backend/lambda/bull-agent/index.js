"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
// import { Handler } from 'aws-lambda'; // Unavailable in test env
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GeminiClient } = require('/opt/nodejs/services/gemini-client');
// Get current date for grounding
const currentDate = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
});
const handler = async (event) => {
    const { ticker, companyName, triggerType, closePrice, peers, newsContext, metricsContext, debateContext } = event;
    console.log(`[BullAgent] Generating bullish thesis for ${ticker}`);
    const gemini = new GeminiClient();
    /**
     * REINFORCED SYSTEM INSTRUCTION
     * Strict hierarchy: Live Search Data > Training Data
     * Explicit date anchoring to prevent stale data usage
     */
    const systemInstruction = `You are an elite Wall Street Bullish Analyst.

=== DATE ANCHOR ===
Today's date is ${currentDate}. This is critical for your analysis.

=== MANDATORY DATA HIERARCHY ===
1. LIVE SEARCH DATA ONLY: You MUST use Google Search to find current prices, news, and metrics.
2. NEVER USE TRAINING DATA for numerical values (prices, volumes, percentages, dates).
3. If your training says "Tungsten is $400/MTU" but Search shows "$800+/MTU", you MUST use the Search result.
4. If you cannot find current data via Search, explicitly state "Data not found via search" rather than guessing.

=== EVIDENCE REQUIREMENTS ===
Every piece of evidence MUST include:
- A specific DATE (e.g., "As of January 20, 2026")
- A specific NUMERICAL VALUE from that date
- The SOURCE (website name or publication)

=== YOUR MANDATE ===
Identify growth catalysts, momentum drivers, and sector leadership.
You are debating a Bearish Analyst. Be persuasive but ONLY use verifiable, current data.

Focus on:
1. The technical significance of the ${triggerType} breakthrough
2. Positive catalysts in recent news (MUST search for them)
3. Why this company will outperform peers (${peers.join(', ')})
${debateContext ? '4. Address counter-arguments raised by the Bear' : ''}`;
    /**
     * GROUNDED PROMPT with VERIFICATION STEP
     * Forces model to search and extract facts before analysis
     */
    const prompt = `
=== STEP 1: FACT EXTRACTION (Required) ===
Before writing your analysis, use Google Search to find and note:
1. Current commodity prices relevant to ${companyName} (with exact date and source)
2. Most recent company news/milestones from the past 30 days
3. Any regulatory or geopolitical catalysts affecting the sector
4. Current trading metrics (volume, RSI if available)

=== STEP 2: ANALYSIS TASK ===
Analyze ${companyName} (${ticker}) which just crossed its ${triggerType} at $${closePrice}.

Context:
News: ${newsContext || 'Search for the latest 48-hour news on ' + ticker}
Metrics: ${metricsContext || 'Search for current RSI, volume trends, and valuation metrics'}
Peers: ${peers.join(', ')}
${debateContext ? `
=== DEBATE REBUTTAL ===
Address these bearish counter-arguments in your thesis:
${debateContext}

Provide your Final Defense with updated evidence.` : ''}

=== STEP 3: OUTPUT FORMAT ===
Respond with ONLY valid JSON. No text before or after the JSON.

{
  "thesis": [
    {
      "point": "Headline argument (one sentence)",
      "evidence": "Specific data with exact numbers from January 2026",
      "source": "Website or publication name where you found this",
      "dataDate": "The date of the data point (e.g., 'January 20, 2026')",
      "confidence": 0.0-1.0
    }
  ],
  "primaryCatalyst": "The single most important growth driver based on your search findings"
}

CRITICAL REMINDERS:
- Every thesis point MUST have a source and dataDate from your Google Search
- Do NOT use any price data from before December 2025
- If you cite a commodity price, it MUST be from January 2026 search results
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
    }
    catch (error) {
        console.error("Bull Agent failed:", error);
        throw error;
    }
};
exports.handler = handler;
