'use client';

import React, { useState } from 'react';
import { StockReport } from '@/types';
import VerdictHeader from '@/components/analysis/VerdictHeader';
import CompanyIntroduction from '@/components/analysis/CompanyIntroduction';
import DebateStage from '@/components/analysis/DebateStage';
import ConsensusSummary from '@/components/analysis/ConsensusSummary';
import DeepThinkingAppendix from '@/components/analysis/DeepThinkingAppendix';
import { FileText, Globe, ScrollText } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export type Language = 'en' | 'zh';

interface AdversarialAnalysisViewProps {
  report: StockReport | null;
}

export default function AdversarialAnalysisView({ report }: AdversarialAnalysisViewProps) {
  const [language, setLanguage] = useState<Language>('en');

  // Check if Chinese translation is available (any of the Chinese fields)
  const hasChineseTranslation = report?.reportContentChinese ||
    report?.consensusSummaryChinese ||
    report?.bullThesisChinese?.length ||
    report?.bearThesisChinese?.length ||
    report?.rebuttalsChinese;

  if (!report) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="text-center space-y-4">
          <FileText className="w-16 h-16 text-gray-300 mx-auto" />
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-gray-600">No Stock Selected</h2>
            <p className="text-sm text-gray-500">Select a stock from the sidebar to view the analysis</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Language Toggle */}
        {hasChineseTranslation && (
          <div className="flex justify-end">
            <div className="inline-flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-1 shadow-sm">
              <Globe className="w-4 h-4 text-gray-500 ml-2" />
              <button
                onClick={() => setLanguage('en')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  language === 'en'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                English
              </button>
              <button
                onClick={() => setLanguage('zh')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  language === 'zh'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                中文
              </button>
            </div>
          </div>
        )}

        {/* Verdict Header */}
        <VerdictHeader report={report} />

        {/* Company Introduction */}
        <CompanyIntroduction
          ticker={report.ticker}
          companyName={report.companyName}
          description={report.companyDescription}
        />

        {/* Debate Stage */}
        <DebateStage
          bullThesis={report.bullThesis}
          bearThesis={report.bearThesis}
          rebuttals={report.rebuttals}
          bullDefense={report.bullDefense}
          bearDefense={report.bearDefense}
          bullThesisChinese={report.bullThesisChinese}
          bearThesisChinese={report.bearThesisChinese}
          rebuttalsChinese={report.rebuttalsChinese}
          language={language}
        />

        {/* Consensus Summary */}
        <ConsensusSummary
          summary={language === 'zh' && report.consensusSummaryChinese
            ? report.consensusSummaryChinese
            : report.consensusSummary}
          language={language}
        />

        {/* Full Report Content */}
        {(report.reportContent || report.reportContentChinese) && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-indigo-600" />
                <CardTitle>{language === 'zh' ? '完整报告' : 'Full Report'}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                {language === 'zh' && report.reportContentChinese
                  ? report.reportContentChinese
                  : report.reportContent}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Deep Thinking Appendix */}
        <DeepThinkingAppendix
          appendix={report.appendix}
          thoughtSignature={report.thoughtSignature}
          ticker={report.ticker}
          triggerDate={report.triggerDate}
        />
      </div>
    </div>
  );
}
