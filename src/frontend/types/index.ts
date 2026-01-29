export interface PeerMetric {
  ticker: string;
  companyName: string;
  price: number;
  peRatio: number;
  rsi: number;
  volumeDelta: number;
  relativePerfomance: number;
}

export type VerdictType = 'Strong Buy' | 'Neutral' | 'Short';

export interface StockReport {
  ticker: string;
  companyName: string;
  triggerDate: string;
  triggerType: '20MA' | '60MA' | '250MA';
  breakthroughIntensity: 'Low' | 'Medium' | 'High';
  verdict: VerdictType;
  confidence: number;
  primaryCatalyst: string;
  peerTable: PeerMetric[];
  // Round 1: Opening Arguments
  bullThesis: DebatePoint[];
  bearThesis: DebatePoint[];
  // Round 2: Rebuttals
  rebuttals?: Rebuttals;
  // Round 3: Final Defense
  bullDefense?: DebatePoint[];
  bearDefense?: DebatePoint[];
  // Conclusion
  consensusSummary: string[];
  reportContent: string;
  appendix: string;
  thoughtSignature: string;
}

export interface DebatePoint {
  point: string;
  evidence: string;
  source?: string;
  sourceUrl?: string;
}

export interface RebuttalPoint {
  originalPoint: string;
  rebuttal: string;
  evidence: string;
  source?: string;
  dataDate?: string;
  strengthOfRebuttal: number;
}

export interface Rebuttals {
  bullRebuttals: RebuttalPoint[];
  bearRebuttals: RebuttalPoint[];
}

export interface DailyBreakthrough {
  date: string;
  reports: StockReport[];
}
