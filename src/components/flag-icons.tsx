import type { SVGProps } from "react";

export function FlagEu(props: SVGProps<SVGSVGElement>) {
  const stars = Array.from({ length: 12 }, (_, i) => {
    const angle = ((i * 30 - 90) * Math.PI) / 180;
    return {
      cx: 1.5 + 0.52 * Math.cos(angle),
      cy: 1 + 0.52 * Math.sin(angle),
    };
  });

  return (
    <svg viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect width="3" height="2" fill="#003399" />
      {stars.map((star, i) => (
        <circle key={i} cx={star.cx} cy={star.cy} r={0.085} fill="#FFCC00" />
      ))}
    </svg>
  );
}

export function FlagUnknown(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect width="3" height="2" fill="#64748b" />
      <circle cx="1.5" cy="1" r="0.55" fill="none" stroke="#e2e8f0" strokeWidth="0.12" />
      <ellipse
        cx="1.5"
        cy="1"
        rx="0.22"
        ry="0.55"
        fill="none"
        stroke="#e2e8f0"
        strokeWidth="0.1"
      />
      <line x1="0.95" y1="1" x2="2.05" y2="1" stroke="#e2e8f0" strokeWidth="0.1" />
    </svg>
  );
}
