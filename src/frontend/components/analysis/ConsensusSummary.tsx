'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { CheckCircle2, Scale } from 'lucide-react';

interface ConsensusSummaryProps {
  summary: string[];
}

export default function ConsensusSummary({ summary }: ConsensusSummaryProps) {
  return (
    <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-indigo-600" />
          Consensus Summary
        </CardTitle>
        <p className="text-sm text-gray-600">
          Synthesized conclusion from adversarial analysis
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {summary.map((point, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-4 bg-white rounded-lg border border-indigo-100 shadow-sm"
            >
              <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                    Point {index + 1}
                  </span>
                </div>
                <p className="text-sm text-gray-800 leading-relaxed">{point}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
