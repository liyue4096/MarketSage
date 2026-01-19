'use client';

import React, { useState } from 'react';
import { PeerMetric } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatPercentage } from '@/lib/utils';
import { ArrowUpIcon, ArrowDownIcon, TrendingUp } from 'lucide-react';

interface TrackComparisonMatrixProps {
  peerTable: PeerMetric[];
  targetTicker: string;
}

type SortKey = 'ticker' | 'price' | 'peRatio' | 'rsi' | 'volumeDelta' | 'relativePerfomance';

export default function TrackComparisonMatrix({ peerTable, targetTicker }: TrackComparisonMatrixProps) {
  const [sortKey, setSortKey] = useState<SortKey>('relativePerfomance');
  const [sortAsc, setSortAsc] = useState(false);

  const sortedPeers = [...peerTable].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortAsc ? aVal - bVal : bVal - aVal;
    }
    return sortAsc
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return null;
    return sortAsc ? (
      <ArrowUpIcon className="w-3 h-3 inline ml-1" />
    ) : (
      <ArrowDownIcon className="w-3 h-3 inline ml-1" />
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          Track Comparison Matrix
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th
                  className="text-left py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort('ticker')}
                >
                  Ticker <SortIcon column="ticker" />
                </th>
                <th
                  className="text-right py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort('price')}
                >
                  Price <SortIcon column="price" />
                </th>
                <th
                  className="text-right py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort('peRatio')}
                >
                  P/E Ratio <SortIcon column="peRatio" />
                </th>
                <th
                  className="text-right py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort('rsi')}
                >
                  RSI <SortIcon column="rsi" />
                </th>
                <th
                  className="text-right py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort('volumeDelta')}
                >
                  Volume Δ <SortIcon column="volumeDelta" />
                </th>
                <th
                  className="text-right py-3 px-4 font-semibold text-gray-700 cursor-pointer hover:bg-gray-50"
                  onClick={() => handleSort('relativePerfomance')}
                >
                  Relative Perf. <SortIcon column="relativePerfomance" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedPeers.map((peer, index) => {
                const isTarget = peer.ticker === targetTicker;
                return (
                  <tr
                    key={peer.ticker}
                    className={`border-b border-gray-100 ${
                      isTarget ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className={isTarget ? 'text-blue-700' : 'text-gray-900'}>
                          {peer.ticker}
                          {isTarget && <span className="ml-2 text-xs text-blue-600">(Target)</span>}
                        </span>
                        <span className="text-xs text-gray-500">{peer.companyName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-gray-900">
                      ${peer.price.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={peer.peRatio < 0 ? 'text-red-600' : 'text-gray-900'}>
                        {peer.peRatio < 0 ? 'N/A' : peer.peRatio.toFixed(1)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={
                          peer.rsi > 70
                            ? 'text-red-600 font-semibold'
                            : peer.rsi < 30
                            ? 'text-green-600 font-semibold'
                            : 'text-gray-900'
                        }
                      >
                        {peer.rsi.toFixed(1)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={
                          peer.volumeDelta > 1.5
                            ? 'text-green-600 font-semibold'
                            : peer.volumeDelta < 0.8
                            ? 'text-red-600'
                            : 'text-gray-900'
                        }
                      >
                        {peer.volumeDelta.toFixed(2)}x
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {peer.relativePerfomance === 0 ? (
                        <span className="text-gray-500">—</span>
                      ) : (
                        <span
                          className={
                            peer.relativePerfomance > 0
                              ? 'text-green-600 font-semibold'
                              : 'text-red-600 font-semibold'
                          }
                        >
                          {formatPercentage(peer.relativePerfomance)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-xs text-gray-500 space-y-1">
          <p>Volume Δ: Current volume vs. 30-day average</p>
          <p>Relative Perf.: Performance vs. target stock over analysis period</p>
          <p className="text-orange-600">RSI &gt; 70 indicates overbought, &lt; 30 indicates oversold</p>
        </div>
      </CardContent>
    </Card>
  );
}
