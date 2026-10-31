import React from 'react';

/**
 * The product mark: a route that bends once and arrives at a station.
 * "onDark" sits on the green sign slab, "onLight" on paper.
 */
export const BrandMark: React.FC<{ size?: number; variant?: 'onDark' | 'onLight'; className?: string }> = ({
  size = 40,
  variant = 'onLight',
  className,
}) => {
  const plate = variant === 'onDark' ? '#ffffff' : '#0b6439';
  const route = '#ffc72c';
  const station = variant === 'onDark' ? '#0b6439' : '#ffffff';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={className}
      role="img"
      aria-label="Smart Academic Advisor"
    >
      <rect x="0" y="0" width="40" height="40" rx="11" fill={plate} />
      <path
        d="M9 28.5 H17.5 L25.5 14 H31"
        fill="none"
        stroke={route}
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="28.5" r="3.3" fill={station} stroke={route} strokeWidth="2.2" />
      <circle cx="31" cy="14" r="4.6" fill={route} stroke={station} strokeWidth="2.4" />
    </svg>
  );
};
