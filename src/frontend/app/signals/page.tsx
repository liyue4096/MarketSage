'use client';

import { useState, useEffect, useReducer } from 'react';
import {
  Calendar,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Filter,
  ArrowUpDown,
} from 'lucide-react';
import { MASignal, SignalDirection } from '@/types';
import { fetchSignalDates, fetchSignalsByDate } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';

// State management
type PageState = 'loading' | 'error' | 'empty' | 'ready';

interface State {
  pageState: PageState;
  dates: string[];
  selectedDate: string | null;
  signals: MASignal[];
  error: string | null;
}

type Action =
  | { type: 'SET_LOADING' }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'SET_DATES'; dates: string[] }
  | { type: 'SELECT_DATE'; date: string }
  | { type: 'SET_SIGNALS'; signals: MASignal[] }
  | { type: 'SET_EMPTY' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, pageState: 'loading', error: null };
    case 'SET_ERROR':
      return { ...state, pageState: 'error', error: action.error };
    case 'SET_DATES':
      return {
        ...state,
        dates: action.dates,
        selectedDate: action.dates[0] || null,
      };
    case 'SELECT_DATE':
      return { ...state, selectedDate: action.date };
    case 'SET_SIGNALS':
      return {
        ...state,
        pageState: action.signals.length > 0 ? 'ready' : 'empty',
        signals: action.signals,
      };
    case 'SET_EMPTY':
      return { ...state, pageState: 'empty', signals: [] };
    default:
      return state;
  }
}

const initialState: State = {
  pageState: 'loading',
  dates: [],
  selectedDate: null,
  signals: [],
  error: null,
};

// Filter options
type FilterType = 'all' | 'up' | 'down' | 'ma20' | 'ma60' | 'ma250';

const SignalBadge = ({ direction }: { direction: SignalDirection }) => {
  if (direction === 'NONE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded">
        <Minus className="w-3 h-3" />
        None
      </span>
    );
  }
  if (direction === 'UP') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
        <TrendingUp className="w-3 h-3" />
        Breakout
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">
      <TrendingDown className="w-3 h-3" />
      Breakdown
    </span>
  );
};

