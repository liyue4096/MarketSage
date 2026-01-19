# MarketSage Component Guide

## Visual Component Hierarchy

```
┌─────────────────────────────────────────────────────────────────────┐
│ App Layout (layout.tsx)                                             │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ Home Page (page.tsx) - State Management                         │ │
│ │ ┌──────────────┬────────────────────────────────────────────┐   │ │
│ │ │              │                                            │   │ │
│ │ │  Sidebar     │         Main Content Area                  │   │ │
│ │ │  (320px)     │         (Flex: 1)                          │   │ │
│ │ │              │                                            │   │ │
│ │ │ Daily        │    Adversarial Analysis View               │   │ │
│ │ │ Breakthrough │    ┌────────────────────────────────────┐  │   │ │
│ │ │ Feed         │    │ VerdictHeader                      │  │   │ │
│ │ │              │    │  - Ticker, Company Name            │  │   │ │
│ │ │ ┌──────────┐ │    │  - Verdict Badge                   │  │   │ │
│ │ │ │ Header   │ │    │  - Confidence Gauge (0-10)         │  │   │ │
│ │ │ │ - Logo   │ │    │  - Primary Catalyst                │  │   │ │
│ │ │ │ - Title  │ │    └────────────────────────────────────┘  │   │ │
│ │ │ │ - Date   │ │    ┌────────────────────────────────────┐  │   │ │
│ │ │ │   Picker │ │    │ TrackComparisonMatrix              │  │   │ │
│ │ │ └──────────┘ │    │  - Sortable Table                  │  │   │ │
│ │ │              │    │  - Target vs 3 Peers               │  │   │ │
│ │ │ ┌──────────┐ │    │  - Metrics: Price, P/E, RSI,       │  │   │ │
│ │ │ │ Stock 1  │ │    │    Volume Δ, Rel Performance       │  │   │ │
│ │ │ │ NVDA     │◄├────│  - Color-coded indicators          │  │   │ │
│ │ │ │ 250MA    │ │    └────────────────────────────────────┘  │   │ │
│ │ │ │ High     │ │    ┌────────────────────────────────────┐  │   │ │
│ │ │ │ Conf:8.5 │ │    │ DebateStage                        │  │   │ │
│ │ │ └──────────┘ │    │ ┌──────────┐  ┌──────────┐         │  │   │ │
│ │ │              │    │ │ Bull     │  │ Bear     │         │  │   │ │
│ │ │ ┌──────────┐ │    │ │ Thesis   │  │ Thesis   │         │  │   │ │
│ │ │ │ Stock 2  │ │    │ │          │  │          │         │  │   │ │
│ │ │ │ TSLA     │ │    │ │ [Point 1]│  │ [Point 1]│         │  │   │ │
│ │ │ │ 60MA     │ │    │ │  - Evid  │  │  - Evid  │         │  │   │ │
│ │ │ │ Medium   │ │    │ │  - Source│  │  - Source│         │  │   │ │
│ │ │ │ Conf:5.5 │ │    │ │          │  │          │         │  │   │ │
│ │ │ └──────────┘ │    │ │ [Point 2]│  │ [Point 2]│         │  │   │ │
│ │ │              │    │ │ [Point 3]│  │ [Point 3]│         │  │   │ │
│ │ │ ┌──────────┐ │    │ └──────────┘  └──────────┘         │  │   │ │
│ │ │ │ Stock 3  │ │    └────────────────────────────────────┘  │   │ │
│ │ │ │ PLTR     │ │    ┌────────────────────────────────────┐  │   │ │
│ │ │ │ 60MA     │ │    │ ConsensusSummary                   │  │   │ │
│ │ │ │ High     │ │    │  ✓ Point 1                         │  │   │ │
│ │ │ │ Conf:7.8 │ │    │  ✓ Point 2                         │  │   │ │
│ │ │ └──────────┘ │    │  ✓ Point 3                         │  │   │ │
│ │ │              │    └────────────────────────────────────┘  │   │ │
│ │ │              │    ┌────────────────────────────────────┐  │   │ │
│ │ │              │    │ DeepThinkingAppendix [Collapsed]   │  │   │ │
│ │ │              │    │  📦 Expand to view trace           │  │   │ │
│ │ │              │    │  🔍 Search functionality           │  │   │ │
│ │ │              │    │  💾 Download option                │  │   │ │
│ │ │              │    └────────────────────────────────────┘  │   │ │
│ │ │              │                                            │   │ │
│ │ └──────────────┴────────────────────────────────────────────┘   │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Props & Data Flow

### 1. Home Page (page.tsx)
**State**:
```typescript
selectedReport: StockReport | null
```

**Data Sources**:
- `mockDailyBreakthroughs` from `data/mockData.ts`

**Props Passed Down**:
```typescript
<DailyBreakthroughFeed
  breakthroughs={mockDailyBreakthroughs}
  selectedReport={selectedReport}
  onSelectReport={setSelectedReport}
