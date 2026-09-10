"use client";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const SOURCE_COLORS: Record<string, string> = {
  espn: "#2563eb",
  sleeper: "#16a34a",
  custom: "#d97706",
  consensus: "#7c3aed",
};

export function MaeChart({ data, sources }: { data: Record<string, number | string>[]; sources: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
        <XAxis dataKey="week" tickFormatter={(w) => `W${w}`} stroke="currentColor" fontSize={12} />
        <YAxis stroke="currentColor" fontSize={12} width={32} />
        <Tooltip formatter={(v) => (typeof v === "number" ? v.toFixed(2) : String(v))} labelFormatter={(w) => `Week ${w}`} />
        <Legend />
        {sources.map((s) => (
          <Line key={s} type="monotone" dataKey={s} stroke={SOURCE_COLORS[s]} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function WeightsChart({ data }: { data: { position: string; espn: number; sleeper: number; custom: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} />
        <XAxis dataKey="position" stroke="currentColor" fontSize={12} />
        <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} stroke="currentColor" fontSize={12} width={40} />
        <Tooltip formatter={(v) => (typeof v === "number" ? `${Math.round(v * 100)}%` : String(v))} />
        <Legend />
        <Bar dataKey="espn" stackId="w" fill={SOURCE_COLORS.espn} name="ESPN" isAnimationActive={false} />
        <Bar dataKey="sleeper" stackId="w" fill={SOURCE_COLORS.sleeper} name="Sleeper" isAnimationActive={false} />
        <Bar dataKey="custom" stackId="w" fill={SOURCE_COLORS.custom} name="Model" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
