import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { RefObject } from "react";

type UseVirtualScrollOptions<TItem> = {
  items: TItem[];
  containerRef: RefObject<HTMLElement | null>;
  estimateItemHeight?: number;
  overscan?: number;
};

export type VirtualItem<TItem> = {
  item: TItem;
  index: number;
  measure: (node: HTMLElement | null) => void;
};

type UseVirtualScrollResult<TItem> = {
  virtualItems: VirtualItem<TItem>[];
  topSpacerHeight: number;
  bottomSpacerHeight: number;
  totalHeight: number;
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function findFirstVisibleIndex(offsets: number[], scrollTop: number) {
  let low = 0;
  let high = offsets.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (offsets[mid] <= scrollTop) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return Math.max(0, low - 1);
}

export function useVirtualScroll<TItem>(options: UseVirtualScrollOptions<TItem>): UseVirtualScrollResult<TItem> {
  const estimateItemHeight = options.estimateItemHeight ?? 92;
  const overscan = options.overscan ?? 6;

  const sizeByIndexRef = useRef<number[]>([]);
  const rafHandleRef = useRef<number | null>(null);
  const observedNodeRef = useRef<HTMLElement | null>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);
  const [measureVersion, bumpMeasureVersion] = useReducer((value) => value + 1, 0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  if (sizeByIndexRef.current.length !== options.items.length) {
    sizeByIndexRef.current = options.items.map((_, index) => sizeByIndexRef.current[index] ?? estimateItemHeight);
  }

  useEffect(() => {
    const node = options.containerRef.current;
    if (!node || observedNodeRef.current === node) {
      return;
    }

    cleanupListenersRef.current?.();
    observedNodeRef.current = node;

    const sync = () => {
      if (rafHandleRef.current !== null) {
        return;
      }

      rafHandleRef.current = window.requestAnimationFrame(() => {
        rafHandleRef.current = null;
        setScrollTop(node.scrollTop);
        setViewportHeight(node.clientHeight);
      });
    };

    sync();
    node.addEventListener("scroll", sync, { passive: true });

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => sync());

    resizeObserver?.observe(node);
    window.addEventListener("resize", sync);

    const cleanup = () => {
      node.removeEventListener("scroll", sync);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", sync);
      if (rafHandleRef.current !== null) {
        window.cancelAnimationFrame(rafHandleRef.current);
        rafHandleRef.current = null;
      }
    };

    cleanupListenersRef.current = cleanup;
  });

  useEffect(() => () => {
    cleanupListenersRef.current?.();
    cleanupListenersRef.current = null;
    observedNodeRef.current = null;
  }, []);

  const offsets = useMemo(() => {
    const nextOffsets = new Array(options.items.length + 1).fill(0);

    for (let index = 0; index < options.items.length; index += 1) {
      nextOffsets[index + 1] = nextOffsets[index] + (sizeByIndexRef.current[index] ?? estimateItemHeight);
    }

    return nextOffsets;
  }, [estimateItemHeight, measureVersion, options.items.length]);

  const totalHeight = offsets[offsets.length - 1] ?? 0;
  const visibleStart = clamp(findFirstVisibleIndex(offsets, scrollTop) - overscan, 0, Math.max(0, options.items.length - 1));
  const visibleEndRaw = findFirstVisibleIndex(offsets, scrollTop + viewportHeight) + overscan;
  const visibleEnd = clamp(visibleEndRaw, visibleStart, Math.max(0, options.items.length - 1));

  const virtualItems = useMemo(() => {
    if (options.items.length === 0) {
      return [] as VirtualItem<TItem>[];
    }

    return options.items
      .slice(visibleStart, visibleEnd + 1)
      .map((item, indexOffset) => {
        const index = visibleStart + indexOffset;
        return {
          item,
          index,
          measure: (node: HTMLElement | null) => {
            if (!node) {
              return;
            }

            const nextHeight = Math.max(48, Math.ceil(node.getBoundingClientRect().height));
            if (Math.abs((sizeByIndexRef.current[index] ?? estimateItemHeight) - nextHeight) <= 1) {
              return;
            }

            sizeByIndexRef.current[index] = nextHeight;
            bumpMeasureVersion();
          },
        };
      });
  }, [estimateItemHeight, options.items, visibleEnd, visibleStart]);

  const topSpacerHeight = offsets[visibleStart] ?? 0;
  const bottomSpacerHeight = totalHeight - (offsets[visibleEnd + 1] ?? totalHeight);

  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = "auto") => {
    const node = options.containerRef.current;
    if (!node) {
      return;
    }

    const clampedIndex = clamp(index, 0, options.items.length);
    const offset = offsets[clampedIndex] ?? totalHeight;
    node.scrollTo({ top: offset, behavior });
  }, [offsets, options.containerRef, options.items.length, totalHeight]);

  return {
    virtualItems,
    topSpacerHeight,
    bottomSpacerHeight,
    totalHeight,
    scrollToIndex,
  };
}
