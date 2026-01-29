'use client';

import React, { useState } from 'react';
import { StockReport } from '@/types';
import VerdictHeader from '@/components/analysis/VerdictHeader';
import TrackComparisonMatrix from '@/components/analysis/TrackComparisonMatrix';
import DebateStage from '@/components/analysis/DebateStage';
import ConsensusSummary from '@/components/analysis/ConsensusSummary';
import DeepThinkingAppendix from '@/components/analysis/DeepThinkingAppendix';
import { FileText } from 'lucide-react';

interface AdversarialAnalysisViewProps {
  report: StockReport | null;
}

export default function AdversarialAnalysisView({ report }: AdversarialAnalysisViewProps) {
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
        {/* Verdict Header */}
        <VerdictHeader report={report} />

        {/* Track Comparison Matrix */}
        <TrackComparisonMatrix peerTable={report.peerTable} targetTicker={report.ticker} />

        {/* Debate Stage */}
        <DebateStage
          bullThesis={report.bullThesis}
          bearThesis={report.bearThesis}
        />

        {/* Consensus Summary */}
        <ConsensusSummary summary={report.consensusSummary} />

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
