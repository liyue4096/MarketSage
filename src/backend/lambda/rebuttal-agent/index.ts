// import { Handler } from 'aws-lambda';
import { GeminiClient } from '../../lambda-layers/shared/nodejs/services/gemini-client';

type Handler<TEvent = any, TResult = any> = (event: TEvent, context: any) => Promise<TResult>;

interface ThesisPoint {
  point: string;
  evidence: string;
  source?: string;
  confidence: number;
}

interface RebuttalInput {
  ticker: string;
  theses: [
    { role: 'BULL'; thesis: ThesisPoint[]; primaryCatalyst: string },
    { role: 'BEAR'; thesis: ThesisPoint[]; primaryRisk: string }
  ];
}

interface RebuttalPoint {
  originalPoint: string;
  rebuttal: string;
  evidence: string;
  strengthOfRebuttal: number;
}

interface RebuttalOutput {
  ticker: string;
  bullRebuttals: RebuttalPoint[];
  bearRebuttals: RebuttalPoint[];
  thinkingTrace: string;
  timestamp: string;
}

export const handler: Handler<RebuttalInput, RebuttalOutput> = async (event) => {
  const { ticker, theses } = event;
  console.log(`[RebuttalAgent] Generating rebuttals for ${ticker}`);

  const bullThesis = theses.find(t => t.role === 'BULL');
  const bearThesis = theses.find(t => t.role === 'BEAR');

  if (!bullThesis || !bearThesis) {
      throw new Error("Missing Bull or Bear thesis for rebuttal");
  }

  const gemini = new GeminiClient();

  const systemInstruction = `You are orchestrating a debate between a Bull and a Bear analyst.
Round 2: Rebuttals.
- The Bull must critique the Bear's logic (valuation traps, risks).
- The Bear must critique the Bull's evidence (catalysts, news).
You must generate specific, hard-hitting rebuttals for each side against the other's specific points.`;

  const prompt = `
Ticker: ${ticker}

Bull Argument:
Primary Catalyst: ${bullThesis.primaryCatalyst}
Points: ${JSON.stringify(bullThesis.thesis)}

Bear Argument:
Primary Risk: ${bearThesis.primaryRisk}
Points: ${JSON.stringify(bearThesis.thesis)}

Generate rebuttals.
Output format (JSON):
{
  "bullRebuttals": [
    { "originalPoint": "Bear's point text", "rebuttal": "Bull's counter-argument", "evidence": "Why Bear is wrong", "strengthOfRebuttal": 0.0-1.0 }
  ],
  "bearRebuttals": [
    { "originalPoint": "Bull's point text", "rebuttal": "Bear's counter-argument", "evidence": "Why Bull is wrong", "strengthOfRebuttal": 0.0-1.0 }
  ]
}
`;

  try {
    const { text, thinkingTrace } = await gemini.generateThinking(prompt, systemInstruction);
    
    const cleanJson = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleanJson);

    return {
      ticker,
      bullRebuttals: parsed.bullRebuttals,
      bearRebuttals: parsed.bearRebuttals,
      thinkingTrace: thinkingTrace || 'Thinking trace unavailable',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Rebuttal Agent failed:", error);
    throw error;
  }
};
