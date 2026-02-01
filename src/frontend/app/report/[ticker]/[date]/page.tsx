'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { StockReport } from '@/types';
import { fetchDailyBreakthroughs } from '@/lib/api';
import { formatDate, getVerdictColor } from '@/lib/utils';
import { ArrowLeft, Download, Calendar, TrendingUp, Shield, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function FullReportPage() {
  const params = useParams();
  const router = useRouter();
  const ticker = params.ticker as string;
  const date = params.date as string;

  const [report, setReport] = useState<StockReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadReport() {
      try {
        setLoading(true);
        const breakthroughs = await fetchDailyBreakthroughs();
        const dayData = breakthroughs.find(b => b.date === date);
        const foundReport = dayData?.reports.find(r => r.ticker === ticker);

        if (foundReport) {
          setReport(foundReport);
        } else {
          setError(`Report not found for ${ticker} on ${date}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report');
      } finally {
        setLoading(false);
      }
    }
    loadReport();
  }, [ticker, date]);

  const handleDownload = () => {
    if (!report) return;

    const fullContent = `# ${report.ticker} - ${report.companyName}
Date: ${formatDate(report.triggerDate)}
Trigger: ${report.triggerType}
Verdict: ${report.verdict}
Confidence: ${report.confidence}/10

---

## Executive Summary
${report.primaryCatalyst}

---

## Bull Thesis
${report.bullThesis.map((p, i) => `### Point ${i + 1}: ${p.point}
${p.evidence}
${p.source ? `Source: ${p.source}` : ''}`).join('\n\n')}

---

## Bear Thesis
${report.bearThesis.map((p, i) => `### Point ${i + 1}: ${p.point}
${p.evidence}
${p.source ? `Source: ${p.source}` : ''}`).join('\n\n')}

---

## Consensus Summary
${report.consensusSummary.map((s, i) => `${i + 1}. ${s}`).join('\n')}

---

## Appendix: Deep Thinking Trace
Thought Signature: ${report.thoughtSignature}

${report.appendix}
`;

    const blob = new Blob([fullContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.ticker}_${report.triggerDate}_full_report.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400">Loading report...</div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-red-400">{error || 'Report not found'}</div>
          <Button onClick={() => router.push('/')} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                onClick={() => router.push('/')}
                variant="ghost"
                size="sm"
                className="text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <div className="h-6 w-px bg-gray-300" />
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <span className="font-bold text-xl text-gray-900">{report.ticker}</span>
                <span className="text-gray-500">-</span>
                <span className="text-gray-600">{report.companyName}</span>
              </div>
            </div>
            <Button onClick={handleDownload} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-1" />
              Download Full Report
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Meta Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="w-4 h-4" />
              {formatDate(report.triggerDate)}
            </div>
            {(report.activeSignals || [report.triggerType]).map((signal) => (
              <Badge key={signal} className={`${
                signal === '250MA'
                  ? 'bg-purple-100 text-purple-700 border-purple-200'
                  : signal === '20MA'
                  ? 'bg-green-100 text-green-700 border-green-200'
                  : 'bg-blue-100 text-blue-700 border-blue-200'
              }`}>
                {signal} Crossover
              </Badge>
            ))}
            <Badge className={getVerdictColor(report.verdict)}>
              {report.verdict}
            </Badge>
            <div className="flex items-center gap-1 text-sm">
              <Target className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600">Confidence:</span>
              <span className="font-semibold text-gray-900">{report.confidence}/10</span>
            </div>
          </div>
          <div className="mt-4 text-gray-700">
            <strong>Primary Catalyst:</strong> {report.primaryCatalyst}
          </div>
        </div>

        {/* Bull Thesis */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-green-700 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Bull Thesis
          </h2>
          <div className="space-y-6">
            {report.bullThesis.map((point, index) => (
              <div key={index} className="border-l-4 border-green-500 pl-4">
                <h3 className="font-semibold text-gray-900 mb-2">{point.point}</h3>
                <p className="text-gray-700 text-sm">{point.evidence}</p>
                {point.source && (
                  <p className="text-xs text-gray-500 mt-2">
                    Source: {point.sourceUrl ? (
                      <a href={point.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {point.source}
                      </a>
                    ) : point.source}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bear Thesis */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-red-700 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Bear Thesis
          </h2>
          <div className="space-y-6">
            {report.bearThesis.map((point, index) => (
              <div key={index} className="border-l-4 border-red-500 pl-4">
                <h3 className="font-semibold text-gray-900 mb-2">{point.point}</h3>
                <p className="text-gray-700 text-sm">{point.evidence}</p>
                {point.source && (
                  <p className="text-xs text-gray-500 mt-2">
                    Source: {point.sourceUrl ? (
                      <a href={point.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {point.source}
                      </a>
                    ) : point.source}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Consensus Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Consensus Summary</h2>
          <ul className="space-y-3">
            {report.consensusSummary.map((item, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold flex items-center justify-center">
                  {index + 1}
                </span>
                <span className="text-gray-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Deep Thinking Trace - Full Content */}
        <div className="bg-gray-900 rounded-lg border border-gray-700 p-6">
          <h2 className="text-xl font-bold text-white mb-2">Appendix A: Deep Thinking Trace</h2>
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xs text-gray-400">Thought Signature:</span>
            <code className="text-xs text-blue-300 bg-gray-800 px-2 py-1 rounded">
              {report.thoughtSignature}
            </code>
          </div>

          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({children}) => <h1 className="text-2xl font-bold text-white mt-8 mb-4 border-b border-gray-700 pb-2">{children}</h1>,
                h2: ({children}) => <h2 className="text-xl font-bold text-white mt-6 mb-3">{children}</h2>,
                h3: ({children}) => <h3 className="text-lg font-semibold text-gray-200 mt-4 mb-2">{children}</h3>,
                p: ({children}) => <p className="text-gray-300 mb-4 leading-relaxed">{children}</p>,
                ul: ({children}) => <ul className="list-disc list-inside text-gray-300 mb-4 space-y-1">{children}</ul>,
                ol: ({children}) => <ol className="list-decimal list-inside text-gray-300 mb-4 space-y-1">{children}</ol>,
                li: ({children}) => <li className="text-gray-300">{children}</li>,
                strong: ({children}) => <strong className="text-white font-semibold">{children}</strong>,
                em: ({children}) => <em className="text-gray-200 italic">{children}</em>,
                blockquote: ({children}) => <blockquote className="border-l-4 border-blue-500 pl-4 my-4 text-gray-400 italic">{children}</blockquote>,
                code: ({children}) => <code className="bg-gray-800 text-blue-300 px-1.5 py-0.5 rounded text-sm">{children}</code>,
                pre: ({children}) => <pre className="bg-gray-950 p-4 rounded-lg overflow-x-auto my-4">{children}</pre>,
                hr: () => <hr className="border-gray-700 my-6" />,
                a: ({href, children}) => <a href={href} className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
              }}
            >
              {report.appendix}
            </ReactMarkdown>
          </div>

          {/* Info Footer */}
          <div className="text-xs text-gray-500 space-y-1 border-t border-gray-800 pt-4 mt-6">
            <p>
              This trace contains the internal reasoning process of the AI agents during
              adversarial analysis.
            </p>
            <p>
              It includes agent dialogue, evidence evaluation, and the synthesis logic used to generate
              the final verdict.
            </p>
            <p className="text-yellow-400">
              For retrospective analysis: This signature will be used to evaluate prediction accuracy at T+60 days.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
