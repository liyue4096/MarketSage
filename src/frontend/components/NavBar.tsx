'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  BarChart3,
  FileText,
  Activity,
  History,
  Search,
  Info,
  Menu,
  X,
  Github,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  disabled?: boolean;
  badge?: string;
}

const navItems: NavItem[] = [
  {
    name: 'Reports',
    href: '/',
    icon: <FileText className="w-4 h-4" />,
  },
  {
    name: 'Signals',
    href: '/signals',
    icon: <Activity className="w-4 h-4" />,
  },
  {
    name: 'Retro',
    href: '/retro',
    icon: <History className="w-4 h-4" />,
    disabled: true,
    badge: 'Soon',
  },
];

export default function NavBar() {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/' || pathname.startsWith('/report');
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      {/* Risk Disclosure Banner */}
      <div className="bg-amber-50 border-b border-amber-200">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-1.5">
          <div className="flex items-center justify-center gap-2 text-xs text-amber-900">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-medium">Risk Disclosure:</span>
            <span className="hidden sm:inline">
              AI-generated reports may contain inaccuracies. Not financial advice. Validate all data before trading.
            </span>
            <span className="sm:hidden">
              AI-generated. Not financial advice.
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <BarChart3 className="w-7 h-7 text-blue-600" />
              <div className="flex flex-col">
                <span className="text-xl font-bold text-gray-900 leading-none">
                  Market<span className="text-blue-600">Sage</span>
                </span>
                <span className="text-[10px] text-gray-500 italic leading-tight hidden sm:block">
                  Vision by AI. Value by you.
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.disabled ? '#' : item.href}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive(item.href)
                    ? 'bg-blue-50 text-blue-700'
                    : item.disabled
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
                onClick={item.disabled ? (e) => e.preventDefault() : undefined}
              >
                {item.icon}
                {item.name}
                {item.badge && (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>

          {/* Search & About */}
          <div className="hidden md:flex items-center gap-3">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search ticker... (coming soon)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled
                className="w-48 pl-9 pr-4 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            {/* About / GitHub Link */}
            <a
              href="https://github.com/liyue4096/MarketSage"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600
                       hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Github className="w-4 h-4" />
              <span className="hidden lg:inline">About</span>
            </a>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5 text-gray-600" />
            ) : (
              <Menu className="w-5 h-5 text-gray-600" />
            )}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-gray-100">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.disabled ? '#' : item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-blue-50 text-blue-700'
                      : item.disabled
                      ? 'text-gray-400'
                      : 'text-gray-600 hover:bg-gray-100'
                  )}
                  onClick={(e) => {
                    if (item.disabled) {
                      e.preventDefault();
                    } else {
                      setMobileMenuOpen(false);
                    }
                  }}
                >
                  {item.icon}
                  {item.name}
                  {item.badge && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded">
                      {item.badge}
                    </span>
                  )}
                </Link>
              ))}

              {/* Mobile Search */}
              <div className="px-4 py-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search ticker... (coming soon)"
                    disabled
                    className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg
                             disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Mobile About Link */}
              <a
                href="https://github.com/leonbay/MarketSage"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-600
                         hover:bg-gray-100 rounded-lg"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Github className="w-4 h-4" />
                About / GitHub
              </a>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
