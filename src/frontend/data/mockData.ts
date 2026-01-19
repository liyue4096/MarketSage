import { StockReport, DailyBreakthrough } from '@/types';

export const mockReports: StockReport[] = [
  {
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    triggerDate: '2026-01-19',
    triggerType: '250MA',
    breakthroughIntensity: 'High',
    verdict: 'Strong Buy',
    confidence: 8.5,
    primaryCatalyst: 'AI Data Center Expansion',
    peerTable: [
      {
        ticker: 'NVDA',
        companyName: 'NVIDIA Corporation',
        price: 142.50,
        peRatio: 58.2,
        rsi: 72.3,
        volumeDelta: 2.45,
        relativePerfomance: 0
      },
      {
        ticker: 'AMD',
        companyName: 'Advanced Micro Devices',
        price: 118.30,
        peRatio: 42.1,
        rsi: 64.5,
        volumeDelta: 1.82,
        relativePerfomance: -12.4
      },
      {
        ticker: 'INTC',
        companyName: 'Intel Corporation',
        price: 45.20,
        peRatio: 15.3,
        rsi: 48.2,
        volumeDelta: 0.95,
        relativePerfomance: -28.6
      },
      {
        ticker: 'QCOM',
        companyName: 'Qualcomm Inc.',
        price: 156.80,
        peRatio: 18.7,
        rsi: 59.1,
        volumeDelta: 1.15,
        relativePerfomance: -8.2
      }
    ],
    bullThesis: [
      {
        point: 'Market-leading position in AI accelerators with 90%+ data center GPU market share',
        evidence: 'Q4 2025 data center revenue grew 217% YoY to $18.4B, driven by enterprise AI adoption',
        source: 'NVDA Q4 2025 Earnings Report',
        sourceUrl: '#'
      },
      {
        point: 'Strong order backlog for H200 and upcoming Blackwell architecture',
        evidence: 'Management guidance indicates Q1 2026 revenue of $22B (mid-point), representing 15% sequential growth',
        source: 'Investor Conference Call Jan 2026',
        sourceUrl: '#'
      },
      {
        point: 'Technical breakout above 250-day MA with exceptional volume (2.45x average)',
        evidence: 'Institutional buying detected: 15 major funds increased positions in past 30 days',
        source: 'SEC 13F Filings',
        sourceUrl: '#'
      }
    ],
    bearThesis: [
      {
        point: 'Valuation at 58.2x P/E significantly exceeds semiconductor sector median of 24x',
        evidence: 'Current multiple implies perfection; any guidance miss could trigger 20%+ correction',
        source: 'Sector Valuation Analysis',
        sourceUrl: '#'
      },
      {
        point: 'Increasing competitive pressure from AMD MI300 series and custom AI chips',
        evidence: 'Meta and Google announced internal chip development programs, reducing NVDA dependency',
        source: 'Tech Industry Reports',
        sourceUrl: '#'
      },
      {
        point: 'RSI at 72.3 indicates overbought conditions and potential near-term pullback',
        evidence: 'Historical pattern shows NVDA consolidates 10-15% after RSI exceeds 70',
        source: 'Technical Analysis Database',
        sourceUrl: '#'
      }
    ],
    consensusSummary: [
      'NVIDIA maintains structural advantages in AI infrastructure with superior software ecosystem (CUDA) creating high switching costs',
      'Near-term momentum supported by Blackwell ramp and enterprise AI spending acceleration, justifying premium valuation in short-to-medium term',
      'Recommend accumulation on 5-10% pullbacks; monitor competitive developments and RSI cooling as entry signals'
    ],
    reportContent: 'Full synthesized report content here...',
    appendix: `[GEMINI THINKING TRACE]
Agent_Bull: Analyzing NVDA breakthrough above 250MA...
- Data center segment shows exceptional momentum
- Blackwell architecture creating new demand cycle
- Software moat (CUDA) remains unchallenged

Agent_Bear: Challenging bull thesis...
- Valuation stretched vs historical norms
- Competition intensifying in AI chip space
- Overbought technical indicators

Judge_Synthesis: Evaluating arguments...
- Bull case has stronger fundamental support
- Bear concerns valid but largely priced in
- Momentum likely to persist near-term`,
    thoughtSignature: 'NVDA_20260119_250MA_v1_bull-8.5_bear-6.2'
  },
  {
    ticker: 'TSLA',
    companyName: 'Tesla Inc.',
    triggerDate: '2026-01-19',
    triggerType: '60MA',
    breakthroughIntensity: 'Medium',
    verdict: 'Neutral',
    confidence: 5.5,
    primaryCatalyst: 'Model 2 Production Rumors',
    peerTable: [
      {
        ticker: 'TSLA',
        companyName: 'Tesla Inc.',
        price: 245.30,
        peRatio: 68.5,
        rsi: 58.7,
        volumeDelta: 1.35,
        relativePerfomance: 0
      },
      {
        ticker: 'F',
        companyName: 'Ford Motor Company',
        price: 12.80,
        peRatio: 7.2,
        rsi: 52.3,
        volumeDelta: 0.88,
        relativePerfomance: -15.2
      },
      {
        ticker: 'GM',
        companyName: 'General Motors',
        price: 38.50,
        peRatio: 5.8,
        rsi: 49.5,
        volumeDelta: 0.92,
        relativePerfomance: -18.4
      },
      {
        ticker: 'RIVN',
        companyName: 'Rivian Automotive',
        price: 14.20,
        peRatio: -12.3,
        rsi: 45.8,
        volumeDelta: 1.12,
        relativePerfomance: -22.8
      }
    ],
    bullThesis: [
      {
        point: 'Potential game-changer with affordable Model 2 targeting mass market sub-$30K segment',
        evidence: 'Leaked supplier contracts suggest H2 2026 production start in Texas Gigafactory',
        source: 'Industry Supply Chain Analysis',
        sourceUrl: '#'
      },
      {
        point: 'Energy storage business inflecting: Megapack deployments up 140% YoY',
        evidence: 'Q4 2025 energy generation and storage revenue reached $2.3B, becoming meaningful profit driver',
        source: 'TSLA Q4 2025 Results',
        sourceUrl: '#'
      }
    ],
    bearThesis: [
      {
        point: 'Auto gross margins compressed to 16.2%, lowest since 2020 due to price cuts',
        evidence: 'Aggressive pricing strategy to maintain volume eroding profitability faster than cost reductions',
        source: 'Financial Statement Analysis',
        sourceUrl: '#'
      },
      {
        point: 'FSD Full Self-Driving progress slower than promised; regulatory approval uncertain',
        evidence: 'Limited progress on Level 4 autonomy despite $15B cumulative R&D investment',
        source: 'Automotive Tech Reports',
        sourceUrl: '#'
      }
    ],
    consensusSummary: [
      'Mixed signals: Energy business strength offset by auto margin pressure',
      'Model 2 rumors are positive but execution risk remains high',
      'Hold position if owned; wait for clearer catalysts before initiating new positions'
    ],
    reportContent: 'Full synthesized report content here...',
    appendix: '[GEMINI THINKING TRACE]\nAgent analysis continues...',
    thoughtSignature: 'TSLA_20260119_60MA_v1_bull-5.8_bear-6.5'
  },
  {
    ticker: 'PLTR',
    companyName: 'Palantir Technologies',
    triggerDate: '2026-01-19',
    triggerType: '60MA',
    breakthroughIntensity: 'High',
    verdict: 'Strong Buy',
    confidence: 7.8,
    primaryCatalyst: 'Defense Contract Win',
    peerTable: [
      {
        ticker: 'PLTR',
        companyName: 'Palantir Technologies',
        price: 38.60,
        peRatio: 92.5,
        rsi: 68.9,
        volumeDelta: 2.15,
        relativePerfomance: 0
      },
      {
        ticker: 'SNOW',
        companyName: 'Snowflake Inc.',
        price: 158.40,
        peRatio: -48.2,
        rsi: 54.2,
        volumeDelta: 1.05,
        relativePerfomance: -8.5
      },
      {
        ticker: 'DDOG',
        companyName: 'Datadog Inc.',
        price: 112.30,
        peRatio: 185.4,
        rsi: 61.3,
        volumeDelta: 0.95,
        relativePerfomance: -12.1
      },
      {
        ticker: 'NET',
        companyName: 'Cloudflare Inc.',
        price: 88.50,
        peRatio: -124.8,
        rsi: 58.7,
        volumeDelta: 1.20,
        relativePerfomance: -9.8
      }
    ],
    bullThesis: [
      {
        point: 'Secured $1.2B multi-year DoD contract for AI-powered intelligence platform',
        evidence: 'Pentagon announcement confirms PLTR as primary vendor for Project Maven expansion',
        source: 'DoD Press Release Jan 15 2026',
        sourceUrl: '#'
      },
      {
        point: 'Commercial AIP platform showing traction: 80 new customers added in Q4 2025',
        evidence: 'Average contract value increased 35% as enterprises expand from pilots to production deployments',
        source: 'PLTR Investor Update',
        sourceUrl: '#'
      }
    ],
    bearThesis: [
      {
        point: 'Extremely rich valuation at 92.5x P/E with limited near-term path to justification',
        evidence: 'Trading at 3.2x sales vs sector median of 8.5x despite slower growth rate',
        source: 'Valuation Comps Analysis',
        sourceUrl: '#'
      },
      {
        point: 'Heavy reliance on government contracts creates concentration risk',
        evidence: 'Government revenue still 55% of total; budget cuts could materially impact growth',
        source: 'Revenue Breakdown Q4 2025',
        sourceUrl: '#'
      }
    ],
    consensusSummary: [
      'Defense contract win validates long-term thesis and provides revenue visibility',
      'Commercial momentum building but still early innings',
      'Strong buy for growth-oriented portfolios willing to tolerate volatility'
    ],
    reportContent: 'Full synthesized report content here...',
    appendix: '[GEMINI THINKING TRACE]\nDefense sector analysis...',
    thoughtSignature: 'PLTR_20260119_60MA_v1_bull-8.2_bear-5.5'
  }
];

export const mockDailyBreakthroughs: DailyBreakthrough[] = [
  {
    date: '2026-01-19',
    reports: mockReports
  },
  {
    date: '2026-01-18',
    reports: [
      {
        ...mockReports[0],
        ticker: 'MSFT',
        companyName: 'Microsoft Corporation',
        triggerDate: '2026-01-18',
        verdict: 'Strong Buy',
        confidence: 8.0
      }
    ]
  },
  {
    date: '2026-01-17',
    reports: [
      {
        ...mockReports[1],
        ticker: 'AAPL',
        companyName: 'Apple Inc.',
        triggerDate: '2026-01-17',
        verdict: 'Neutral',
        confidence: 6.0
      }
    ]
  }
];
