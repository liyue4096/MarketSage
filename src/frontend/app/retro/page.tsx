'use client';

import { History, Clock, BarChart2, Target } from 'lucide-react';

export default function RetroPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          {/* Icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-6">
            <History className="w-8 h-8 text-amber-600" />
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Retrospective Analysis
          </h1>

          {/* Description */}
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
            Evaluate the performance of our AI-generated reports by comparing predictions
            with actual market outcomes. Coming soon.
          </p>

          {/* Coming Soon Badge */}
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
            <Clock className="w-4 h-4" />
            Under Development
          </span>

          {/* Feature Preview */}
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6 text-left">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <Target className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Accuracy Tracking</h3>
              <p className="text-sm text-gray-600">
                Track how often our Strong Buy, Neutral, and Short verdicts align with
                actual price movements.
              </p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6 text-left">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <BarChart2 className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Performance Metrics</h3>
              <p className="text-sm text-gray-600">
                View returns if you had followed our signals at 1-week, 1-month, and
                3-month intervals.
              </p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6 text-left">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <History className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Historical Review</h3>
              <p className="text-sm text-gray-600">
                Deep dive into past reports and understand what factors led to
                correct or incorrect predictions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
