'use client';

import React from 'react';
import { StockReport } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getVerdictColor, formatDate } from '@/lib/utils';
import { TrendingUp, Award, Calendar } from 'lucide-react';

interface VerdictHeaderProps {
  report: StockReport;
}

export default function VerdictHeader({ report }: VerdictHeaderProps) {
  const confidencePercentage = (report.confidence / 10) * 100;

  return (
    <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Title Row */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900">{report.ticker}</h1>
                <div className="flex gap-2">
                  {(report.activeSignals || [report.triggerType]).map((signal) => (
                    <Badge key={signal} className="bg-blue-600 text-white">
                      {signal}
                    </Badge>
                  ))}
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-1">{report.companyName}</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="w-4 h-4" />
              {formatDate(report.triggerDate)}
            </div>
          </div>

          {/* Verdict and Confidence */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Verdict */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Final Verdict
              </div>
              <div className={`inline-flex px-4 py-2 rounded-lg text-base font-bold border-2 ${getVerdictColor(report.verdict)}`}>
                {report.verdict}
              </div>
            </div>

            {/* Confidence Gauge */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Confidence Score
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-gray-900">{report.confidence}</span>
                  <span className="text-sm text-gray-500">/10</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all"
                    style={{ width: `${confidencePercentage}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Primary Catalyst */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1">
                <Award className="w-3 h-3" />
                Primary Catalyst
              </div>
              <div className="flex items-start gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                <span className="text-sm font-semibold text-gray-900">{report.primaryCatalyst}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
