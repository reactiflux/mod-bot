interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
}

export function Sparkline({ data, width = 200, height = 40 }: SparklineProps) {
  const max = Math.max(...data, 1);
  const barWidth = width / data.length;
  const gap = 1;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      {data.map((value, i) => {
        const barHeight = (value / max) * height;
        return (
          <rect
            key={i}
            x={i * barWidth + gap / 2}
            y={height - barHeight}
            width={Math.max(barWidth - gap, 1)}
            height={barHeight || 0.5}
            className={value > 0 ? "fill-amber-500/80" : "fill-stone-700"}
            rx={1}
          />
        );
      })}
    </svg>
  );
}
