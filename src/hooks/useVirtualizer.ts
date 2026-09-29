/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

interface UseVirtualizerOptions<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

export function useVirtualizer<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 5
}: UseVirtualizerOptions<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const totalCount = items.length;
  const totalHeight = totalCount * itemHeight;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const { startIndex, endIndex, virtualItems } = useMemo(() => {
    const rawStart = Math.floor(scrollTop / itemHeight);
    const start = Math.max(0, rawStart - overscan);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const end = Math.min(totalCount, rawStart + visibleCount + overscan);

    const vItems = [];
    for (let index = start; index < end; index++) {
      vItems.push({
        index,
        data: items[index],
        offsetTop: index * itemHeight,
        height: itemHeight
      });
    }

    return {
      startIndex: start,
      endIndex: end,
      virtualItems: vItems
    };
  }, [scrollTop, itemHeight, containerHeight, overscan, totalCount, items]);

  const scrollToIndex = useCallback((index: number) => {
    if (containerRef.current) {
      containerRef.current.scrollTop = index * itemHeight;
    }
  }, [itemHeight]);

  return {
    containerRef,
    totalHeight,
    virtualItems,
    startIndex,
    endIndex,
    handleScroll,
    scrollToIndex
  };
}
