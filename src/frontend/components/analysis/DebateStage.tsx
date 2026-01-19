'use client';

import React, { useState } from 'react';
import { DebatePoint } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

interface DebateStageProps {
  bullThesis: DebatePoint[];
  bearThesis: DebatePoint[];
}

interface ThesisCardProps {
  title: string;
  icon: React.ReactNode;
  thesis: DebatePoint[];
  colorScheme: 'green' | 'red';
}

function ThesisCard({ title, icon, thesis, colorScheme }: ThesisCardProps) {
  const [expandedPoints, setExpandedPoints] = useState<number[]>([]);

  const togglePoint = (index: number) => {
    setExpandedPoints((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const colors = {
    green: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-700',
      icon: 'text-green-600',
      hover: 'hover:bg-green-100'
    },
    red: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      icon: 'text-red-600',
      hover: 'hover:bg-red-100'
    }
  };

  const scheme = colors[colorScheme];

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${scheme.bg} ${scheme.border} border`}>
        <div className={scheme.icon}>{icon}</div>
        <h3 className={`font-bold ${scheme.text}`}>{title}</h3>
        <Badge variant="outline" className="ml-auto">
          {thesis.length} Points
        </Badge>
      </div>

      <div className="space-y-2">
        {thesis.map((point, index) => {
          const isExpanded = expandedPoints.includes(index);
          return (
            <div
              key={index}
              className={`border rounded-lg overflow-hidden transition-all ${
                isExpanded ? 'shadow-md' : 'shadow-sm'
              }`}
            >
              <button
                onClick={() => togglePoint(index)}
                className={`w-full px-4 py-3 text-left ${scheme.hover} transition-colors`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 leading-snug">
                      {point.point}
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-100 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                      Evidence
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{point.evidence}</p>
                  </div>

                  {point.source && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                        Source
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">{point.source}</span>
                        {point.sourceUrl && (
                          <a
                            href={point.sourceUrl}
                            className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DebateStage({ bullThesis, bearThesis }: DebateStageProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Adversarial Debate</CardTitle>
        <p className="text-sm text-gray-600">
          Multi-agent analysis with independent bull and bear perspectives
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bull Thesis */}
          <ThesisCard
            title="Bull Thesis"
            icon={<TrendingUp className="w-5 h-5" />}
            thesis={bullThesis}
            colorScheme="green"
          />

          {/* Bear Thesis */}
          <ThesisCard
            title="Bear Thesis"
            icon={<TrendingDown className="w-5 h-5" />}
            thesis={bearThesis}
            colorScheme="red"
          />
        </div>
      </CardContent>
    </Card>
  );
}
