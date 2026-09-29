/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ReactNode } from 'react';
import { useVirtualizer } from '../hooks/useVirtualizer';
import { Zap } from 'lucide-react';

interface Column<T> {
  header: string;
  className?: string;
  width?: string;
}

interface VirtualizedTableProps<T> {
  items: T[];
  columns: Column<T>[];
  rowHeight?: number;
  containerHeight?: number;
  renderRow: (item: T, index: number) => ReactNode;
  emptyState?: ReactNode;
  theme?: 'dark' | 'light';
  keyExtractor: (item: T, index: number) => string;
}

export function VirtualizedTable<T>({
  items,
  columns,
  rowHeight = 64,
  containerHeight = 520,
  renderRow,
  emptyState,
  theme = 'dark',
  keyExtractor
}: VirtualizedTableProps<T>) {
  const {
    containerRef,
    totalHeight,
    virtualItems,
    handleScroll
  } = useVirtualizer({
    items,
    itemHeight: rowHeight,
    containerHeight,
    overscan: 6
  });

  if (items.length === 0) {
    return (
      <div className={`rounded-2xl border p-12 text-center ${
        theme === 'dark' ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        {emptyState || <p className="text-slate-400 text-sm">موردی برای نمایش یافت نشد.</p>}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-sm flex flex-col ${
      theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
    }`}>
      {/* High-Performance Performance Badge */}
      <div className={`px-4 py-2 border-b flex items-center justify-between text-[11px] ${
        theme === 'dark' ? 'bg-slate-950/60 border-slate-800/80 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
      }`}>
        <div className="flex items-center gap-1.5 font-bold">
          <Zap className="w-3.5 h-3.5 text-teal-400 fill-teal-400" />
          <span>موتور رندر مجازی‌سازی فعال (Virtual Scrolling):</span>
          <span className="text-teal-400 font-mono font-black">{items.length.toLocaleString('fa-IR')} رکورد</span>
        </div>
        <div className="text-[10px] text-slate-500 font-mono hidden sm:block">
          رندر بهینه DOM: فقط {virtualItems.length} سطر همزمان
        </div>
      </div>

      {/* Table Sticky Header */}
      <div className="overflow-x-auto w-full">
        <div className="min-w-[700px]">
          <div className={`grid border-b select-none font-bold text-xs ${
            theme === 'dark' ? 'bg-slate-950 text-slate-300 border-slate-800' : 'bg-slate-100 text-slate-700 border-slate-200'
          }`}>
            <div className="flex items-center px-4 py-3">
              {columns.map((col, idx) => (
                <div key={idx} className={`${col.className || 'flex-1'} ${col.width || ''}`}>
                  {col.header}
                </div>
              ))}
            </div>
          </div>

          {/* Virtual Scroll Area */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            style={{ height: `${containerHeight}px` }}
            className="overflow-y-auto relative w-full divide-y divide-slate-800/50"
          >
            <div style={{ height: `${totalHeight}px`, width: '100%', position: 'relative' }}>
              {virtualItems.map((vItem) => {
                const item = vItem.data;
                const key = keyExtractor(item, vItem.index);
                return (
                  <div
                    key={key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${vItem.height}px`,
                      transform: `translateY(${vItem.offsetTop}px)`
                    }}
                    className={`transition-colors flex items-center px-4 virtualized-row relative z-0 ${
                      theme === 'dark'
                        ? 'hover:bg-slate-800/80 border-b border-slate-800/40 text-slate-200'
                        : 'hover:bg-slate-100 border-b border-slate-200 text-slate-900'
                    }`}
                  >
                    {renderRow(item, vItem.index)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
