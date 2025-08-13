'use client';

import { useEffect, useState } from 'react';

type Entry = { label: string; value: number; grad: [string, string] };

export default function RevenueRings({ online, wholesale, variant = 'dark' }: { online: number; wholesale: number; variant?: 'light' | 'dark' }) {
  const entries: Entry[] = [
    { label: 'Online', value: online, grad: ['#60a5fa', '#22d3ee'] },
    { label: 'Wholesale', value: wholesale, grad: ['#34d399', '#a78bfa'] },
  ];
  const total = Math.max(0, online + wholesale);

  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const duration = 900;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [online, wholesale]);

  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const ringOuter = 78;
  const ringStroke = 12;
  const gapBetween = 10;
  const sum = entries.reduce((s, e) => s + e.value, 0) || 1;

  const rings = entries.map((e, i) => {
    const radius = Math.max(6, ringOuter - i * (ringStroke + gapBetween));
    const circumference = 2 * Math.PI * radius;
    const share = e.value / sum;
    const dashTarget = Math.max(2, circumference * share);
    const dash = dashTarget * progress;
    const gap = Math.max(2, circumference - dash);
    return { ...e, radius, dash, gap };
  });

  const baseStroke = variant === 'light' ? '#e5e7eb' : '#1f2937';
  const centerTextClass = variant === 'light' ? 'fill-slate-900' : 'fill-white';
  const labelTextClass = variant === 'light' ? 'text-slate-700' : 'text-gray-300';
  const valueTextClass = variant === 'light' ? 'text-slate-900' : 'text-white';
  const pctTextClass = variant === 'light' ? 'text-slate-500' : 'text-gray-400';

  return (
    <div className="flex items-center gap-6">
      <div className="relative">
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            {rings.map((r, idx) => (
              <linearGradient key={idx} id={`grad-${idx}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={r.grad[0]} />
                <stop offset="100%" stopColor={r.grad[1]} />
              </linearGradient>
            ))}
          </defs>
          {rings.map((r, idx) => (
            <g key={idx}>
              <circle cx={cx} cy={cy} r={r.radius} stroke={baseStroke} strokeWidth={ringStroke} fill="none" />
              <circle
                cx={cx}
                cy={cy}
                r={r.radius}
                stroke={`url(#grad-${idx})`}
                strokeWidth={ringStroke}
                strokeDasharray={`${r.dash} ${r.gap}`}
                strokeLinecap="round"
                fill="none"
                style={{ transition: 'stroke-dasharray 0.3s ease-out' }}
              />
            </g>
          ))}
          <g className="rotate-90" transform={`translate(${cx},${cy})`}>
            <text x={0} y={6} textAnchor="middle" className={centerTextClass} style={{ fontSize: '18px', fontWeight: 800 }}>
              ${total.toLocaleString()}
            </text>
          </g>
        </svg>
      </div>
      <div className="space-y-2">
        {rings.map((r, idx) => {
          const pct = sum > 0 ? (r.value / sum) * 100 : 0;
          return (
            <div key={idx} className="flex items-center justify-between gap-8 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded" style={{ background: `linear-gradient(90deg, ${r.grad[0]}, ${r.grad[1]})` }} />
                <span className={labelTextClass}>{r.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`${valueTextClass} font-semibold`}>${Math.round(r.value).toLocaleString()}</span>
                <span className={pctTextClass}>{pct.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 'use client';

// import { useState, useEffect } from 'react';
// import { RevenueRingsProps } from '@/types/components';

// export default function RevenueRings({ entries, total }: RevenueRingsProps) {
//   const [progress, setProgress] = useState(0);

//   useEffect(() => {
//     let raf: number;
//     const start = performance.now();
//     const duration = 900;
    
//     const step = (t: number) => {
//       const p = Math.min(1, (t - start) / duration);
//       setProgress(p);
//       if (p < 1) raf = requestAnimationFrame(step);
//     };
    
//     raf = requestAnimationFrame(step);
//     return () => cancelAnimationFrame(raf);
//   }, [entries.map(e => e.value).join(',')]);

//   const size = 200;
//   const cx = size / 2;
//   const cy = size / 2;
//   const ringOuter = 78;
//   const ringStroke = 12;
//   const gapBetween = 8;
//   const sum = entries.reduce((s, e) => s + e.value, 0) || 1;

//   const rings = entries.map((e, i) => {
//     const radius = Math.max(4, ringOuter - i * (ringStroke + gapBetween));
//     const circumference = 2 * Math.PI * radius;
//     const share = e.value / sum;
//     const dashTarget = Math.max(2, circumference * share);
//     const dash = dashTarget * progress;
//     const gap = circumference - dash;
//     return { ...e, radius, dash, gap };
//   });

//   return (
//     <div className="flex flex-col items-center">
//       <svg width={size} height={size}>
//         <defs>
//           {rings.map((r, idx) => (
//             <linearGradient key={idx} id={`grad-${idx}`} x1="0" y1="0" x2="1" y2="1">
//               <stop offset="0%" stopColor={r.grad[0]} />
//               <stop offset="100%" stopColor={r.grad[1]} />
//             </linearGradient>
//           ))}
//         </defs>
//         {rings.map((r, idx) => (
//           <g key={idx} transform={`rotate(-90 ${cx} ${cy})`}>
//             <circle cx={cx} cy={cy} r={r.radius} stroke="#e5e7eb" strokeWidth={ringStroke} fill="none" />
//             <circle
//               cx={cx}
//               cy={cy}
//               r={r.radius}
//               stroke={`url(#grad-${idx})`}
//               strokeWidth={ringStroke}
//               strokeDasharray={`${r.dash} ${r.gap}`}
//               strokeLinecap="round"
//               fill="none"
//               style={{ transition: 'stroke-dasharray 0.3s ease-out' }}
//             />
//           </g>
//         ))}
//         <text 
//           x={cx} 
//           y={cy + 4} 
//           textAnchor="middle" 
//           dominantBaseline="middle" 
//           className="fill-slate-900" 
//           style={{ fontSize: '20px', fontWeight: 800 }}
//         >
//           {Math.round(total * progress).toLocaleString()}
//         </text>
//       </svg>
//       <div className="mt-3 w-full space-y-1">
//         {rings.map((r, idx) => {
//           const pct = sum > 0 ? (r.value / sum) * 100 : 0;
//           return (
//             <div key={idx} className="flex items-center justify-between text-xs">
//               <div className="flex items-center gap-2">
//                 <span 
//                   className="w-3 h-3 rounded" 
//                   style={{ background: `linear-gradient(90deg, ${r.grad[0]}, ${r.grad[1]})` }} 
//                 />
//                 <span className="text-slate-700">{r.label}</span>
//               </div>
//               <div className="flex items-center gap-3">
//                 <span className="text-slate-900 font-semibold">{Math.round(r.value).toLocaleString()}</span>
//                 <span className="text-slate-500">{pct.toFixed(1)}%</span>
//               </div>
//             </div>
//           );
//         })}
//       </div>
//     </div>
//   );
// }
