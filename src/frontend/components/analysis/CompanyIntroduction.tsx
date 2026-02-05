'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Building2 } from 'lucide-react';

interface CompanyIntroductionProps {
  ticker: string;
  companyName: string;
  description?: string;
}

export default function CompanyIntroduction({ ticker, companyName, description }: CompanyIntroductionProps) {
  if (!description) {
    return null; // Don't render if no description
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-600" />
          Company Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-gray-900">{ticker}</span>
            <span className="text-gray-600">|</span>
            <span className="text-gray-700">{companyName}</span>
          </div>
          <p className="text-gray-700 leading-relaxed">
            {description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
