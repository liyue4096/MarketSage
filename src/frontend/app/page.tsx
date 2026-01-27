'use client';

import { useState, useEffect } from 'react';
import DailyBreakthroughFeed from '@/components/DailyBreakthroughFeed';
import AdversarialAnalysisView from '@/components/AdversarialAnalysisView';
import { StockReport, DailyBreakthrough } from '@/types';
import { fetchDailyBreakthroughs } from '@/lib/api';

export default function Home() {
  const [breakthroughs, setBreakthroughs] = useState<DailyBreakthrough[]>([]);
  const [selectedReport, setSelectedReport] = useState<StockReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const data = await fetchDailyBreakthroughs();
        setBreakthroughs(data);
        // Select first report by default
        if (data.length > 0 && data[0].reports.length > 0) {
          setSelectedReport(data[0].reports[0]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <div className="text-slate-400">Loading reports...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (breakthroughs.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <div className="text-slate-400">No reports available</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <DailyBreakthroughFeed
        breakthroughs={breakthroughs}
        selectedReport={selectedReport}
        onSelectReport={setSelectedReport}
      />
      <AdversarialAnalysisView report={selectedReport} />
    </div>
  );
}
