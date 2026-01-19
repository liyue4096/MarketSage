'use client';

import { useState } from 'react';
import DailyBreakthroughFeed from '@/components/DailyBreakthroughFeed';
import AdversarialAnalysisView from '@/components/AdversarialAnalysisView';
import { StockReport } from '@/types';
import { mockDailyBreakthroughs } from '@/data/mockData';

export default function Home() {
  const [selectedReport, setSelectedReport] = useState<StockReport | null>(
    mockDailyBreakthroughs[0]?.reports[0] || null
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <DailyBreakthroughFeed
        breakthroughs={mockDailyBreakthroughs}
        selectedReport={selectedReport}
        onSelectReport={setSelectedReport}
      />
      <AdversarialAnalysisView report={selectedReport} />
    </div>
  );
}
