/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';

interface InteractiveEyesProps {
  isClosed?: boolean; // When password is shown or user hides
  theme?: 'light' | 'dark';
  className?: string;
}

export default function InteractiveEyes({ isClosed = false, theme = 'dark', className = '' }: InteractiveEyesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pupilPos, setPupilPos] = useState({ x: 0, y: 0 });
  const [isBlinking, setIsBlinking] = useState(false);

  // Mouse tracking calculation
  useEffect(() => {
    let animationFrameId: number;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || isClosed) return;

      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const eyeCenterX = rect.left + rect.width / 2;
        const eyeCenterY = rect.top + rect.height / 2;

        const deltaX = e.clientX - eyeCenterX;
        const deltaY = e.clientY - eyeCenterY;

        // Angle and radius calculation
        const angle = Math.atan2(deltaY, deltaX);
        const distance = Math.hypot(deltaX, deltaY);

        // Max radius for pupil travel inside the sclera (px)
        const maxRadius = 9;
        const clampedDist = Math.min(distance / 25, maxRadius);

        const x = Math.cos(angle) * clampedDist;
        const y = Math.sin(angle) * clampedDist;

        setPupilPos({ x, y });
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isClosed]);

  // Natural spontaneous blinking effect
  useEffect(() => {
    if (isClosed) return;

    const triggerBlink = () => {
      setIsBlinking(true);
      setTimeout(() => {
        setIsBlinking(false);
      }, 150);
    };

    const interval = setInterval(() => {
      if (Math.random() > 0.3) {
        triggerBlink();
      }
    }, 3800);

    return () => clearInterval(interval);
  }, [isClosed]);

  const effectiveClosed = isClosed || isBlinking;

  return (
    <div 
      ref={containerRef} 
      className={`relative inline-flex items-center justify-center select-none transition-all duration-300 ${className}`}
      dir="ltr"
    >
      {/* Decorative Outer Glow Capsule */}
      <div className={`p-2.5 rounded-3xl border flex items-center justify-center gap-3.5 transition-all duration-300 shadow-xl ${
        theme === 'dark'
          ? 'bg-slate-900/90 border-slate-800 shadow-slate-950/80'
          : 'bg-white border-slate-200 shadow-slate-200/80'
      }`}>
        
        {/* Left Eye */}
        <div className="relative w-12 h-12 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-950 border-2 border-slate-300 dark:border-slate-800 flex items-center justify-center shadow-inner transition-all duration-200">
          {effectiveClosed ? (
            /* Closed Eye (Curved happy/shy eyelid arc) */
            <div className="w-7 h-3.5 border-b-[3px] border-teal-500 dark:border-teal-400 rounded-b-full animate-in fade-in zoom-in-75 duration-200" />
          ) : (
            /* Open Eye Sclera & Moving Pupil */
            <div 
              className="relative w-6 h-6 rounded-full bg-gradient-to-br from-teal-400 via-teal-500 to-emerald-600 flex items-center justify-center shadow-md transition-transform duration-75 ease-out"
              style={{
                transform: `translate(${pupilPos.x}px, ${pupilPos.y}px)`
              }}
            >
              {/* Inner Deep Pupil */}
              <div className="w-3.5 h-3.5 rounded-full bg-slate-950 flex items-center justify-center">
                {/* Specular Light Reflection */}
                <div className="w-1.5 h-1.5 rounded-full bg-white absolute top-1 left-1 opacity-90 shadow-sm" />
                <div className="w-0.5 h-0.5 rounded-full bg-white absolute bottom-1 right-1 opacity-70" />
              </div>
            </div>
          )}
        </div>

        {/* Center Tech Dot / Nose Accent */}
        <div className="flex flex-col items-center gap-1 opacity-60">
          <span className={`w-1.5 h-1.5 rounded-full transition-colors ${effectiveClosed ? 'bg-amber-400 animate-pulse' : 'bg-teal-400'}`} />
          <span className="w-1 h-1 rounded-full bg-slate-400/50" />
        </div>

        {/* Right Eye */}
        <div className="relative w-12 h-12 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-950 border-2 border-slate-300 dark:border-slate-800 flex items-center justify-center shadow-inner transition-all duration-200">
          {effectiveClosed ? (
            /* Closed Eye (Curved happy/shy eyelid arc) */
            <div className="w-7 h-3.5 border-b-[3px] border-teal-500 dark:border-teal-400 rounded-b-full animate-in fade-in zoom-in-75 duration-200" />
          ) : (
            /* Open Eye Sclera & Moving Pupil */
            <div 
              className="relative w-6 h-6 rounded-full bg-gradient-to-br from-teal-400 via-teal-500 to-emerald-600 flex items-center justify-center shadow-md transition-transform duration-75 ease-out"
              style={{
                transform: `translate(${pupilPos.x}px, ${pupilPos.y}px)`
              }}
            >
              {/* Inner Deep Pupil */}
              <div className="w-3.5 h-3.5 rounded-full bg-slate-950 flex items-center justify-center">
                {/* Specular Light Reflection */}
                <div className="w-1.5 h-1.5 rounded-full bg-white absolute top-1 left-1 opacity-90 shadow-sm" />
                <div className="w-0.5 h-0.5 rounded-full bg-white absolute bottom-1 right-1 opacity-70" />
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Mini status indicator caption */}
      <div className="absolute -bottom-2 px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-tight bg-slate-950 border border-slate-800 text-slate-400 shadow-sm flex items-center gap-1">
        <span className={`w-1.5 h-1.5 rounded-full ${effectiveClosed ? 'bg-amber-400' : 'bg-teal-400 animate-ping'}`} />
        <span>{effectiveClosed ? 'حفاظت امنیتی رمز' : 'نگهبان امنیتی سامانه'}</span>
      </div>
    </div>
  );
}
