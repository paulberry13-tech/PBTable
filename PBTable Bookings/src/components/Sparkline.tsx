import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/theme';

/** Lightweight rating-history sparkline (react-native-svg — Expo Go safe). */
export function Sparkline({
  points,
  width = 280,
  height = 64,
}: {
  points: { date: string; rating: number }[];
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return <View style={{ height }} />;

  const pad = 6;
  const values = points.map((p) => p.rating);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 0.2;

  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);

  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  const trendUp = last >= values[0];

  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={trendUp ? colors.up : colors.down} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={x(points.length - 1)} cy={y(last)} r={4} fill={trendUp ? colors.up : colors.down} />
    </Svg>
  );
}
