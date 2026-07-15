export type ChartPoint = { date: string; value: number };
export type ChartSeries = { label: string; color: string; points: ChartPoint[] };

type VitalsChartProps = {
  series: ChartSeries[];
  unit: string;
};

const WIDTH = 600;
const HEIGHT = 180;
const PAD_LEFT = 42;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;

function formatAxisDate(time: number): string {
  return new Date(time).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function VitalsChart({ series, unit }: VitalsChartProps) {
  const allPoints = series.flatMap(s => s.points);

  if (allPoints.length === 0) {
    return <p className="vitals-chart-empty">No data recorded</p>;
  }

  const times = allPoints.map(p => new Date(p.date).getTime());
  const values = allPoints.map(p => p.value);

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const rawMinValue = Math.min(...values);
  const rawMaxValue = Math.max(...values);
  const valuePad = (rawMaxValue - rawMinValue) * 0.15 || Math.abs(rawMaxValue) * 0.1 || 1;
  const minValue = rawMinValue - valuePad;
  const maxValue = rawMaxValue + valuePad;

  const x = (t: number) =>
    PAD_LEFT +
    (maxTime === minTime ? 0.5 : (t - minTime) / (maxTime - minTime)) *
      (WIDTH - PAD_LEFT - PAD_RIGHT);

  const y = (v: number) =>
    HEIGHT -
    PAD_BOTTOM -
    ((v - minValue) / (maxValue - minValue)) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  return (
    <div className="vitals-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="vitals-chart-svg" role="img">
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP}
          x2={PAD_LEFT}
          y2={HEIGHT - PAD_BOTTOM}
          className="vitals-chart-axis"
        />
        <line
          x1={PAD_LEFT}
          y1={HEIGHT - PAD_BOTTOM}
          x2={WIDTH - PAD_RIGHT}
          y2={HEIGHT - PAD_BOTTOM}
          className="vitals-chart-axis"
        />

        <text x={PAD_LEFT - 6} y={y(rawMaxValue) + 4} textAnchor="end" className="vitals-chart-label">
          {Math.round(rawMaxValue * 10) / 10}
        </text>
        <text x={PAD_LEFT - 6} y={y(rawMinValue) + 4} textAnchor="end" className="vitals-chart-label">
          {Math.round(rawMinValue * 10) / 10}
        </text>

        <text x={PAD_LEFT} y={HEIGHT - 6} textAnchor="start" className="vitals-chart-label">
          {formatAxisDate(minTime)}
        </text>
        <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 6} textAnchor="end" className="vitals-chart-label">
          {formatAxisDate(maxTime)}
        </text>

        {series.map(s => {
          const sorted = [...s.points].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          );
          const linePoints = sorted
            .map(p => `${x(new Date(p.date).getTime())},${y(p.value)}`)
            .join(" ");

          return (
            <g key={s.label}>
              <polyline points={linePoints} fill="none" stroke={s.color} strokeWidth={2} />
              {sorted.map(p => (
                <circle
                  key={p.date}
                  cx={x(new Date(p.date).getTime())}
                  cy={y(p.value)}
                  r={3}
                  fill={s.color}
                >
                  <title>{`${formatAxisDate(new Date(p.date).getTime())}: ${
                    Math.round(p.value * 10) / 10
                  } ${unit}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      {series.length > 1 && (
        <div className="vitals-chart-legend">
          {series.map(s => (
            <span key={s.label} className="vitals-chart-legend-item">
              <span className="vitals-chart-legend-dot" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
