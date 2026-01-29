import { StockReport, DailyBreakthrough } from '@/types';

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