/>

<AdversarialAnalysisView
  report={selectedReport}
/>
```

### 2. DailyBreakthroughFeed
**Props**:
```typescript
{
  breakthroughs: DailyBreakthrough[];
  selectedReport: StockReport | null;
  onSelectReport: (report: StockReport) => void;
}
```

**Internal State**:
```typescript
selectedDate: string
```

**Responsibilities**:
- Display list of stocks for selected date
- Date picker navigation
- Stock selection handler
- Visual highlighting of selected stock

### 3. AdversarialAnalysisView
**Props**:
```typescript
{
  report: StockReport | null;
}
```

**Responsibilities**:
- Coordinate all analysis subcomponents
- Handle null state (no selection)
- Pass data to child components

**Child Components**:
```typescript
<VerdictHeader report={report} />
<TrackComparisonMatrix peerTable={report.peerTable} targetTicker={report.ticker} />
<DebateStage bullThesis={report.bullThesis} bearThesis={report.bearThesis} />
<ConsensusSummary summary={report.consensusSummary} />
<DeepThinkingAppendix appendix={report.appendix} thoughtSignature={report.thoughtSignature} />
```

### 4. VerdictHeader
**Props**:
```typescript
{
  report: StockReport
}
```

**Displays**:
- Ticker symbol and company name
- Trigger type badge (60MA/250MA)
- Trigger date
- Final verdict (Strong Buy/Neutral/Short)
- Confidence score with progress bar
- Primary catalyst

### 5. TrackComparisonMatrix
**Props**:
```typescript
{
  peerTable: PeerMetric[];
  targetTicker: string;
}
```

**Internal State**:
```typescript
sortKey: 'ticker' | 'price' | 'peRatio' | 'rsi' | 'volumeDelta' | 'relativePerfomance'
sortAsc: boolean
```

**Features**:
- Sortable columns (click header to sort)
- Highlight target stock
- Color-coded performance indicators
- Responsive table layout

### 6. DebateStage
**Props**:
```typescript
{
  bullThesis: DebatePoint[];
  bearThesis: DebatePoint[];
}
```

**Internal State**:
```typescript
expandedPoints: number[] (per ThesisCard)
```

**Sub-component: ThesisCard**:
```typescript
{
  title: string;
  icon: React.ReactNode;
  thesis: DebatePoint[];
  colorScheme: 'green' | 'red';
}
```

**Features**:
- Split-view layout (Bull vs Bear)
- Expandable points with evidence
- Source citations with links
- Color-coded by stance

### 7. ConsensusSummary
**Props**:
```typescript
{
  summary: string[];
}
```

**Displays**:
- 3-point synthesized conclusion
- Checkmark icons
- Numbered points
- Gradient background

### 8. DeepThinkingAppendix
**Props**:
```typescript
{
  appendix: string;
  thoughtSignature: string;
}
```

**Internal State**:
```typescript
isExpanded: boolean
searchQuery: string
```

**Features**:
- Collapsible panel
- Search with highlighting
- Download functionality
- Monospace code display

## UI Components (Reusable)

### Badge
**Location**: `components/ui/badge.tsx`

**Variants**:
- `default` - Primary blue
- `secondary` - Gray
- `destructive` - Red
- `outline` - Border only

**Usage**:
```typescript
<Badge>60MA</Badge>
<Badge variant="outline">3 Points</Badge>
```

### Card
**Location**: `components/ui/card.tsx`

**Parts**:
- `Card` - Container
- `CardHeader` - Header section
- `CardTitle` - Title text
- `CardDescription` - Subtitle
- `CardContent` - Main content
- `CardFooter` - Footer section

**Usage**:
```typescript
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content here</CardContent>
</Card>
```

### Button
**Location**: `components/ui/button.tsx`

**Variants**:
- `default` - Primary blue
- `destructive` - Red
- `outline` - Border only
- `secondary` - Gray
- `ghost` - Transparent
- `link` - Link style

**Sizes**:
- `default` - Medium
- `sm` - Small
- `lg` - Large
- `icon` - Icon button

**Usage**:
```typescript
<Button variant="outline" size="sm">
  Click me
