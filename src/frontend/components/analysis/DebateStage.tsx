'use client';

import React, { useState } from 'react';
import { DebatePoint, Rebuttals, RebuttalPoint } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, ExternalLink, Swords, Shield, Scale } from 'lucide-react';

interface DebateStageProps {
  bullThesis: DebatePoint[];
  bearThesis: DebatePoint[];
  rebuttals?: Rebuttals;
  bullDefense?: DebatePoint[];
  bearDefense?: DebatePoint[];
}

interface ThesisCardProps {
  title: string;
  icon: React.ReactNode;
  thesis: DebatePoint[];
  colorScheme: 'green' | 'red';
}

// Rebuttal Card Component
interface RebuttalCardProps {
  title: string;
  rebuttals: RebuttalPoint[];
  colorScheme: 'green' | 'red';
}

function RebuttalCard({ title, rebuttals, colorScheme }: RebuttalCardProps) {
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
      hover: 'hover:bg-green-100'
    },
    red: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      hover: 'hover:bg-red-100'
    }
  };

  const scheme = colors[colorScheme];

  if (!rebuttals || rebuttals.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${scheme.bg} ${scheme.border} border`}>
        <Swords className={`w-5 h-5 ${scheme.text}`} />
        <h3 className={`font-bold ${scheme.text}`}>{title}</h3>
        <Badge variant="outline" className="ml-auto">
          {rebuttals.length} Rebuttals
        </Badge>
      </div>

      <div className="space-y-2">
        {rebuttals.map((rebuttal, index) => {
          const isExpanded = expandedPoints.includes(index);
          const strengthPercent = Math.round(rebuttal.strengthOfRebuttal * 100);
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
                    <p className="text-xs text-gray-500 mb-1">Challenging: "{rebuttal.originalPoint}"</p>
                    <p className="text-sm font-semibold text-gray-900 leading-snug">
                      {rebuttal.rebuttal}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {strengthPercent}%
                    </Badge>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    )}
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-100 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                      Evidence
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{rebuttal.evidence}</p>
                  </div>

                  {(rebuttal.source || rebuttal.dataDate) && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                        Source
                      </div>
                      <span className="text-xs text-gray-600">
                        {rebuttal.source}{rebuttal.dataDate && ` (${rebuttal.dataDate})`}
                      </span>
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

export default function DebateStage({ bullThesis, bearThesis, rebuttals, bullDefense, bearDefense }: DebateStageProps) {
  const hasRebuttals = rebuttals && (rebuttals.bullRebuttals?.length > 0 || rebuttals.bearRebuttals?.length > 0);
  const hasDefense = (bullDefense && bullDefense.length > 0) || (bearDefense && bearDefense.length > 0);

  return (
    <div className="space-y-6">
      {/* Round 1: Opening Arguments */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-blue-600" />
            <CardTitle>Round 1: Opening Arguments</CardTitle>
          </div>
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

      {/* Round 2: Rebuttals */}
      {hasRebuttals && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Swords className="w-5 h-5 text-orange-600" />
              <CardTitle>Round 2: Cross-Examination</CardTitle>
            </div>
            <p className="text-sm text-gray-600">
              Each side challenges the opponent's arguments with counter-evidence
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Bull's rebuttals against Bear */}
              <RebuttalCard
                title="Bull Challenges Bear"
                rebuttals={rebuttals.bullRebuttals || []}
                colorScheme="green"
              />

              {/* Bear's rebuttals against Bull */}
              <RebuttalCard
                title="Bear Challenges Bull"
                rebuttals={rebuttals.bearRebuttals || []}
                colorScheme="red"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Round 3: Final Defense */}
      {hasDefense && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-600" />
              <CardTitle>Round 3: Final Defense</CardTitle>
            </div>
            <p className="text-sm text-gray-600">
              Each side strengthens their position after considering rebuttals
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Bull Defense */}
              {bullDefense && bullDefense.length > 0 && (
                <ThesisCard
                  title="Bull Defense"
                  icon={<Shield className="w-5 h-5" />}
                  thesis={bullDefense}
                  colorScheme="green"
                />
              )}

              {/* Bear Defense */}
              {bearDefense && bearDefense.length > 0 && (
                <ThesisCard
                  title="Bear Defense"
                  icon={<Shield className="w-5 h-5" />}
                  thesis={bearDefense}
                  colorScheme="red"
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
