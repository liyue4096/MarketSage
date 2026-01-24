// Load environment variables from .env file
import * as dotenv from './lambda-layers/shared/nodejs/node_modules/dotenv';
dotenv.config();

import { handler as bullHandler } from './lambda/bull-agent/index';
import { handler as bearHandler } from './lambda/bear-agent/index';
import { handler as rebuttalHandler } from './lambda/rebuttal-agent/index';
import { handler as judgeHandler } from './lambda/judge-agent/index';
import { handler as analysisStoreHandler } from './lambda/analysis-store/index';

// Shared type definitions
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

// Real market data for ALM (Almonty Industries Inc - Tungsten Mining)
// Crossed 20MA on 2026-01-20
const almData = {
    ticker: 'ALM',
    companyName: 'Almonty Industries Inc',
    triggerType: '60MA' as const,
    closePrice: 9.69,  // Open: 9.69, High: 10.29, Low: 9.54
    peers: ['LUN', 'FM', 'CS'],  // Mining peers: Lundin, First Quantum, Capstone
    newsContext: 'Use Google Search to find the latest news about Almonty Industries, Sangdong tungsten mine, and critical minerals market.',
    metricsContext: 'Use Google Search to find current RSI, volume, P/E ratio and other metrics for ALM'
};

// Empty Lambda context for local testing
const emptyContext = {};

async function runGanLoop() {
    console.log("=".repeat(60));
    console.log("MarketSage GAN Loop - Adversarial Analysis");
    console.log(`Ticker: ${almData.ticker} (${almData.companyName})`);
    console.log(`Trigger: ${almData.triggerType} breakthrough at $${almData.closePrice}`);
    console.log("=".repeat(60));

    // Round 1: Opening Arguments (Bull & Bear Memos)
    console.log("\n--- Round 1: Opening Arguments ---");
    console.log("Running Bull and Bear agents in parallel...\n");

    const [bullOutput, bearOutput] = await Promise.all([
        bullHandler(almData, emptyContext),
        bearHandler(almData, emptyContext)
    ]);

    console.log("BULL Thesis:");
    console.log(JSON.stringify(bullOutput.thesis, null, 2));
    console.log(`Primary Catalyst: ${bullOutput.primaryCatalyst}\n`);

    console.log("BEAR Thesis:");
    console.log(JSON.stringify(bearOutput.thesis, null, 2));
    console.log(`Primary Risk: ${bearOutput.primaryRisk}\n`);

    // Round 2: First Rebuttal
    console.log("\n--- Round 2: First Rebuttal ---");
    const rebuttalInput: RebuttalInput = {
        ticker: almData.ticker,
        theses: [
            { role: 'BULL', thesis: bullOutput.thesis, primaryCatalyst: bullOutput.primaryCatalyst },
            { role: 'BEAR', thesis: bearOutput.thesis, primaryRisk: bearOutput.primaryRisk }
        ]
    };

    const rebuttalOutput = await rebuttalHandler(rebuttalInput, emptyContext);

    console.log("Bull's Rebuttals to Bear:");
    console.log(JSON.stringify(rebuttalOutput.bullRebuttals, null, 2));
    console.log("\nBear's Rebuttals to Bull:");
    console.log(JSON.stringify(rebuttalOutput.bearRebuttals, null, 2));

    // Round 3: Final Defense (each agent addresses opponent's rebuttals)
    console.log("\n--- Round 3: Final Defense ---");
    console.log("Running final defense arguments in parallel...\n");

    // Bull defends against Bear's rebuttals; Bear defends against Bull's rebuttals
    const bullDefenseContext = `Bear's Rebuttals against your thesis:\n${JSON.stringify(rebuttalOutput.bearRebuttals, null, 2)}`;
    const bearDefenseContext = `Bull's Rebuttals against your thesis:\n${JSON.stringify(rebuttalOutput.bullRebuttals, null, 2)}`;

    const [bullDefense, bearDefense] = await Promise.all([
        bullHandler({ ...almData, debateContext: bullDefenseContext }, emptyContext),
        bearHandler({ ...almData, debateContext: bearDefenseContext }, emptyContext)
    ]);

    console.log("Bull Final Defense:");
    console.log(JSON.stringify(bullDefense.thesis, null, 2));
    console.log("\nBear Final Defense:");
    console.log(JSON.stringify(bearDefense.thesis, null, 2));

    // Round 4: The Judge (Investment Committee Chair)
    console.log("\n--- Round 4: The Judge ---");
    const judgeInput = {
        ticker: almData.ticker,
        theses: [bullOutput, bearOutput],
        rebuttals: rebuttalOutput,
        defenses: [bullDefense, bearDefense]
    };

    const judgeOutput = await judgeHandler(judgeInput, emptyContext);

    console.log("\n" + "=".repeat(60));
    console.log("FINAL VERDICT");
    console.log("=".repeat(60));
    console.log(`Ticker: ${judgeOutput.ticker}`);
    console.log(`Verdict: ${judgeOutput.verdict}`);
    console.log(`Confidence: ${judgeOutput.confidence}/10`);
    console.log(`Primary Catalyst: ${judgeOutput.primaryCatalyst}`);
    console.log("\nConsensus Summary:");
    judgeOutput.consensusSummary.forEach((point, i) => {
        console.log(`  ${i + 1}. ${point}`);
    });
    console.log("\nExecutive Report:");
    console.log(judgeOutput.reportContent);
    console.log("\nThought Signature:", judgeOutput.thoughtSignature);
    console.log("=".repeat(60));

    // Store analysis to database
    console.log("\n--- Storing Analysis to Database ---");
    const storeResult = await analysisStoreHandler({
        action: 'store-analysis',
        triggerDate: new Date().toISOString().split('T')[0], // Today's date
        triggerType: almData.triggerType,
        closePrice: almData.closePrice,
        peers: almData.peers,
        bullOpening: bullOutput,
        bearOpening: bearOutput,
        rebuttals: rebuttalOutput,
        bullDefense: bullDefense,
        bearDefense: bearDefense,
        judge: judgeOutput
    }, emptyContext);

    if (storeResult.success) {
        console.log(`Analysis stored successfully!`);
        console.log(`Thought Signature: ${storeResult.thoughtSignature}`);
        console.log(`Message: ${storeResult.message}`);
    } else {
        console.error(`Failed to store analysis: ${storeResult.message}`);
    }

    return judgeOutput;
}

// Run the GAN loop
runGanLoop()
    .then(() => {
        console.log("\nGAN Loop completed successfully.");
        process.exit(0);
    })
    .catch((error) => {
        console.error("\nGAN Loop failed:", error);
        process.exit(1);
    });