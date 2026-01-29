'use client';

import { useState, useEffect, useCallback } from 'react';
import DailyBreakthroughFeed from '@/components/DailyBreakthroughFeed';
import AdversarialAnalysisView from '@/components/AdversarialAnalysisView';
import { StockReport, DailyBreakthrough } from '@/types';
import { fetchDailyBreakthroughs } from '@/lib/api';

export default function Home() {
  const [breakthroughs, setBreakthroughs] = useState<DailyBreakthrough[]>([]);
  const [selectedReport, setSelectedReport] = useState<StockReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    console.log('[Home] Starting loadData');
    try {
      setLoading(true);
      const data = await fetchDailyBreakthroughs();
      console.log('[Home] Data received, breakthroughs:', data.length);
      setBreakthroughs(data);
      // Select first report by default
      if (data.length > 0 && data[0].reports.length > 0) {
        console.log('[Home] Setting selected report:', data[0].reports[0].ticker);
        setSelectedReport(data[0].reports[0]);
      }
      console.log('[Home] Setting loading to false');
      setLoading(false);
    } catch (err) {
      console.error('[Home] Error loading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  console.log('[Home] Render - loading:', loading, 'error:', error, 'breakthroughs:', breakthroughs.length);

  if (loading) {
    return (
      <div key="loading" className="flex h-screen items-center justify-center bg-slate-900">
        <div className="text-slate-400">Loading reports...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div key="error" className="flex h-screen items-center justify-center bg-slate-900">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (breakthroughs.length === 0) {
    return (
      <div key="empty" className="flex h-screen items-center justify-center bg-slate-900">
        <div className="text-slate-400">No reports available</div>
      </div>
    );
  }

  return (
    <div key="main" className="flex h-screen overflow-hidden">
      <DailyBreakthroughFeed
        breakthroughs={breakthroughs}
        selectedReport={selectedReport}
        onSelectReport={setSelectedReport}
      />
      <AdversarialAnalysisView report={selectedReport} />
    </div>
  );
}
