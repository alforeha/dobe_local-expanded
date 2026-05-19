import { useCallback, useEffect, useRef, useState } from 'react';

interface GalleryDateSliderProps {
  minDate: string; // YYYY-MM-DD
  maxDate: string; // YYYY-MM-DD
  startDate: string;
  endDate: string;
  count: number;
  onRangeChange: (start: string, end: string) => void;
}

function dateToNum(date: string): number {
  return new Date(date).getTime();
}

function numToDate(num: number): string {
  return new Date(num).toISOString().slice(0, 10);
}

function formatLabel(date: string, dragging: boolean): string {
  if (dragging) {
    return date.slice(2);
  }

  const d = new Date(date);
  const yy = String(d.getFullYear()).slice(2);
  const mmm = d.toLocaleString('default', { month: 'short' }).toUpperCase();
  return `${yy}-${mmm}`;
}

export function GalleryDateSlider({
  minDate,
  maxDate,
  startDate,
  endDate,
  count,
  onRangeChange,
}: GalleryDateSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const startHandleRef = useRef<HTMLDivElement>(null);
  const endHandleRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);

  const minNum = dateToNum(minDate);
  const maxNum = dateToNum(maxDate);
  const startNum = dateToNum(startDate);
  const endNum = dateToNum(endDate);

  const getPercent = (num: number) =>
    maxNum === minNum ? 0 : ((num - minNum) / (maxNum - minNum)) * 100;

  const startPct = getPercent(startNum);
  const endPct = getPercent(endNum);

  const getDateFromY = useCallback((clientY: number): string => {
    if (!trackRef.current) return minDate;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    const num = minNum + pct * (maxNum - minNum);
    return numToDate(num);
  }, [maxNum, minDate, minNum]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging) return;
    const date = getDateFromY(e.clientY);
    if (dragging === 'start') {
      const clamped = date > endDate ? endDate : date;
      onRangeChange(clamped, endDate);
    } else {
      const clamped = date < startDate ? startDate : date;
      onRangeChange(startDate, clamped);
    }
  }, [dragging, endDate, getDateFromY, onRangeChange, startDate]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!dragging || !e.touches[0]) return;
    const date = getDateFromY(e.touches[0].clientY);
    if (dragging === 'start') {
      const clamped = date > endDate ? endDate : date;
      onRangeChange(clamped, endDate);
    } else {
      const clamped = date < startDate ? startDate : date;
      onRangeChange(startDate, clamped);
    }
  }, [dragging, endDate, getDateFromY, onRangeChange, startDate]);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [dragging, handleMouseMove, handleMouseUp, handleTouchMove]);

  useEffect(() => {
    const startEl = startHandleRef.current;
    const endEl = endHandleRef.current;
    if (!startEl || !endEl) return;

    const onStartTouch = (e: TouchEvent) => {
      e.preventDefault();
      setDragging('start');
    };
    const onEndTouch = (e: TouchEvent) => {
      e.preventDefault();
      setDragging('end');
    };

    startEl.addEventListener('touchstart', onStartTouch, { passive: false });
    endEl.addEventListener('touchstart', onEndTouch, { passive: false });

    return () => {
      startEl.removeEventListener('touchstart', onStartTouch);
      endEl.removeEventListener('touchstart', onEndTouch);
    };
  }, []);

  if (minDate === maxDate) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: '12px',
        top: '160px',
        bottom: '40px',
        width: '48px',
        zIndex: 500,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      <div
        ref={trackRef}
        style={{
          flex: 1,
          width: '4px',
          borderRadius: '4px',
          background: '#e2e8f0',
          position: 'relative',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: `${startPct}%`,
            height: `${endPct - startPct}%`,
            width: '100%',
            background: '#f59e0b',
            borderRadius: '4px',
          }}
        />

        {endPct > startPct && (
          <div style={{
            position: 'absolute',
            top: `${(startPct + endPct) / 2}%`,
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: '#f59e0b',
            color: '#ffffff',
            borderRadius: '999px',
            padding: '2px 6px',
            fontSize: '10px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 1,
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          }}>
            {count}
          </div>
        )}

        <div
          ref={startHandleRef}
          onMouseDown={(e) => { e.preventDefault(); setDragging('start'); }}
          style={{
            position: 'absolute',
            top: `${startPct}%`,
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: '#ffffff',
            border: '2px solid #f59e0b',
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            cursor: 'grab',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: '8px', fontWeight: 700, color: '#f59e0b', lineHeight: 1 }}>
            {formatLabel(startDate, false)}
          </span>
          {dragging === 'start' && (
            <div style={{
              position: 'absolute',
              left: '24px',
              background: 'rgba(255,255,255,0.95)',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              padding: '2px 5px',
              fontSize: '10px',
              fontWeight: 600,
              color: '#374151',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
              pointerEvents: 'none',
            }}>
              {formatLabel(startDate, true)}
            </div>
          )}
        </div>

        <div
          ref={endHandleRef}
          onMouseDown={(e) => { e.preventDefault(); setDragging('end'); }}
          style={{
            position: 'absolute',
            top: `${endPct}%`,
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: '#ffffff',
            border: '2px solid #f59e0b',
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            cursor: 'grab',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: '8px', fontWeight: 700, color: '#f59e0b', lineHeight: 1 }}>
            {formatLabel(endDate, false)}
          </span>
          {dragging === 'end' && (
            <div style={{
              position: 'absolute',
              left: '24px',
              background: 'rgba(255,255,255,0.95)',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              padding: '2px 5px',
              fontSize: '10px',
              fontWeight: 600,
              color: '#374151',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
              pointerEvents: 'none',
            }}>
              {formatLabel(endDate, true)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
