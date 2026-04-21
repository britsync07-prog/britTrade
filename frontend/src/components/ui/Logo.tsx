import React from 'react';

interface LogoProps {
  className?: string;
  width?: number | string;
  height?: number | string;
}

export const Logo: React.FC<LogoProps> = ({ className, width = 220, height = 60 }) => {
  return (
    <div className={className}>
      <svg width={width} height={height} viewBox="0 0 220 60" xmlns="http://www.w3.org/2000/svg" fill="none">
        {/* Icon */}
        <g>
          <rect x="5" y="10" width="40" height="40" rx="8" fill="#0B2A4A"/>
          
          {/* Chart bars */}
          <rect x="12" y="30" width="4" height="12" fill="#FFFFFF"/>
          <rect x="20" y="25" width="4" height="17" fill="#FFFFFF"/>
          <rect x="28" y="20" width="4" height="22" fill="#FFFFFF"/>
          
          {/* Upward arrow */}
          <path d="M12 38 L30 20 L30 26 L38 18 L30 10 L30 16 L10 34 Z" fill="#E63946"/>
        </g>

        {/* Text */}
        <text x="55" y="38" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600">
          <tspan fill="#0B2A4A">Brit</tspan>
          <tspan fill="#E63946">Trade</tspan>
        </text>
      </svg>
    </div>
  );
};
