"use client"

import React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SalesAnalyticsChartProps } from '@/types/components';

interface SalesData {
  Booking_Date: string;
  Total_Book: number;
}

// Transform the sales data to match the chart format
const transformSalesData = (salesData: SalesData[]) => {
  return salesData.map(item => ({
    date: item.Booking_Date,
    total: item.Total_Book
  }));
};

const chartConfig = {
  total: {
    label: "Total Sales",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig

export default function SalesAnalyticsChart({ data, className = '' }: SalesAnalyticsChartProps) {
  const [timeRange, setTimeRange] = React.useState("90d")

  // Transform and filter the data
  const chartData = React.useMemo(() => {
    const transformedData = transformSalesData(data);
    
    // Get the current date and calculate the start date based on selected range
    const now = new Date();
    let daysToSubtract = 90;
    if (timeRange === "30d") {
      daysToSubtract = 30;
    } else if (timeRange === "7d") {
      daysToSubtract = 7;
    }
    
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysToSubtract);
    startDate.setHours(0, 0, 0, 0); // Start of day
    
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999); // End of today
    
    // Filter data to only include dates within the selected range
    const filteredData = transformedData.filter((item) => {
      const itemDate = new Date(item.date);
      return itemDate >= startDate && itemDate <= endDate;
    });
    
    // Sort by date to ensure proper chronological order
    return filteredData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data, timeRange]);

  return (
    <Card className={`pt-0 ${className}`}>
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle>Sales Analytics</CardTitle>
          <CardDescription>
            Showing total sales for the selected period
          </CardDescription>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger
            className="hidden w-[160px] rounded-lg sm:ml-auto sm:flex"
            aria-label="Select a value"
          >
            <SelectValue placeholder="Last 3 months" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="90d" className="rounded-lg">
              Last 3 months
            </SelectItem>
            <SelectItem value="30d" className="rounded-lg">
              Last 30 days
            </SelectItem>
            <SelectItem value="7d" className="rounded-lg">
              Last 7 days
            </SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="fillTotal" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-total)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-total)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value)
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }}
                  indicator="dot"
                />
              }
            />
            <Area
              dataKey="total"
              type="natural"
              fill="url(#fillTotal)"
              stroke="var(--color-total)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
