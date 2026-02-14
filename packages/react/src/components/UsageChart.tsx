import React, { useMemo } from 'react';
import { useKeyForgeContext } from '../context/KeyForgeContext';
import { useUsage, type TimeRange, type UsageDataPoint } from '../hooks/useUsage';

export interface UsageChartProps {
  keyId?: string;
}

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

function formatAxisLabel(timestamp: string, range: TimeRange): string {
  const d = new Date(timestamp);
  if (range === '24h') {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function abbreviateNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function UsageChart({ keyId }: UsageChartProps) {
  const { styles, theme } = useKeyForgeContext();
  const { usage, loading, error, timeRange, setTimeRange } = useUsage(keyId);

  const chartWidth = 600;
  const chartHeight = 220;
  const paddingLeft = 55;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 40;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  const { bars, yTicks, maxVal } = useMemo(() => {
    if (!usage.length) return { bars: [], yTicks: [] as number[], maxVal: 0 };

    const max = Math.max(...usage.map((d) => d.requests), 1);
    // Round up to nice number for y-axis
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
    const niceMax = Math.ceil(max / magnitude) * magnitude;

    const tickCount = 4;
    const ticks: number[] = [];
    for (let i = 0; i <= tickCount; i++) {
      ticks.push(Math.round((niceMax / tickCount) * i));
    }

    const barWidth = Math.max(2, Math.min(30, (innerWidth / usage.length) * 0.7));
    const gap = (innerWidth - barWidth * usage.length) / Math.max(usage.length - 1, 1);

    const barsData = usage.map((point, i) => {
      const height = niceMax > 0 ? (point.requests / niceMax) * innerHeight : 0;
      const x = paddingLeft + i * (barWidth + gap);
      const y = paddingTop + innerHeight - height;
      return { ...point, x, y, width: barWidth, height };
    });

    return { bars: barsData, yTicks: ticks, maxVal: niceMax };
  }, [usage, innerWidth, innerHeight]);

  return (
    <div>
      {/* Time range selector */}
      <div style={{ ...styles.flexBetween, marginBottom: '16px' }}>
        <span style={styles.subheading}>Requests over time</span>
        <div style={{ ...styles.flexRow, gap: '4px' }}>
          {TIME_RANGES.map((range) => (
            <button
              key={range.value}
              type="button"
              style={{
                ...styles.button,
                ...styles.buttonSmall,
                ...(timeRange === range.value
                  ? { backgroundColor: theme.colors.primary, color: '#fff' }
                  : { backgroundColor: 'transparent', color: theme.colors.textSecondary, border: `1px solid ${theme.colors.border}` }),
              }}
              onClick={() => setTimeRange(range.value)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {loading && usage.length === 0 ? (
        <div style={{ ...styles.emptyState, height: `${chartHeight}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={styles.spinner} />
        </div>
      ) : error ? (
        <div style={{ ...styles.emptyState, height: `${chartHeight}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: theme.colors.error }}>Failed to load usage data</span>
        </div>
      ) : usage.length === 0 ? (
        <div style={{ ...styles.emptyState, height: `${chartHeight}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span>No usage data available for this period</span>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            width="100%"
            style={{ maxWidth: `${chartWidth}px`, display: 'block' }}
            role="img"
            aria-label="Usage chart"
          >
            {/* Y-axis grid lines and labels */}
            {yTicks.map((tick) => {
              const y = paddingTop + innerHeight - (maxVal > 0 ? (tick / maxVal) * innerHeight : 0);
              return (
                <g key={tick}>
                  <line
                    x1={paddingLeft}
                    x2={chartWidth - paddingRight}
                    y1={y}
                    y2={y}
                    stroke={theme.colors.border}
                    strokeWidth={1}
                    strokeDasharray={tick === 0 ? undefined : '4,4'}
                  />
                  <text
                    x={paddingLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="11"
                    fill={theme.colors.textSecondary}
                    fontFamily={theme.fontFamily}
                  >
                    {abbreviateNumber(tick)}
                  </text>
                </g>
              );
            })}

            {/* Bars */}
            {bars.map((bar, i) => (
              <g key={bar.timestamp}>
                <rect
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={Math.max(bar.height, 0)}
                  rx={2}
                  fill={theme.colors.primary}
                  opacity={0.85}
                >
                  <title>
                    {formatAxisLabel(bar.timestamp, timeRange)}: {bar.requests.toLocaleString()} requests
                  </title>
                </rect>
                {/* X-axis labels (every nth label to avoid overcrowding) */}
                {shouldShowLabel(i, bars.length) && (
                  <text
                    x={bar.x + bar.width / 2}
                    y={chartHeight - 8}
                    textAnchor="middle"
                    fontSize="10"
                    fill={theme.colors.textSecondary}
                    fontFamily={theme.fontFamily}
                  >
                    {formatAxisLabel(bar.timestamp, timeRange)}
                  </text>
                )}
              </g>
            ))}
          </svg>

          {/* Summary row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              marginTop: '16px',
            }}
          >
            <SummaryCard
              label="Total Requests"
              value={usage.reduce((sum, d) => sum + d.requests, 0)}
              theme={theme}
              styles={styles}
            />
            <SummaryCard
              label="Peak"
              value={Math.max(...usage.map((d) => d.requests), 0)}
              theme={theme}
              styles={styles}
            />
            <SummaryCard
              label="Average"
              value={Math.round(usage.reduce((sum, d) => sum + d.requests, 0) / Math.max(usage.length, 1))}
              theme={theme}
              styles={styles}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function shouldShowLabel(index: number, total: number): boolean {
  if (total <= 10) return true;
  if (total <= 24) return index % 3 === 0;
  return index % Math.ceil(total / 8) === 0;
}

function SummaryCard({
  label,
  value,
  theme,
  styles,
}: {
  label: string;
  value: number;
  theme: { colors: { textSecondary: string; surface: string; border: string; text: string }; borderRadius: string };
  styles: ReturnType<typeof import('../styles/base').createStyles>;
}) {
  return (
    <div
      style={{
        ...styles.card,
        padding: '12px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '11px', color: theme.colors.textSecondary, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: theme.colors.text }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
