# MarketSage Frontend

A Next.js 15 application providing a sophisticated interface for adversarial stock analysis powered by AI.

## Overview

MarketSage transforms technical stock triggers (60MA/250MA breakthroughs) into high-conviction investment theses using a GAN-inspired multi-agent framework. The frontend provides an intuitive interface to explore daily breakthrough stocks and their comprehensive adversarial analysis.

## Features

### Core Components

1. **DailyBreakthroughFeed** - Sidebar displaying all stocks flagged by the scanner
   - Visual cues for trigger types (60MA/250MA)
   - Color-coded breakthrough intensity
   - Historical date picker

2. **AdversarialAnalysisView** - Comprehensive analysis display
   - **VerdictHeader**: Final consensus with confidence gauge
   - **TrackComparisonMatrix**: Sortable peer comparison table
   - **DebateStage**: Side-by-side bull/bear thesis with expandable points
   - **ConsensusSummary**: Synthesized 3-point conclusion
   - **DeepThinkingAppendix**: Full Gemini 3 thinking trace with search

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn/UI inspired components
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, or pnpm

### Installation

```bash
# Install dependencies
npm install
# or
yarn install
# or
pnpm install
```

### Development

```bash
# Start development server
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build

```bash
# Create production build
npm run build
# or
yarn build
# or
pnpm build
```

### Production

```bash
# Start production server
npm start
# or
yarn start
# or
pnpm start
```

## Project Structure

```
src/frontend/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── ui/               # Base UI components (Badge, Card, Button)
│   ├── analysis/         # Analysis view subcomponents
│   ├── DailyBreakthroughFeed.tsx
│   └── AdversarialAnalysisView.tsx
├── lib/                   # Utility functions
│   └── utils.ts
├── types/                 # TypeScript type definitions
│   └── index.ts
├── data/                  # Mock data for development
│   └── mockData.ts
└── public/               # Static assets
```

## Key Features

### Responsive Design
- Mobile-friendly sidebar that collapses on small screens
- Adaptive grid layouts for different screen sizes

### Interactive Elements
- Sortable peer comparison table
- Expandable debate points with evidence
- Searchable thinking trace appendix
- Downloadable analysis reports

### Visual Indicators
- Color-coded verdicts (Strong Buy, Neutral, Short)
- Breakthrough intensity bars
- Confidence gauges
- RSI overbought/oversold indicators

## Data Flow

Currently using mock data from `data/mockData.ts`. In production:

1. Frontend fetches from API Gateway endpoints
2. Data structure follows `StockReport` interface
3. Real-time updates via polling or WebSocket

## API Integration (Future)

Expected endpoints:
- `GET /api/breakthroughs?date=YYYY-MM-DD` - Get daily breakthroughs
- `GET /api/reports/:ticker/:date` - Get detailed report
- `GET /api/history?startDate=X&endDate=Y` - Get historical data

## Customization

### Styling
- Modify `tailwind.config.ts` for theme colors
- Update `app/globals.css` for CSS variables

### Components
- All UI components in `components/ui/` are customizable
- Analysis components in `components/analysis/` can be extended

## Performance Optimization

- Server-side rendering for initial page load
- Client-side navigation for smooth transitions
- Code splitting via Next.js automatic optimization
- Image optimization ready for production assets

## Contributing

When adding new features:
1. Follow TypeScript strict mode requirements
2. Maintain component modularity
3. Update type definitions in `types/index.ts`
4. Add mock data examples in `data/mockData.ts`

## License

Proprietary - MarketSage Project
