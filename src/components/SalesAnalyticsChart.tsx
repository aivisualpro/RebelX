'use client';

import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, MapPin } from 'lucide-react';

interface SalesData {
  date: string;
  total: number;
  locations: Record<string, number>;
}

interface SalesAnalyticsChartProps {
  data: SalesData[];
  className?: string;
}

const timeRanges = [
  { key: '6months', label: '6 Months', days: 180 },
  { key: '3months', label: '3 Months', days: 90 },
  { key: '30days', label: '30 Days', days: 30 },
  { key: '7days', label: '7 Days', days: 7 },
  { key: '24hours', label: '24 Hours', days: 1 },
];

const locationColors = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ef4444', // red
  '#84cc16', // lime
];

export default function SalesAnalyticsChart({ data, className = '' }: SalesAnalyticsChartProps) {
  const [selectedRange, setSelectedRange] = useState('30days');
  const [animationProgress, setAnimationProgress] = useState(0);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  // Filter data based on selected time range
  const filteredData = useMemo(() => {
    const range = timeRanges.find(r => r.key === selectedRange);
    if (!range) return data;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - range.days);
    
    return data.filter(item => new Date(item.date) >= cutoffDate).slice(-50); // Limit to 50 points for performance
  }, [data, selectedRange]);

  // Get unique locations and assign colors
  const locations = useMemo(() => {
    const locationSet = new Set<string>();
    filteredData.forEach(item => {
      Object.keys(item.locations).forEach(loc => locationSet.add(loc));
    });
    return Array.from(locationSet).slice(0, 8); // Limit to 8 locations for readability
  }, [filteredData]);

  // Calculate chart dimensions and scales
  const chartDimensions = useMemo(() => {
    if (filteredData.length === 0) return { maxValue: 0, minValue: 0 };
    
    const allValues = filteredData.flatMap(item => [
      item.total,
      ...Object.values(item.locations)
    ]);
    
    const maxValue = Math.max(...allValues);
    const minValue = Math.min(...allValues);
    
    return { maxValue, minValue };
  }, [filteredData]);

  // Animation effect
  useEffect(() => {
    setAnimationProgress(0);
    const timer = setTimeout(() => {
      setAnimationProgress(1);
    }, 100);
    return () => clearTimeout(timer);
  }, [selectedRange]);

  // Generate SVG path for a line
  const generatePath = (values: number[], smooth = true) => {
    if (values.length === 0) return '';
    
    const width = 800;
    const height = 200;
    const padding = 40;
    
    const xStep = (width - padding * 2) / Math.max(values.length - 1, 1);
    const yScale = (height - padding * 2) / (chartDimensions.maxValue - chartDimensions.minValue || 1);
    
    const points = values.map((value, index) => ({
      x: padding + index * xStep,
      y: height - padding - (value - chartDimensions.minValue) * yScale
    }));
    
    if (!smooth || points.length < 2) {
      return `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
    }
    
    // Create smooth curve using quadratic bezier curves
    let path = `M ${points[0].x},${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      
      if (next) {
        const cp1x = prev.x + (curr.x - prev.x) * 0.5;
        const cp1y = prev.y;
        const cp2x = curr.x - (next.x - curr.x) * 0.5;
        const cp2y = curr.y;
        
        path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${curr.x},${curr.y}`;
      } else {
        path += ` L ${curr.x},${curr.y}`;
      }
    }
    
    return path;
  };

  // Generate area path for gradient fill
  const generateAreaPath = (values: number[]) => {
    const linePath = generatePath(values);
    if (!linePath) return '';
    
    const width = 800;
    const height = 200;
    const padding = 40;
    
    const lastX = padding + (values.length - 1) * ((width - padding * 2) / Math.max(values.length - 1, 1));
    
    return `${linePath} L ${lastX},${height - padding} L ${padding},${height - padding} Z`;
  };

  const formatValue = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(0);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (selectedRange === '24hours') {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className={`bg-gradient-to-br from-white to-slate-50 rounded-2xl shadow-sm border border-slate-200 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <TrendingUp className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Sales Analytics</h3>
            {/* Month-over-Month Growth Indicator */}
            {(() => {
              if (filteredData.length < 2) return null;
              
              // Calculate MoM growth for the chart
              const currentPeriod = filteredData[filteredData.length - 1]?.total || 0;
              const previousPeriod = filteredData[filteredData.length - 2]?.total || 0;
              
              if (previousPeriod === 0) return null;
              
              const growthPercent = ((currentPeriod - previousPeriod) / previousPeriod) * 100;
              const isPositive = growthPercent > 0;
              
              return (
                <div className="flex items-center gap-2 mt-1">
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    isPositive 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {isPositive ? '↗' : '↘'} 
                    {Math.abs(growthPercent).toFixed(1)}% MoM
                  </div>
                  <span className="text-xs text-slate-500">
                    vs previous period
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
        
        {/* Time Range Selector */}
        <div className="flex items-center bg-slate-100 rounded-lg p-1">
          {timeRanges.map((range) => (
            <button
              key={range.key}
              onClick={() => setSelectedRange(range.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
                selectedRange === range.key
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Container */}
      <div className="relative">
        {filteredData.length > 0 ? (
          <>
            {/* SVG Chart */}
            <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-slate-50 to-white border border-slate-100">
              <svg
                viewBox="0 0 800 200"
                className="w-full h-48"
                style={{ minHeight: '200px' }}
              >
                {/* Grid Lines */}
                <defs>
                  <pattern id="grid" width="40" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" strokeWidth="0.5" opacity="0.5" />
                  </pattern>
                  
                  {/* Lighter, more elegant gradients */}
                  <linearGradient id="totalGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.15" />
                    <stop offset="50%" stopColor="#34d399" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="#6ee7b7" stopOpacity="0.02" />
                  </linearGradient>
                  
                  {/* Static gradient for location lines */}
                  <linearGradient id="totalLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
                    <stop offset="50%" stopColor="#34d399" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="#6ee7b7" stopOpacity="0.9" />
                  </linearGradient>
                  
                  {/* Subtle glow filter for lines */}
                  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                    <feMerge> 
                      <feMergeNode in="coloredBlur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                  

                  
                  {locations.map((location, index) => (
                    <linearGradient key={location} id={`gradient-${index}`} x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor={locationColors[index]} stopOpacity="0.3" />
                      <stop offset="50%" stopColor={locationColors[index]} stopOpacity="0.15" />
                      <stop offset="100%" stopColor={locationColors[index]} stopOpacity="0.02" />
                    </linearGradient>
                  ))}
                </defs>
                
                <rect width="800" height="200" fill="url(#grid)" />
                
                {/* Area fills for locations */}
                {locations.map((location, index) => {
                  const values = filteredData.map(item => item.locations[location] || 0);
                  const areaPath = generateAreaPath(values);
                  
                  return (
                    <path
                      key={`area-${location}`}
                      d={areaPath}
                      fill={`url(#gradient-${index})`}
                      opacity={animationProgress}
                      style={{
                        transition: 'opacity 1s ease-in-out',
                        transformOrigin: 'left center',
                        transform: `scaleX(${animationProgress})`,
                      }}
                    />
                  );
                })}
                
                {/* Total sales area */}
                <path
                  d={generateAreaPath(filteredData.map(item => item.total))}
                  fill="url(#totalGradient)"
                  opacity={animationProgress}
                  style={{
                    transition: 'opacity 1s ease-in-out',
                    transformOrigin: 'left center',
                    transform: `scaleX(${animationProgress})`,
                  }}
                />
                
                {/* Single Total Sales Line */}
                <g>
                  {/* Area fill with gradient */}
                  <path
                    d={generatePath(filteredData.map(item => item.total)) + ` L ${800 - 40} ${200 - 40} L 40 ${200 - 40} Z`}
                    fill="url(#totalGradient)"
                    opacity={animationProgress * 0.8}
                    style={{
                      transition: 'opacity 1s ease-in-out',
                      transitionDelay: '0.2s',
                    }}
                  />
                  {/* Main sales line */}
                  <path
                    d={generatePath(filteredData.map(item => item.total))}
                    fill="none"
                    stroke="url(#totalLineGradient)"
                    strokeWidth="3"
                    opacity={animationProgress}
                    style={{
                      transition: 'opacity 1s ease-in-out',
                      strokeDasharray: '1000',
                      strokeDashoffset: `${1000 * (1 - animationProgress)}`,
                      transitionDelay: '0.4s',
                    }}
                  />
                  
                  {/* Interactive hover points with improved UX */}
                  {filteredData.map((item, index) => {
                    const width = 800;
                    const height = 200;
                    const padding = 40;
                    const xStep = (width - padding * 2) / Math.max(filteredData.length - 1, 1);
                    const yScale = (height - padding * 2) / (chartDimensions.maxValue - chartDimensions.minValue || 1);
                    
                    const x = padding + index * xStep;
                    const y = height - padding - (item.total - chartDimensions.minValue) * yScale;
                    
                    return (
                      <g key={`point-group-${index}`}>
                        {/* Outer glow ring */}
                        <circle
                          cx={x}
                          cy={y}
                          r={hoveredPoint === index ? "12" : "0"}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="2"
                          opacity={hoveredPoint === index ? 0.3 : 0}
                          className="transition-all duration-300 ease-out"
                        />
                        {/* Main data point */}
                        <circle
                          cx={x}
                          cy={y}
                          r={hoveredPoint === index ? "6" : "3"}
                          fill="#10b981"
                          opacity={hoveredPoint === index ? 1 : 0.7}
                          className="transition-all duration-300 ease-out"
                          style={{
                            filter: hoveredPoint === index 
                              ? 'drop-shadow(0 4px 8px rgba(16, 185, 129, 0.4))' 
                              : 'none',
                          }}
                        />
                        {/* Vertical guide line */}
                        {hoveredPoint === index && (
                          <line
                            x1={x}
                            y1={y}
                            x2={x}
                            y2={height - padding}
                            stroke="#10b981"
                            strokeWidth="1"
                            strokeDasharray="4,4"
                            opacity="0.5"
                            className="transition-opacity duration-300"
                          />
                        )}
                      </g>
                    );
                  })}
                  
                  {/* Enhanced hover area with better interaction */}
                  <rect
                    x="0"
                    y="0"
                    width="800"
                    height="200"
                    fill="transparent"
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const svgRect = e.currentTarget.closest('svg')?.getBoundingClientRect();
                      if (!svgRect) return;
                      
                      const x = e.clientX - svgRect.left - 40;
                      const pointIndex = Math.round((x / 720) * (filteredData.length - 1));
                      if (pointIndex >= 0 && pointIndex < filteredData.length) {
                        setHoveredPoint(pointIndex);
                      }
                    }}
                    onMouseLeave={() => setHoveredPoint(null)}
                    style={{ cursor: 'crosshair' }}
                  />
                </g>
                

                
                {/* X-axis labels */}
                {(() => {
                  const width = 800;
                  const height = 200;
                  const padding = 40;
                  
                  const labels: Array<{ x: number; text: string }> = [];
                  
                  if (filteredData.length === 0) return [];
                  
                  // Generate labels based on the actual time range, not just available data
                  const range = timeRanges.find(r => r.key === selectedRange);
                  if (!range) return [];
                  
                  const endDate = new Date();
                  const startDate = new Date();
                  startDate.setDate(startDate.getDate() - range.days);
                  
                  let labelDates: Date[] = [];
                  
                  if (selectedRange === '24hours') {
                    // Show 6 time points throughout the day
                    for (let i = 0; i < 6; i++) {
                      const date = new Date(startDate);
                      date.setHours(date.getHours() + (i * 4)); // Every 4 hours
                      labelDates.push(date);
                    }
                  } else if (selectedRange === '7days') {
                    // Show each day
                    for (let i = 0; i < 7; i++) {
                      const date = new Date(startDate);
                      date.setDate(date.getDate() + i);
                      labelDates.push(date);
                    }
                  } else if (selectedRange === '30days') {
                    // Show 6 evenly spaced dates over 30 days
                    for (let i = 0; i < 6; i++) {
                      const date = new Date(startDate);
                      date.setDate(date.getDate() + Math.floor((i * 30) / 5));
                      labelDates.push(date);
                    }
                  } else if (selectedRange === '3months') {
                    // Show 3 months
                    for (let i = 0; i < 3; i++) {
                      const date = new Date(startDate);
                      date.setMonth(date.getMonth() + i);
                      labelDates.push(date);
                    }
                  } else if (selectedRange === '6months') {
                    // Show 6 months
                    for (let i = 0; i < 6; i++) {
                      const date = new Date(startDate);
                      date.setMonth(date.getMonth() + i);
                      labelDates.push(date);
                    }
                  }
                  
                  // Generate labels from the calculated dates
                  labelDates.forEach((date, index) => {
                    const x = padding + (index / Math.max(labelDates.length - 1, 1)) * (width - padding * 2);
                    
                    let labelText = '';
                    if (selectedRange === '6months' || selectedRange === '3months') {
                      labelText = date.toLocaleDateString('en-US', { month: 'short' });
                    } else if (selectedRange === '24hours') {
                      labelText = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    } else {
                      labelText = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }
                    
                    labels.push({ x, text: labelText });
                  });
                  
                  return labels.map((label, index) => (
                    <text
                      key={index}
                      x={label.x}
                      y={height - 10}
                      textAnchor="middle"
                      className="fill-slate-500 text-xs"
                      style={{ fontSize: '11px' }}
                    >
                      {label.text}
                    </text>
                  ));
                })()}

              </svg>
              
              {/* Enhanced Tooltip */}
              {hoveredPoint !== null && (() => {
                // Calculate the correct date based on hover position and time range
                const range = timeRanges.find(r => r.key === selectedRange);
                if (!range) return null;
                
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - range.days);
                
                // Calculate the date based on the hover position
                const progress = hoveredPoint / Math.max(filteredData.length - 1, 1);
                const timeDiff = endDate.getTime() - startDate.getTime();
                const hoverDate = new Date(startDate.getTime() + (timeDiff * progress));
                
                return (
                  <div 
                    className="absolute bg-white border border-slate-200 rounded-xl shadow-xl p-4 pointer-events-none z-20 backdrop-blur-sm"
                    style={{
                      left: `${Math.min(350, Math.max(10, (hoveredPoint / Math.max(filteredData.length - 1, 1)) * 720 + 40))}px`,
                      top: '20px',
                      background: 'rgba(255, 255, 255, 0.95)',
                      border: '1px solid rgba(16, 185, 129, 0.2)',
                      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                      <div className="text-sm font-medium text-slate-700">
                        {formatDate(hoverDate.toISOString().split('T')[0])}
                      </div>
                    </div>
                  <div className="text-xl font-bold text-emerald-600 mb-1">
                    {formatValue(filteredData[hoveredPoint].total)} SAR
                  </div>
                    <div className="text-xs text-slate-500">
                      Total Sales
                    </div>
                    {/* Small arrow pointing to the data point */}
                    <div 
                      className="absolute w-3 h-3 bg-white border-l border-b border-slate-200 transform rotate-45"
                      style={{
                        bottom: '-6px',
                        left: '50%',
                        marginLeft: '-6px',
                        borderColor: 'rgba(16, 185, 129, 0.2)',
                      }}
                    />
                  </div>
                );
              })()}
            </div>
            
            {/* Legend - Only Location Lines */}
            <div className="mt-4 flex flex-wrap gap-4">
              {locations.map((location, index) => (
                <div key={location} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: locationColors[index] }}
                  />
                  <span className="text-sm text-slate-600 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {location}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-48 text-slate-500">
            <div className="text-center">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No sales data available for the selected period</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
