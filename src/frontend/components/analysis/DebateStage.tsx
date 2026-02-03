'use client';

import React, { useState } from 'react';
import { DebatePoint, Rebuttals, RebuttalPoint } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, ExternalLink, Swords, Shield, Scale } from 'lucide-react';

type Language = 'en' | 'zh';

interface DebateStageProps {
  bullThesis: DebatePoint[];
  bearThesis: DebatePoint[];
  rebuttals?: Rebuttals;
  bullDefense?: DebatePoint[];
  bearDefense?: DebatePoint[];
  // Chinese translations
  bullThesisChinese?: DebatePoint[];
  bearThesisChinese?: DebatePoint[];
  rebuttalsChinese?: Rebuttals;
  language?: Language;
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

export default function DebateStage({
  bullThesis,
  bearThesis,
  rebuttals,
  bullDefense,
  bearDefense,
  bullThesisChinese,
  bearThesisChinese,
  rebuttalsChinese,
  language = 'en'
}: DebateStageProps) {
  // Use Chinese translations if available and language is Chinese
  const displayBullThesis = language === 'zh' && bullThesisChinese?.length ? bullThesisChinese : bullThesis;
  const displayBearThesis = language === 'zh' && bearThesisChinese?.length ? bearThesisChinese : bearThesis;
  const displayRebuttals = language === 'zh' && rebuttalsChinese ? rebuttalsChinese : rebuttals;

  const hasRebuttals = displayRebuttals && (displayRebuttals.bullRebuttals?.length > 0 || displayRebuttals.bearRebuttals?.length > 0);
  const hasDefense = (bullDefense && bullDefense.length > 0) || (bearDefense && bearDefense.length > 0);

  // Labels for both languages
  const labels = {
    en: {
      round1: 'Round 1: Opening Arguments',
      round1Desc: 'Multi-agent analysis with independent bull and bear perspectives',
      round2: 'Round 2: Cross-Examination',
      round2Desc: 'Each side challenges the opponent\'s arguments with counter-evidence',
      round3: 'Round 3: Final Defense',
      round3Desc: 'Each side strengthens their position after considering rebuttals',
      bullThesis: 'Bull Thesis',
      bearThesis: 'Bear Thesis',
      bullChallenges: 'Bull Challenges Bear',
      bearChallenges: 'Bear Challenges Bull',
      bullDefense: 'Bull Defense',
      bearDefense: 'Bear Defense',
    },
    zh: {
      round1: '第一轮：开场辩论',
      round1Desc: '多智能体分析，独立呈现多头和空头观点',
      round2: '第二轮：交叉质询',
      round2Desc: '双方以反证挑战对方论点',
      round3: '第三轮：最终辩护',
      round3Desc: '双方在考虑反驳后加强自己的立场',
      bullThesis: '多头论点',
      bearThesis: '空头论点',
      bullChallenges: '多头挑战空头',
      bearChallenges: '空头挑战多头',
      bullDefense: '多头辩护',
      bearDefense: '空头辩护',
    }
  };
  const t = labels[language];

  return (
    <div className="space-y-6">
      {/* Round 1: Opening Arguments */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-blue-600" />
            <CardTitle>{t.round1}</CardTitle>
          </div>
          <p className="text-sm text-gray-600">
            {t.round1Desc}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bull Thesis */}
            <ThesisCard
              title={t.bullThesis}
              icon={<TrendingUp className="w-5 h-5" />}
              thesis={displayBullThesis}
              colorScheme="green"
            />

            {/* Bear Thesis */}
            <ThesisCard
              title={t.bearThesis}
              icon={<TrendingDown className="w-5 h-5" />}
              thesis={displayBearThesis}
              colorScheme="red"
            />
          </div>
        </CardContent>
      </Card>

      {/* Round 2: Rebuttals */}
      {hasRebuttals && displayRebuttals && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Swords className="w-5 h-5 text-orange-600" />
              <CardTitle>{t.round2}</CardTitle>
            </div>
            <p className="text-sm text-gray-600">
              {t.round2Desc}
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Bull's rebuttals against Bear */}
              <RebuttalCard
                title={t.bullChallenges}
                rebuttals={displayRebuttals.bullRebuttals || []}
                colorScheme="green"
              />

              {/* Bear's rebuttals against Bull */}
              <RebuttalCard
                title={t.bearChallenges}
                rebuttals={displayRebuttals.bearRebuttals || []}
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
              <CardTitle>{t.round3}</CardTitle>
            </div>
            <p className="text-sm text-gray-600">
              {t.round3Desc}
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Bull Defense */}
              {bullDefense && bullDefense.length > 0 && (
                <ThesisCard
                  title={t.bullDefense}
                  icon={<Shield className="w-5 h-5" />}
                  thesis={bullDefense}
                  colorScheme="green"
                />
              )}

              {/* Bear Defense */}
              {bearDefense && bearDefense.length > 0 && (
                <ThesisCard
                  title={t.bearDefense}
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
