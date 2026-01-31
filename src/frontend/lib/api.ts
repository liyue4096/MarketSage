import { StockReport, DailyBreakthrough, MASignal, DailySignals } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ojn2366vej.execute-api.us-west-2.amazonaws.com/prod';

export async function fetchDates(): Promise<string[]> {
  console.log('[API] Fetching dates from:', `${API_URL}/dates`);
  try {
    const res = await fetch(`${API_URL}/dates`);
    console.log('[API] Dates response status:', res.status);
    if (!res.ok) throw new Error(`Failed to fetch dates: ${res.status}`);
    const data = await res.json();
    console.log('[API] Dates received:', data.dates);
    return data.dates;
  } catch (err) {
    console.error('[API] Error fetching dates:', err);
    throw err;
  }
}

export async function fetchReportsByDate(date: string): Promise<StockReport[]> {
  console.log('[API] Fetching reports for date:', date);
  try {
    const res = await fetch(`${API_URL}/reports?date=${date}`);
    console.log('[API] Reports response status:', res.status);
    if (!res.ok) throw new Error(`Failed to fetch reports: ${res.status}`);
    const data = await res.json();
    console.log('[API] Reports received for', date, ':', data.reports?.length || 0, 'reports');
    return data.reports;
  } catch (err) {
    console.error('[API] Error fetching reports for', date, ':', err);
    throw err;
  }
}

export async function fetchDailyBreakthroughs(): Promise<DailyBreakthrough[]> {
  console.log('[API] Starting fetchDailyBreakthroughs');
  const dates = await fetchDates();
  const breakthroughs: DailyBreakthrough[] = [];

  for (const date of dates) {
    const reports = await fetchReportsByDate(date);
    if (reports.length > 0) {
      breakthroughs.push({ date, reports });
    }
  }

  console.log('[API] Total breakthroughs loaded:', breakthroughs.length);
  return breakthroughs;
}

// Fetch available signal dates
export async function fetchSignalDates(): Promise<string[]> {
  console.log('[API] Fetching signal dates from:', `${API_URL}/signals/dates`);
  try {
    const res = await fetch(`${API_URL}/signals/dates`);
    console.log('[API] Signal dates response status:', res.status);
    if (!res.ok) throw new Error(`Failed to fetch signal dates: ${res.status}`);
    const data = await res.json();
    console.log('[API] Signal dates received:', data.dates?.length || 0, 'dates');
    return data.dates || [];
  } catch (err) {
    console.error('[API] Error fetching signal dates:', err);
    throw err;
  }
}

// Fetch signals for a specific date
export async function fetchSignalsByDate(date: string): Promise<MASignal[]> {
  console.log('[API] Fetching signals for date:', date);
  try {
    const res = await fetch(`${API_URL}/signals?date=${date}`);
    console.log('[API] Signals response status:', res.status);
    if (!res.ok) throw new Error(`Failed to fetch signals: ${res.status}`);
    const data = await res.json();
    console.log('[API] Signals received for', date, ':', data.signals?.length || 0, 'signals');
    return data.signals || [];
  } catch (err) {
    console.error('[API] Error fetching signals for', date, ':', err);
    throw err;
  }
}
