// Diagonal pinstripe pattern — ported from the Clariva brandbook. Used as a subtle overlay
// on the result-band and other dark forest surfaces. Keeps the stripe density constant per
// component instance by generating a unique pattern id from the given color.
interface Props {
  color?: string;
  opacity?: number;
  strokeWidth?: number;
}

export function DiagPattern({ color = '#C9A84C', opacity = 0.06, strokeWidth = 0.5 }: Props) {
  const id = `dp-${color.replace('#', '')}-${Math.round(opacity * 100)}`;
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id={id} width="20" height="20" patternUnits="userSpaceOnUse">
          <line x1="0" y1="20" x2="20" y2="0" stroke={color} strokeWidth={strokeWidth} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} opacity={opacity * 25} />
    </svg>
  );
}
