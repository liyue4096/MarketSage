
# MarketSage – Adversarial LLM Stock Analyst

## 1. Executive Summary
**Project Name:** MarketSage  
**Concept:**  
A decision-support platform that transforms technical stock triggers (60MA/250MA breakthroughs) into high-conviction investment theses. The system utilizes a "GAN-inspired" multi-agent framework to debate the merits of a trade, comparing the target stock against its "track" (sector peers) before generating a final consensus report with a deep-reasoning appendix.

## 2. Technical Stack
- **Frontend:** Next.js 15 (TypeScript), Tailwind CSS, Shadcn/UI
- **AI Engine:** Gemini 3 Thinking API (High Reasoning Mode)
- **Infrastructure:** AWS (Lambda, Step Functions, Aurora PostgreSQL, EventBridge)
- **Language:** Strict TypeScript (End-to-End)
- **Data Sources:** Financial APIs (Polygon.io or Alpaca) for prices, technicals, and news RAG

## 3. Functional Requirements

### 3.1 The Technical Scanner (Daily Trigger)
- **Frequency:** Daily execution at 7:00 PM ET (Post-market close)
- **Logic:**
  - Identify stocks where $Price_{close}$ crossed above the 60-day or 250-day Simple Moving Average (SMA)
- **Data Enrichment:** For every trigger, the system must fetch:
  - **Peer Context:** Top 3 competitors by GICS sub-industry
  - **Relative Metrics:** P/E, RSI, and Volume growth for target and peers
  - **News RAG:** Last 14 days of verified financial news headlines and SEC filing summaries

### 3.2 The Adversarial Engine (GAN Loop)
Instead of a single AI summary, the system runs a multi-turn debate:
- **Agent A (The Bull):** Mandated to find growth catalysts, momentum, and sector leadership
- **Agent B (The Bear):** Mandated to identify valuation traps, structural risks, and peer-relative weakness
- **Interaction:**
  1. **Round 1:** Independent thesis generation
  2. **Round 2:** Direct Rebuttal (Agents must critique the other's evidence)
  3. **Round 3:** Final Synthesis (A neutral "Judge" layer generates the summary)
- **Persistence:** The system must store the `thoughtSignature` (Logic DNA) for the 2-month retrospective

### 3.3 The Retro-Exam (Accountability Engine)
- **Trigger:** Automated execution at T+60 Days
- **Process:**
  1. Fetch the original `thoughtSignature` and appendix
  2. Pull the actual price performance over the 60-day window
  3. Prompt: Gemini 3 reviews its prior "Thinking" and identifies where the Bull or Bear logic deviated from reality
- **Metric:** "Logic Accuracy Score" (1-100)

## 4. Frontend High-Level Design

### 4.1 UI Component Architecture

The frontend is structured as a **Single Page Application (SPA)** within Next.js, prioritizing real-time data visualization and a clear separation between "Executive Summaries" and "Deep Reasoning" for optimal user experience.

#### **Component Hierarchy & Responsibilities**


- **DailyBreakthroughFeed (Sidebar/List)** (Parent Component)
    - a static list of all stocks flagged by the scanner for the current date.
    - Each stock entry includes:
        - **Visual Cues:**
        - Simple badges for "60MA" or "250MA" triggers
        - Color-coded "Breakthrough Intensity" (based on volume vs. 30-day average)
    - **History Picker:**
    - A calendar component allowing users to view reports from previous days

- **AdversarialAnalysisView** (Child Component)
  - **Purpose:** Presents the full adversarial analysis for a selected stock trigger
  - **Subcomponents:**
    - **VerdictHeader:**
      - Displays the final consensus (e.g., "Bullish Outperformer")
      - Includes a Confidence Gauge (1-10 scale)
      - Shows a "Primary Catalyst" badge (e.g., "Earnings Beat", "Sector Rotation")
    - **TrackComparisonMatrix:**
      - Responsive, sortable table using Shadcn/UI
      - Highlights Target Stock vs. 3 Peers
      - Key metrics: Relative Strength Index (RSI), P/E Ratio, Volume Delta, and other sector-relevant stats
      - Visual cues (color, icons) for outperformance/underperformance
    - **DebateStage:**
      - "Split-View" interface showing Bull Thesis and Bear Rebuttal side-by-side
      - Each argument is linked to a specific news citation or data point (with hover/click to view source)
      - Supports expandable/collapsible points for clarity
    - **ConsensusSummary:**
      - 3-point synthesized conclusion summarizing the high-probability path forward
      - Each point is concise, actionable, and references supporting evidence
    - **AppendixA: DeepThinking:**
      - Collapsible, code-styled panel for power users
      - Displays the Gemini 3 Thinking Trace (internal monologue and raw agent dialogue)
      - Search and highlight functionality for keywords or agent names
      - Download/export option for full trace logs

### 4.2 Data Fetching (TypeScript Pattern)

```typescript
// Example Interface for the Frontend
export interface StockReport {
  ticker: string;
  triggerDate: string;
  verdict: 'Strong Buy' | 'Neutral' | 'Short';
  confidence: number;
  peerTable: PeerMetric[]; // Track comparison data
  reportContent: string;   // The Synthesized summary
  appendix: string;        // Full 'Thinking' logs
  thoughtSignature: string; // For the 3-month Retro
}
```

## 5. System Architecture (AWS)

| Layer            | Service            | Role                                                                                  |
|------------------|--------------------|---------------------------------------------------------------------------------------|
| **Frontend**     | AWS Amplify        | Hosts the Next.js 15 application, providing global CDN distribution and SSR compute.  |
| **API Layer**    | API Gateway        | Serves as the secure entry point for frontend requests, routing to backend services.  |
| **Orchestration**| AWS Step Functions | Coordinates the end-to-end workflow: Batch Scanning, Gemini Analysis, and Data Persistence. |
| **Logic Engine** | AWS Lambda         | Executes technical trigger scans and invokes Gemini 3 API for adversarial analysis.   |
| **Persistence**  | Amazon Aurora      | Stores structured JSON reports, thoughtSignatures, and historical analysis data.      |

**Key Architectural Notes:**
- All services are fully managed and serverless, ensuring scalability and cost efficiency.
- Data flow is event-driven: technical triggers initiate Step Functions, which orchestrate Lambda executions and database updates.
- Security is enforced via IAM roles, VPC integration, and API Gateway authentication.
- Aurora PostgreSQL is optimized for transactional integrity and analytical queries, supporting both real-time and retrospective analysis.