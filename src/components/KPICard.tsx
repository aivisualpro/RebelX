import React from 'react';
// import { KPICardProps } from '@/types/components';

export default function KPICard({ 
  title, 
  value, 
  subtitle, 
  className = '', 
  icon,
  trend 
}: any) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-5 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-slate-500 text-sm">{title}</div>
        {icon && <div className="text-slate-400">{icon}</div>}
      </div>
      
      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-bold text-slate-900 mt-2">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
          {subtitle && (
            <div className="text-xs text-slate-500 mt-1">{subtitle}</div>
          )}
        </div>
        
        {trend && (
          <div className={`text-xs font-medium ${
            trend.isPositive ? 'text-green-600' : 'text-red-600'
          }`}>
            {trend.isPositive ? '+' : ''}{trend.value}%
          </div>
        )}
      </div>
    </div>
  );
}
