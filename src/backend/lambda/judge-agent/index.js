"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
// import { Handler } from 'aws-lambda';
// eslint-disable-next-line @typescript-eslint/no-var-requires
var GeminiClient = require('/opt/nodejs/services/gemini-client').GeminiClient;
// Get current date for grounding
var currentDate = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
});
var handler = function (event) { return __awaiter(void 0, void 0, void 0, function () {
    var ticker, theses, rebuttals, defenses, gemini, systemInstruction, prompt, _a, text, thinkingTrace, cleanJson, jsonMatch, parsed, error_1;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                ticker = event.ticker, theses = event.theses, rebuttals = event.rebuttals, defenses = event.defenses;
                console.log("[JudgeAgent] Synthesizing verdict for ".concat(ticker));
                gemini = new GeminiClient();
                systemInstruction = "You are the Investment Committee Chair (The Judge).\n\n=== DATE ANCHOR ===\nToday's date is ".concat(currentDate, ". Use this to evaluate the recency of evidence presented.\n\n=== YOUR MANDATE ===\n1. Review the debate between a Bull and Bear analyst objectively\n2. CRITICALLY EVALUATE the quality of evidence:\n   - Does each thesis point cite a specific source and date?\n   - Is the data from January 2026 or is it stale/outdated?\n   - Are the numbers verifiable from the cited sources?\n3. PENALIZE arguments that:\n   - Use vague evidence without specific dates or sources\n   - Cite data from before December 2025 without acknowledging it's outdated\n   - Make claims that seem inconsistent with current market reality\n4. REWARD arguments that:\n   - Include specific, dated sources from recent Google Search results\n   - Use current (January 2026) commodity prices and market data\n   - Acknowledge data limitations honestly\n\n=== VERDICT OPTIONS ===\n- \"Strong Buy\": Bull convincingly won with high-quality, current evidence\n- \"Neutral\": Neither side had sufficiently strong current evidence, or evidence is mixed\n- \"Short\": Bear convincingly won with verified risk factors\n\n=== CONFIDENCE SCORING (BE STRICT) ===\n- 9-10: EXCEPTIONAL - Every thesis point has a dated source from January 2026, numbers are precise and verifiable\n- 7-8: STRONG - Most points have recent sources, minor gaps acceptable, no stale data\n- 5-6: MODERATE - Good arguments but some points lack sources OR use data older than 2 weeks\n- 3-4: WEAK - Multiple unsourced claims, or significant reliance on outdated data (pre-December 2025)\n- 1-2: POOR - Mostly speculation, no credible sources, or fundamentally flawed analysis\n\n=== AUTOMATIC PENALTIES (subtract from base score) ===\n- Any thesis point without a specific source: -1 per occurrence\n- Data older than 30 days without acknowledgment: -2\n- Contradictory claims between thesis points: -1\n- Generic/vague evidence (\"analysts say\", \"market expects\"): -0.5 per occurrence\n\n=== IMPORTANT ===\nDefault to 6 (MODERATE) and adjust up/down based on evidence quality. Do NOT default to high scores.");
                prompt = "\n=== DEBATE RECORD FOR ".concat(ticker, " ===\n\nROUND 1: OPENING ARGUMENTS\nBull Thesis:\n").concat(JSON.stringify(theses[0] || theses.bull || {}, null, 2), "\n\nBear Thesis:\n").concat(JSON.stringify(theses[1] || theses.bear || {}, null, 2), "\n\nROUND 2: CROSS-EXAMINATION (REBUTTALS)\n").concat(JSON.stringify(rebuttals, null, 2), "\n\nROUND 3: FINAL DEFENSE\n").concat(defenses ? JSON.stringify(defenses, null, 2) : 'No final defense provided.', "\n\n=== YOUR TASK ===\n1. Evaluate the QUALITY of evidence on both sides:\n   - Which side used more recent data (January 2026)?\n   - Which side cited specific sources?\n   - Which side's numbers are more credible?\n\n2. Determine the debate winner based on evidence strength\n\n3. Assign a Confidence Score (1-10) based on evidence quality\n\n4. Write your verdict\n\n=== OUTPUT FORMAT ===\nRespond with ONLY valid JSON. No text before or after.\n\n{\n  \"verdict\": \"Strong Buy\" | \"Neutral\" | \"Short\",\n  \"confidence\": 1-10,\n  \"primaryCatalyst\": \"The key driver or risk that decided your verdict\",\n  \"consensusSummary\": [\n    \"Key point 1 (with date/source if applicable)\",\n    \"Key point 2 (with date/source if applicable)\",\n    \"Key point 3 (with date/source if applicable)\"\n  ],\n  \"reportContent\": \"2-3 paragraph executive summary explaining your decision, specifically noting which evidence was most compelling and from what sources/dates...\"\n}\n\nCRITICAL: In your reportContent, explicitly mention if any analyst used outdated data or failed to cite sources.\n");
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, gemini.generateThinking(prompt, systemInstruction)];
            case 2:
                _a = _b.sent(), text = _a.text, thinkingTrace = _a.thinkingTrace;
                cleanJson = text.replace(/```json\n?|\n?```/g, '').trim();
                jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    cleanJson = jsonMatch[0];
                }
                parsed = JSON.parse(cleanJson);
                return [2 /*return*/, {
                        ticker: ticker,
                        verdict: parsed.verdict,
                        confidence: parsed.confidence,
                        primaryCatalyst: parsed.primaryCatalyst,
                        consensusSummary: parsed.consensusSummary,
                        reportContent: parsed.reportContent,
                        thoughtSignature: "sig_".concat(ticker, "_").concat(Date.now()),
                        appendix: thinkingTrace || 'Thinking trace unavailable',
                        timestamp: new Date().toISOString(),
                    }];
            case 3:
                error_1 = _b.sent();
                console.error("Judge Agent failed:", error_1);
                throw error_1;
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.handler = handler;
