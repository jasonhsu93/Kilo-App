"use client";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
export function ReportChart({
  data,
}: {
  data: { name: string; quantity: number }[];
}) {
  return (
    <div className="chart" role="img" aria-label="各教練已完成堂數長條圖">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 16, right: 10, left: -30, bottom: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="#edf0e7"
            strokeDasharray="3 4"
          />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#7e897c", fontSize: 11 }}
            dy={8}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#98a28e", fontSize: 10 }}
          />
          <Tooltip
            cursor={{ fill: "#f3f6ee" }}
            formatter={(v) => [`${v} 堂`, "已完成"]}
          />
          <Bar
            dataKey="quantity"
            fill="#7a9d66"
            radius={[5, 5, 0, 0]}
            maxBarSize={38}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
