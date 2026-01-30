'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { CheckCircle2, Scale } from 'lucide-react';

type Language = 'en' | 'zh';

interface ConsensusSummaryProps {
  summary: string[];
  language?: Language;
}

const labels = {
  en: {
    title: 'Consensus Summary',
    subtitle: 'Synthesized conclusion from adversarial analysis',
    point: 'Point',
  },
  zh: {
    title: '共识摘要',
    subtitle: '对抗分析综合结论',
    point: '要点',
  },
};

export default function ConsensusSummary({ summary, language = 'en' }: ConsensusSummaryProps) {
  const t = labels[language];

  return (
    <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-indigo-600" />
          {t.title}
        </CardTitle>
        <p className="text-sm text-gray-600">
          {t.subtitle}
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
                    {t.point} {index + 1}
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
