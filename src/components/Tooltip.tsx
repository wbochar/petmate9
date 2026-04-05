import React, { useState, useRef, useCallback, useLayoutEffect, ReactNode } from 'react';

interface TooltipProps {
  text: string;
  children: ReactNode;
}

const VIEWPORT_PADDING = 4;

export default function Tooltip({ text, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [adjustedLeft, setAdjustedLeft] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const handleEnter = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top });
    setVisible(true);
  }, []);

  const handleLeave = useCallback(() => {
    setVisible(false);
  }, []);

  // After the tooltip renders, measure it and clamp within the viewport
  useLayoutEffect(() => {
    if (!visible || !tipRef.current) return;
    const tipRect = tipRef.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    let left = pos.x;
    // Clamp right edge
    if (left + tipRect.width / 2 > vw - VIEWPORT_PADDING) {
      left = vw - VIEWPORT_PADDING - tipRect.width / 2;
    }
    // Clamp left edge
    if (left - tipRect.width / 2 < VIEWPORT_PADDING) {
      left = VIEWPORT_PADDING + tipRect.width / 2;
    }
    setAdjustedLeft(left);
  }, [visible, pos.x, text]);

  return (
    <div
      ref={ref}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{ display: 'inline-flex' }}
    >
      {children}
      {visible && (
        <div
          ref={tipRef}
          style={{
            position: 'fixed',
            left: `${adjustedLeft}px`,
            top: `${pos.y - 4}px`,
            transform: 'translate(-50%, -100%)',
            backgroundColor: 'rgba(0,0,0,0.9)',
            color: '#fff',
            padding: '2px 6px',
            borderRadius: '3px',
            fontSize: '11px',
            whiteSpace: 'nowrap',
            zIndex: 10000,
            pointerEvents: 'none',
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}
