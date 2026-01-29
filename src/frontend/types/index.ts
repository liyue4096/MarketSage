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
  bullThesis: DebatePoint[];
  bearThesis: DebatePoint[];
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

export interface DailyBreakthrough {
  date: string;
  reports: StockReport[];
}
