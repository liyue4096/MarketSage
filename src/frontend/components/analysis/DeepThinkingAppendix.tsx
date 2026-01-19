'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Download, Search, Code2 } from 'lucide-react';

interface DeepThinkingAppendixProps {
  appendix: string;
  thoughtSignature: string;
}

export default function DeepThinkingAppendix({
  appendix,
  thoughtSignature
}: DeepThinkingAppendixProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleDownload = () => {
    const blob = new Blob([appendix], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${thoughtSignature}_thinking_trace.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const highlightSearch = (text: string) => {
    if (!searchQuery.trim()) return text;

    const parts = text.split(new RegExp(`(${searchQuery})`, 'gi'));
    return parts.map((part, index) =>
      part.toLowerCase() === searchQuery.toLowerCase() ? (
        <mark key={index} className="bg-yellow-300 text-gray-900">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <Card className="bg-gray-900 text-gray-100 border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-blue-400" />
            <CardTitle className="text-white">Appendix A: Deep Thinking Trace</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-300 hover:text-white hover:bg-gray-800"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4 mr-1" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-1" />
                Expand
              </>
            )}
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-gray-400">Thought Signature:</span>
          <code className="text-xs text-blue-300 bg-gray-800 px-2 py-1 rounded">
            {thoughtSignature}
          </code>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Search and Download Controls */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search thinking trace..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700 hover:text-white"
            >
              <Download className="w-4 h-4 mr-1" />
              Download
            </Button>
          </div>

          {/* Thinking Trace Content */}
          <div className="bg-gray-950 rounded-lg p-4 border border-gray-800 overflow-x-auto">
            <pre className="text-xs leading-relaxed font-mono text-gray-300 whitespace-pre-wrap">
              {highlightSearch(appendix)}
            </pre>
          </div>

          {/* Info Footer */}
          <div className="text-xs text-gray-500 space-y-1 border-t border-gray-800 pt-4">
            <p>
              This trace contains the internal reasoning process of the Gemini 3 Thinking API during
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
        </CardContent>
      )}
    </Card>
  );
}
