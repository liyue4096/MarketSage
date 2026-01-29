'use client';

import React, { useState } from 'react';
import { StockReport, DailyBreakthrough } from '@/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate, getVerdictColor, getIntensityColor } from '@/lib/utils';
import { Calendar, TrendingUp } from 'lucide-react';

interface DailyBreakthroughFeedProps {
  breakthroughs: DailyBreakthrough[];
  selectedReport: StockReport | null;
  onSelectReport: (report: StockReport) => void;
}

export default function DailyBreakthroughFeed({
  breakthroughs,
  selectedReport,
  onSelectReport
}: DailyBreakthroughFeedProps) {
  const [selectedDate, setSelectedDate] = useState(breakthroughs[0]?.date || '');

  const currentBreakthrough = breakthroughs.find(b => b.date === selectedDate) || breakthroughs[0];

  // Handle date change - select first report from new date
  const handleDateChange = (newDate: string) => {
    console.log('[Feed] Date changed to:', newDate);
    console.log('[Feed] All breakthroughs:', breakthroughs.map(b => ({ date: b.date, tickers: b.reports.map(r => r.ticker) })));
    setSelectedDate(newDate);

    // Immediately select first report from the new date
    const newBreakthrough = breakthroughs.find(b => b.date === newDate);
    console.log('[Feed] Found breakthrough for date:', newBreakthrough?.date, 'with reports:', newBreakthrough?.reports.map(r => r.ticker));
    if (newBreakthrough && newBreakthrough.reports.length > 0) {
      const firstReport = newBreakthrough.reports[0];
      console.log('[Feed] Selecting first report:', firstReport.ticker, 'from date:', firstReport.triggerDate);
      onSelectReport(firstReport);
    }
  };

  return (
    <div className="w-80 border-r border-gray-200 bg-gray-50 h-screen overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">MarketSage</h1>
        </div>

        {/* Date Picker */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Select Date
          </label>
          <select
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {breakthroughs.map((breakthrough) => (
              <option key={breakthrough.date} value={breakthrough.date}>
                {formatDate(breakthrough.date)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stock List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 py-1">
            {currentBreakthrough.reports.length} Breakthrough{currentBreakthrough.reports.length !== 1 ? 's' : ''}
          </div>

          {currentBreakthrough.reports.map((report) => (
            <Card
              key={`${selectedDate}-${report.ticker}`}
              className={`p-3 cursor-pointer transition-all hover:shadow-md ${
                selectedReport?.ticker === report.ticker
                  ? 'ring-2 ring-blue-500 bg-blue-50'
                  : 'bg-white hover:bg-gray-50'
              }`}
              onClick={() => onSelectReport(report)}
            >
              <div className="space-y-2">
                {/* Ticker and Company */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-gray-900">{report.ticker}</span>
                    <Badge className={`text-[10px] px-1.5 py-0.5 ${
                      report.triggerType === '250MA'
                        ? 'bg-purple-100 text-purple-700 border-purple-200'
                        : report.triggerType === '20MA'
                        ? 'bg-green-100 text-green-700 border-green-200'
                        : 'bg-blue-100 text-blue-700 border-blue-200'
                    }`}>
                      {report.triggerType}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">{report.companyName}</div>
                </div>

                {/* Intensity Bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getIntensityColor(report.breakthroughIntensity)} transition-all`}
                      style={{
                        width: report.breakthroughIntensity === 'High' ? '100%' :
                               report.breakthroughIntensity === 'Medium' ? '66%' : '33%'
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500 font-medium">
                    {report.breakthroughIntensity}
                  </span>
                </div>

                {/* Verdict */}
                <div className={`px-2 py-1 rounded text-xs font-semibold border ${getVerdictColor(report.verdict)}`}>
                  {report.verdict}
                </div>

                {/* Confidence */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Confidence</span>
                  <span className="font-semibold text-gray-700">{report.confidence}/10</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
