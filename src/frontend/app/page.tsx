'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { StockReport, DailyBreakthrough } from '@/types';
import { fetchDailyBreakthroughs } from '@/lib/api';

// Dynamic import to avoid SSR hydration issues
const DailyBreakthroughFeed = dynamic(
  () => import('@/components/DailyBreakthroughFeed'),
  { ssr: false }
);
const AdversarialAnalysisView = dynamic(
  () => import('@/components/AdversarialAnalysisView'),
  { ssr: false }
);

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [breakthroughs, setBreakthroughs] = useState<DailyBreakthrough[]>([]);
  const [selectedReport, setSelectedReport] = useState<StockReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Set mounted after hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    async function loadData() {
      console.log('[Home] Starting loadData');
      try {
        setLoading(true);
        const data = await fetchDailyBreakthroughs();
        console.log('[Home] Data received, breakthroughs:', data.length);
        setBreakthroughs(data);
        if (data.length > 0 && data[0].reports.length > 0) {
          console.log('[Home] Setting selected report:', data[0].reports[0].ticker);
          setSelectedReport(data[0].reports[0]);
        }
        setLoading(false);
      } catch (err) {
        console.error('[Home] Error loading data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setLoading(false);
      }
    }
    loadData();
  }, [mounted]);

  // Don't render anything until mounted (prevents hydration mismatch)
  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

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
