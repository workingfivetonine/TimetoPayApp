import { Rect, Text as SvgText } from "react-native-svg";
import { useColors } from "@/hooks/useColors";

const LINE_H = 14;
const PAD_X = 10;
const PAD_Y = 8;
const CHAR_W = 6; // rough average glyph width at fontSize 10.5 — good enough for a bubble, not pixel-typeset text

export interface TooltipData {
  x: number;
  y: number;
  lines: string[];
  color?: string;
}

// The floating bubble a chart point shows on hover/tap. Pure presentation —
// callers own deciding WHEN it's visible and clamping x/y into the chart's own
// bounds; this only draws it and does the sizing math from the text it's given.
export function ChartTooltip({
  data,
  chartWidth,
  chartHeight,
}: {
  data: TooltipData;
  chartWidth: number;
  chartHeight: number;
}) {
  const colors = useColors();
  const { x, y, lines, color } = data;

  const longest = Math.max(...lines.map((l) => l.length), 1);
  const boxW = Math.min(chartWidth - 8, Math.max(60, longest * CHAR_W + PAD_X * 2 + (color ? 10 : 0)));
  const boxH = lines.length * LINE_H + PAD_Y * 2;

  // Prefer floating above the point; flip below when there's no room. Always
  // stay inside the chart horizontally rather than spilling past its edge —
  // the exact bug this whole tooltip exists next to fixing elsewhere.
  const boxY = y - boxH - 10 < 2 ? y + 10 : y - boxH - 10;
  const boxX = Math.min(Math.max(2, x - boxW / 2), chartWidth - boxW - 2);

  return (
    <>
      <Rect
        x={boxX}
        y={boxY}
        width={boxW}
        height={boxH}
        rx={7}
        fill={colors.foreground}
        opacity={0.92}
      />
      {color ? (
        <Rect x={boxX + PAD_X} y={boxY + PAD_Y + 3} width={7} height={7} rx={2} fill={color} />
      ) : null}
      {lines.map((line, i) => (
        <SvgText
          key={i}
          x={boxX + PAD_X + (color ? 10 : 0)}
          y={boxY + PAD_Y + (i + 1) * LINE_H - 3}
          fontSize={10.5}
          fontWeight={i === lines.length - 1 ? "700" : "400"}
          fill={colors.background}
        >
          {line}
        </SvgText>
      ))}
    </>
  );
}