</Button>
```

## Type Definitions

### StockReport
```typescript
interface StockReport {
  ticker: string;
  companyName: string;
  triggerDate: string;
  triggerType: '60MA' | '250MA';
  breakthroughIntensity: 'Low' | 'Medium' | 'High';
  verdict: VerdictType;
  confidence: number; // 0-10
  primaryCatalyst: string;
  peerTable: PeerMetric[];
  bullThesis: DebatePoint[];
  bearThesis: DebatePoint[];
  consensusSummary: string[];
  reportContent: string;
  appendix: string;
  thoughtSignature: string;
}
```

### PeerMetric
```typescript
interface PeerMetric {
  ticker: string;
  companyName: string;
  price: number;
  peRatio: number;
  rsi: number;
  volumeDelta: number;
  relativePerfomance: number;
}
```

### DebatePoint
```typescript
interface DebatePoint {
  point: string;
  evidence: string;
  source?: string;
  sourceUrl?: string;
}
```

### DailyBreakthrough
```typescript
interface DailyBreakthrough {
  date: string;
  reports: StockReport[];
}
```

## Utility Functions

### cn(...inputs)
Merges Tailwind CSS class names intelligently
```typescript
cn("text-sm", "font-bold", className)
```

### formatDate(dateString)
Formats ISO date to readable format
```typescript
formatDate("2026-01-19") // "Jan 19, 2026"
```

### formatPercentage(value)
Formats numbers as percentages
```typescript
formatPercentage(12.5) // "+12.50%"
formatPercentage(-5.2) // "-5.20%"
```

### getVerdictColor(verdict)
Returns Tailwind classes for verdict styling
```typescript
getVerdictColor("Strong Buy") // "text-green-600 bg-green-50 border-green-200"
```

### getIntensityColor(intensity)
Returns Tailwind classes for intensity bars
```typescript
getIntensityColor("High") // "bg-purple-600"
```

## Color System

### Verdict Colors
- **Strong Buy**: `green-600` / `green-50` / `green-200`
- **Neutral**: `yellow-600` / `yellow-50` / `yellow-200`
- **Short**: `red-600` / `red-50` / `red-200`

### Trigger Type Colors
- **60MA**: `blue-100` / `blue-700` / `blue-200`
- **250MA**: `purple-100` / `purple-700` / `purple-200`

### Intensity Colors
- **High**: `purple-600`
- **Medium**: `blue-600`
- **Low**: `gray-600`

### Debate Colors
- **Bull**: `green-50` / `green-600` / `green-200`
- **Bear**: `red-50` / `red-600` / `red-200`

### UI Colors
- **Primary**: `blue-600` / `blue-500`
- **Background**: `gray-50` / `white`
- **Border**: `gray-200` / `gray-300`
- **Text**: `gray-900` / `gray-600` / `gray-500`

## Interaction Patterns

### Stock Selection
1. User clicks stock card in sidebar
2. `onSelectReport(report)` called
3. State updates in Home page
4. AdversarialAnalysisView re-renders with new report
5. Sidebar highlights selected stock

### Date Navigation
1. User selects date from dropdown
2. `setSelectedDate(date)` updates local state
3. Stock list updates to show reports for that date
4. First stock auto-selected (or cleared if no reports)

### Table Sorting
1. User clicks column header
2. `handleSort(key)` called
3. If same column: toggle `sortAsc`
4. If different column: set `sortKey`, reset to descending
5. Table re-renders with sorted data

### Debate Point Expansion
1. User clicks debate point card
2. `togglePoint(index)` called
3. Index added/removed from `expandedPoints` array
4. Card expands/collapses with evidence and source

### Search in Appendix
1. User types in search input
2. `setSearchQuery(value)` updates state
3. `highlightSearch()` function runs on appendix text
4. Matching text wrapped in `<mark>` tags

### Download Appendix
1. User clicks download button
2. `handleDownload()` creates Blob from appendix
3. Creates temporary download link
4. Triggers download with `thoughtSignature` filename
5. Cleans up temporary URL

## Performance Considerations

### Optimizations Implemented
- Static generation for all pages
- Component-level state (avoid unnecessary re-renders)
- Efficient sorting algorithms
- Conditional rendering (collapsed sections)
- Lazy evaluation of search highlighting

### Future Optimizations
- React.memo for pure components
- useMemo for expensive calculations
- Virtual scrolling for large lists
- Image optimization with next/image
- Code splitting for large components

## Accessibility Features

### Implemented
- Semantic HTML structure
- Proper heading hierarchy
- Descriptive alt text ready
- Keyboard navigation support
- Focus indicators
- Color contrast compliance

### To Add
- ARIA labels
- Screen reader announcements
- Keyboard shortcuts
- Focus management
- Skip links

## Responsive Breakpoints

```css
sm: 640px   // Small tablets
md: 768px   // Tablets
lg: 1024px  // Small laptops
xl: 1280px  // Desktops
2xl: 1536px // Large desktops
```

### Current Responsive Behavior
- Sidebar: Fixed 320px width
- Main content: Flex-grow to fill space
- Grid layouts: Responsive on md/lg breakpoints
- Table: Horizontal scroll on small screens
- Debate stage: 2 columns (lg+), 1 column (below lg)

This guide should help anyone understand the component structure and how to modify or extend the application!
