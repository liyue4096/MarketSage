import { StockReport, DailyBreakthrough } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ojn2366vej.execute-api.us-west-2.amazonaws.com/prod';

export async function fetchDates(): Promise<string[]> {
  const res = await fetch(`${API_URL}/dates`);
  if (!res.ok) throw new Error('Failed to fetch dates');
  const data = await res.json();
  return data.dates;
}

export async function fetchReportsByDate(date: string): Promise<StockReport[]> {
  const res = await fetch(`${API_URL}/reports?date=${date}`);
  if (!res.ok) throw new Error('Failed to fetch reports');
  const data = await res.json();
  return data.reports;
}

export async function fetchDailyBreakthroughs(): Promise<DailyBreakthrough[]> {
  const dates = await fetchDates();
  const breakthroughs: DailyBreakthrough[] = [];

  for (const date of dates) {
    const reports = await fetchReportsByDate(date);
    if (reports.length > 0) {
      breakthroughs.push({ date, reports });
    }
  }

  return breakthroughs;
}