export default function SignalsPage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortField, setSortField] = useState<'ticker' | 'priceChange'>('priceChange');
  const [sortAsc, setSortAsc] = useState(false);

  // Fetch dates on mount
  useEffect(() => {
    async function loadDates() {
      dispatch({ type: 'SET_LOADING' });
      try {
        const dates = await fetchSignalDates();
        if (dates.length === 0) {
          dispatch({ type: 'SET_EMPTY' });
          return;
        }
        dispatch({ type: 'SET_DATES', dates });
      } catch (err) {
        dispatch({
          type: 'SET_ERROR',
          error: err instanceof Error ? err.message : 'Failed to load dates',
        });
      }
    }
    loadDates();
  }, []);

  // Fetch signals when date changes
  useEffect(() => {
    if (!state.selectedDate) return;

    async function loadSignals() {
      dispatch({ type: 'SET_LOADING' });
      try {
        const signals = await fetchSignalsByDate(state.selectedDate!);
        dispatch({ type: 'SET_SIGNALS', signals });
      } catch (err) {
        dispatch({
          type: 'SET_ERROR',
          error: err instanceof Error ? err.message : 'Failed to load signals',
        });
      }
    }
    loadSignals();
  }, [state.selectedDate]);

  // Filter signals
  const filteredSignals = state.signals.filter((signal) => {
    if (filterType === 'all') return true;
    if (filterType === 'up') {
      return (
        signal.ma20Signal === 'UP' ||
        signal.ma60Signal === 'UP' ||
        signal.ma250Signal === 'UP'
      );
    }
    if (filterType === 'down') {
      return (
        signal.ma20Signal === 'DOWN' ||
        signal.ma60Signal === 'DOWN' ||
        signal.ma250Signal === 'DOWN'
      );
    }
    if (filterType === 'ma20') return signal.ma20Signal !== 'NONE';
    if (filterType === 'ma60') return signal.ma60Signal !== 'NONE';
    if (filterType === 'ma250') return signal.ma250Signal !== 'NONE';
    return true;
  });

  // Sort signals
  const sortedSignals = [...filteredSignals].sort((a, b) => {
    if (sortField === 'ticker') {
      return sortAsc
        ? a.ticker.localeCompare(b.ticker)
        : b.ticker.localeCompare(a.ticker);
    }
    return sortAsc
      ? a.priceChangePct - b.priceChangePct
      : b.priceChangePct - a.priceChangePct;
  });

  const toggleSort = (field: 'ticker' | 'priceChange') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'ticker');
    }
  };

  // Stats
  const upSignals = state.signals.filter(
    (s) => s.ma20Signal === 'UP' || s.ma60Signal === 'UP' || s.ma250Signal === 'UP'
  ).length;
  const downSignals = state.signals.filter(
    (s) =>
      s.ma20Signal === 'DOWN' || s.ma60Signal === 'DOWN' || s.ma250Signal === 'DOWN'
  ).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">MA Signals</h1>
          <p className="text-sm text-gray-500 mt-1">
            Moving average breakthrough signals for Nasdaq 100 and Russell 1000 stocks
          </p>
        </div>

        {/* Controls Row */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {/* Date Picker */}
          <div className="relative">
            <button
              onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg
                       hover:bg-gray-50 transition-colors min-w-[180px]"
            >
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">
                {state.selectedDate ? formatDate(state.selectedDate) : 'Select date'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
            </button>

            {dateDropdownOpen && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                {state.dates.map((date) => (
                  <button
                    key={date}
                    onClick={() => {
                      dispatch({ type: 'SELECT_DATE', date });
                      setDateDropdownOpen(false);
                    }}
                    className={cn(
                      'w-full px-4 py-2 text-sm text-left hover:bg-gray-50 transition-colors',
                      date === state.selectedDate && 'bg-blue-50 text-blue-700'
                    )}
                  >
                    {formatDate(date)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filter Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-gray-400" />
            {[
              { key: 'all', label: 'All' },
              { key: 'up', label: 'Breakouts' },
              { key: 'down', label: 'Breakdowns' },
              { key: 'ma20', label: '20MA' },
              { key: 'ma60', label: '60MA' },
              { key: 'ma250', label: '250MA' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterType(key as FilterType)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                  filterType === key
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Cards */}
        {state.pageState === 'ready' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-2xl font-bold text-gray-900">{state.signals.length}</div>
              <div className="text-xs text-gray-500">Total Signals</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-2xl font-bold text-green-600">{upSignals}</div>
              <div className="text-xs text-gray-500">Breakouts</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-2xl font-bold text-red-600">{downSignals}</div>
              <div className="text-xs text-gray-500">Breakdowns</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-2xl font-bold text-gray-900">{filteredSignals.length}</div>
              <div className="text-xs text-gray-500">Filtered</div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {state.pageState === 'loading' && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
            <span className="ml-2 text-gray-600">Loading signals...</span>
          </div>
        )}

        {/* Error State */}
        {state.pageState === 'error' && (
          <div className="text-center py-20">
            <div className="text-red-500 mb-2">Failed to load signals</div>
            <div className="text-sm text-gray-500">{state.error}</div>
          </div>
        )}

        {/* Empty State */}
        {state.pageState === 'empty' && (
          <div className="text-center py-20">
            <Activity className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <div className="text-gray-500">No signals available for this date</div>
          </div>
        )}

        {/* Signals Table */}
        {state.pageState === 'ready' && sortedSignals.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <button
                        onClick={() => toggleSort('ticker')}
                        className="flex items-center gap-1 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:text-gray-900"
                      >
                        Ticker
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Price
                    </th>
                    <th className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleSort('priceChange')}
                        className="flex items-center gap-1 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:text-gray-900 ml-auto"
                      >
                        Change
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      20MA
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      60MA
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      250MA
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Source
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedSignals.map((signal) => (
                    <tr key={signal.ticker} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-gray-900">{signal.ticker}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {signal.companyName || '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-gray-900">
                        ${signal.closePrice?.toFixed(2) || '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={cn(
                            'font-mono text-sm',
                            signal.priceChangePct > 0
                              ? 'text-green-600'
                              : signal.priceChangePct < 0
                              ? 'text-red-600'
                              : 'text-gray-600'
                          )}
                        >
                          {signal.priceChangePct > 0 ? '+' : ''}
                          {signal.priceChangePct?.toFixed(2) || '0.00'}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <SignalBadge direction={signal.ma20Signal} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <SignalBadge direction={signal.ma60Signal} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <SignalBadge direction={signal.ma250Signal} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            'px-2 py-0.5 text-xs font-medium rounded',
                            signal.source === 'nasdaq_100'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                          )}
                        >
                          {signal.source === 'nasdaq_100' ? 'NDX' : 'RUI'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
