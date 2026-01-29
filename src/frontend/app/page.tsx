'use client';

import { useState, useEffect, useReducer } from 'react';
import DailyBreakthroughFeed from '@/components/DailyBreakthroughFeed';
import AdversarialAnalysisView from '@/components/AdversarialAnalysisView';
import { StockReport, DailyBreakthrough } from '@/types';
import { fetchDailyBreakthroughs } from '@/lib/api';

// State type
type State = {
  status: 'mounting' | 'loading' | 'error' | 'empty' | 'ready';
  breakthroughs: DailyBreakthrough[];
  selectedReport: StockReport | null;
  error: string | null;
};

// Action types
type Action =
  | { type: 'MOUNTED' }
  | { type: 'LOADING' }
  | { type: 'SUCCESS'; breakthroughs: DailyBreakthrough[]; selectedReport: StockReport | null }
  | { type: 'ERROR'; error: string }
  | { type: 'SELECT_REPORT'; report: StockReport };

// Reducer for predictable state transitions
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'MOUNTED':
      return { ...state, status: 'loading' };
    case 'LOADING':
      return { ...state, status: 'loading' };
    case 'SUCCESS':
      return {
        ...state,
        status: action.breakthroughs.length === 0 ? 'empty' : 'ready',
        breakthroughs: action.breakthroughs,
        selectedReport: action.selectedReport,
        error: null,
      };
    case 'ERROR':
      return { ...state, status: 'error', error: action.error };
    case 'SELECT_REPORT':
      return { ...state, selectedReport: action.report };
    default:
      return state;
  }
}

const initialState: State = {
  status: 'mounting',
  breakthroughs: [],
  selectedReport: null,
  error: null,
};

export default function Home() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [, forceUpdate] = useState({});

  // Handle mounting and data loading
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      console.log('[Home] Starting loadData, current status:', state.status);

      if (state.status === 'mounting') {
        dispatch({ type: 'MOUNTED' });
        return;
      }

      if (state.status !== 'loading') {
        return;
      }

      try {
        const data = await fetchDailyBreakthroughs();
        console.log('[Home] Data received, breakthroughs:', data.length);

        if (cancelled) return;

        const selectedReport = data.length > 0 && data[0].reports.length > 0
          ? data[0].reports[0]
          : null;

        if (selectedReport) {
          console.log('[Home] Setting selected report:', selectedReport.ticker);
        }

        dispatch({ type: 'SUCCESS', breakthroughs: data, selectedReport });
        // Force a re-render after state update
        setTimeout(() => forceUpdate({}), 0);
      } catch (err) {
        console.error('[Home] Error loading data:', err);
        if (!cancelled) {
          dispatch({ type: 'ERROR', error: err instanceof Error ? err.message : 'Failed to load data' });
        }
      }
    }

    loadData();

    return () => { cancelled = true; };
  }, [state.status]);

  const handleSelectReport = (report: StockReport) => {
    dispatch({ type: 'SELECT_REPORT', report });
  };

  console.log('[Home] Render - status:', state.status, 'breakthroughs:', state.breakthroughs.length);

  // Render based on status
  if (state.status === 'mounting' || state.status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <div className="text-slate-400">
          {state.status === 'mounting' ? 'Initializing...' : 'Loading reports...'}
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <div className="text-red-400">Error: {state.error}</div>
      </div>
    );
  }

  if (state.status === 'empty') {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <div className="text-slate-400">No reports available</div>
      </div>
    );
  }

  // status === 'ready'
  return (
    <div className="flex h-screen overflow-hidden">
      <DailyBreakthroughFeed
        breakthroughs={state.breakthroughs}
        selectedReport={state.selectedReport}
        onSelectReport={handleSelectReport}
      />
      <AdversarialAnalysisView report={state.selectedReport} />
    </div>
  );
}
