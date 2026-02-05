"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiClient = void 0;
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
// Available Gemini models (as of Jan 2026):
// - gemini-3-pro-preview (latest with thinking, preview)
// - gemini-2.5-pro (with thinking capability, stable)
// - gemini-2.5-flash (fast with thinking capability)
// - gemini-pro-latest (alias, may have issues with thinking config)
const DEFAULT_MODEL = "gemini-3-pro-preview";
class GeminiClient {
    apiKey;
    model;
    secretsManager;
    maxRetries = 3;
    baseDelay = 1000; // 1 second
    constructor(model = process.env.GEMINI_MODEL || DEFAULT_MODEL) {
        this.model = model;
        this.secretsManager = new client_secrets_manager_1.SecretsManagerClient({});
        console.log(`[GeminiClient] Initialized with model: ${this.model}`);
    }
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async getApiKey() {
        if (this.apiKey)
            return this.apiKey;
        if (process.env.GEMINI_API_KEY) {
            this.apiKey = process.env.GEMINI_API_KEY;
            return this.apiKey;
        }
        try {
            const secretId = process.env.GEMINI_API_KEY_SECRET || "marketsage/api/gemini";
            const command = new client_secrets_manager_1.GetSecretValueCommand({ SecretId: secretId });
            const response = await this.secretsManager.send(command);
            if (response.SecretString) {
                // Handle if secret is JSON or plain string
                try {
                    const secret = JSON.parse(response.SecretString);
                    this.apiKey = secret.GEMINI_API_KEY || secret.apiKey || response.SecretString;
                }
                catch {
                    this.apiKey = response.SecretString;
                }
                return this.apiKey;
            }
        }
        catch (error) {
            console.warn("Failed to retrieve API key from Secrets Manager:", error);
        }
        throw new Error("Gemini API Key not found in env or Secrets Manager");
    }
    // Simple generate without thinking (for Flash and non-thinking models)
    async generate(prompt, systemInstruction) {
        const apiKey = await this.getApiKey();
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                maxOutputTokens: 500,
                temperature: 0.3,
            }
        };
        if (systemInstruction) {
            payload.systemInstruction = { parts: [{ text: systemInstruction }] };
        }
        let lastError = null;
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                if (response.status === 429) {
                    const errorData = await response.json();
                    const retryDelay = this.extractRetryDelay(errorData);
                    const waitTime = retryDelay || (this.baseDelay * Math.pow(2, attempt));
                    console.warn(`[GeminiClient] Rate limited. Waiting ${waitTime}ms before retry ${attempt + 1}/${this.maxRetries}`);
                    await this.sleep(waitTime);
                    continue;
                }
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Gemini API Error: ${response.status} ${response.statusText} - ${errorText}`);
                }
                const data = await response.json();
                let text = "";
                if (data.candidates?.[0]?.content?.parts) {
                    for (const part of data.candidates[0].content.parts) {
                        if (part.text) {
                            text += part.text;
                        }
                    }
                }
                return text.trim();
            }
            catch (error) {
                lastError = error;
                console.error(`[GeminiClient] Attempt ${attempt + 1} failed:`, error);
                if (attempt < this.maxRetries - 1) {
                    const waitTime = this.baseDelay * Math.pow(2, attempt);
                    console.log(`[GeminiClient] Retrying in ${waitTime}ms...`);
                    await this.sleep(waitTime);
                }
            }
        }
        throw lastError || new Error("Gemini API call failed after retries");
    }
    async generateThinking(prompt, systemInstruction) {
        const apiKey = await this.getApiKey();
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            // Enable Google Search grounding for real-time data
            tools: [{ googleSearch: {} }],
            generationConfig: {
                thinkingConfig: {
                    thinkingLevel: "high",
                    includeThoughts: true
                }
            }
        };
        if (systemInstruction) {
            payload.systemInstruction = { parts: [{ text: systemInstruction }] };
        }
        let lastError = null;
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                if (response.status === 429) {
                    // Rate limited - extract retry delay if available
                    const errorData = await response.json();
                    const retryDelay = this.extractRetryDelay(errorData);
                    const waitTime = retryDelay || (this.baseDelay * Math.pow(2, attempt));
                    console.warn(`[GeminiClient] Rate limited. Waiting ${waitTime}ms before retry ${attempt + 1}/${this.maxRetries}`);
                    await this.sleep(waitTime);
                    continue;
                }
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Gemini API Error: ${response.status} ${response.statusText} - ${errorText}`);
                }
                const data = await response.json();
                let text = "";
                let thinkingTrace = "";
                // Handle parts - separate thinking from output
                if (data.candidates?.[0]?.content?.parts) {
                    for (const part of data.candidates[0].content.parts) {
                        if (part.thought) {
                            // Native thinking part from Gemini 2.0 thinking models
                            thinkingTrace += part.text + "\n";
                        }
                        else if (part.text) {
                            text += part.text;
                        }
                    }
                }
                // Check for search grounding
                const grounding = data.candidates?.[0]?.groundingMetadata;
                if (grounding?.searchEntryPoint) {
                    thinkingTrace += "\n[System] Google Search was used for this response.";
                }
                // Fallback: Try to extract thinking tags if embedded in text
                const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/);
                if (thinkingMatch) {
                    thinkingTrace = thinkingMatch[1].trim();
                    text = text.replace(/<thinking>[\s\S]*?<\/thinking>/, "").trim();
                }
                return {
                    text: text.trim(),
                    thinkingTrace: thinkingTrace.trim() || "No thinking trace available"
                };
            }
            catch (error) {
                lastError = error;
                console.error(`[GeminiClient] Attempt ${attempt + 1} failed:`, error);
                if (attempt < this.maxRetries - 1) {
                    const waitTime = this.baseDelay * Math.pow(2, attempt);
                    console.log(`[GeminiClient] Retrying in ${waitTime}ms...`);
                    await this.sleep(waitTime);
                }
            }
        }
        throw lastError || new Error("Gemini API call failed after retries");
    }
    extractRetryDelay(errorData) {
        try {
            const details = errorData?.error?.details;
            if (Array.isArray(details)) {
                for (const detail of details) {
                    if (detail["@type"]?.includes("RetryInfo") && detail.retryDelay) {
                        // Parse "20s" or "20.5s" format
                        const match = detail.retryDelay.match(/(\d+\.?\d*)/);
                        if (match) {
                            return Math.ceil(parseFloat(match[1]) * 1000);
                        }
                    }
                }
            }
        }
        catch {
            // Ignore parsing errors
        }
        return null;
    }
}
exports.GeminiClient = GeminiClient;
