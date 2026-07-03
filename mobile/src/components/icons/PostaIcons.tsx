import React from 'react';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

export type PostaIconName =
  | 'camera'
  | 'package'
  | 'motorcycle'
  | 'chevronRight'
  | 'link'
  | 'unlink'
  | 'check'
  | 'checkCircle'
  | 'phone'
  | 'navigation'
  | 'store'
  | 'cart'
  | 'mapPin'
  | 'user'
  | 'logOut'
  | 'inbox'
  | 'scan'
  | 'live';

interface Props {
  name: PostaIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export default function PostaIcon({
  name,
  size = 20,
  color = '#EDE6D8',
  strokeWidth = 1.75,
}: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
  };

  switch (name) {
    case 'camera':
      return (
        <Svg {...common}>
          <Path
            d="M4 8h3l1.5-2h7L17 8h3a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2v-8a2 2 0 012-2z"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          <Circle cx={12} cy={13} r={3.25} stroke={color} strokeWidth={strokeWidth} />
        </Svg>
      );
    case 'scan':
      return (
        <Svg {...common}>
          <Path d="M4 7V5a1 1 0 011-1h2M4 17v2a1 1 0 001 1h2M16 4h2a1 1 0 011 1v2M20 16v2a1 1 0 01-1 1h-2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={7} y1={12} x2={17} y2={12} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );
    case 'package':
      return (
        <Svg {...common}>
          <Path d="M12 3l8 4.5v9L12 21 4 16.5v-9L12 3z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
          <Path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </Svg>
      );
    case 'motorcycle':
      return (
        <Svg {...common}>
          <Circle cx={6.5} cy={16.5} r={2.5} stroke={color} strokeWidth={strokeWidth} />
          <Circle cx={17.5} cy={16.5} r={2.5} stroke={color} strokeWidth={strokeWidth} />
          <Path
            d="M9 16.5h5M14 16.5l2.5-5 2-2.5h2.5M14 9.5l-2-2H9l-1.5 3"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'chevronRight':
      return (
        <Svg {...common}>
          <Polyline points="9 6 15 12 9 18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'link':
      return (
        <Svg {...common}>
          <Path d="M10 13a3.5 3.5 0 004.95 0l1.5-1.5a3.5 3.5 0 00-4.95-4.95L10.5 8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Path d="M14 11a3.5 3.5 0 00-4.95 0L7.55 12.5a3.5 3.5 0 004.95 4.95L13.5 16" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );
    case 'unlink':
      return (
        <Svg {...common}>
          <Path d="M9 15l-1.5 1.5M15 9l1.5-1.5M8 8l8 8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Path d="M10 13a3.5 3.5 0 004.95 0l1.5-1.5M14 11a3.5 3.5 0 00-4.95 0L7.55 12.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );
    case 'check':
      return (
        <Svg {...common}>
          <Polyline points="5 12 10 17 19 7" stroke={color} strokeWidth={strokeWidth + 0.25} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'checkCircle':
      return (
        <Svg {...common}>
          <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} />
          <Polyline points="8 12 11 15 16 9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'phone':
      return (
        <Svg {...common}>
          <Path
            d="M6.5 4h3l1.5 3.5-2 1.2a12 12 0 005.3 5.3l1.2-2 3.5 1.5v3a1.5 1.5 0 01-1.4 1.5 13 13 0 01-11-11A1.5 1.5 0 016.5 4z"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'navigation':
      return (
        <Svg {...common}>
          <Path d="M12 3l7 18-7-4-7 4 7-18z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </Svg>
      );
    case 'store':
      return (
        <Svg {...common}>
          <Path d="M4 10h16l-1.2 9H5.2L4 10z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
          <Path d="M6 10V7a2 2 0 012-2h8a2 2 0 012 2v3" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </Svg>
      );
    case 'cart':
      return (
        <Svg {...common}>
          <Circle cx={9} cy={19} r={1.25} fill={color} />
          <Circle cx={17} cy={19} r={1.25} fill={color} />
          <Path d="M3 5h2l2 11h10l2-8H7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'mapPin':
      return (
        <Svg {...common}>
          <Path d="M12 21s6-5.2 6-10a6 6 0 10-12 0c0 4.8 6 10 6 10z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
          <Circle cx={12} cy={11} r={2.25} stroke={color} strokeWidth={strokeWidth} />
        </Svg>
      );
    case 'user':
      return (
        <Svg {...common}>
          <Circle cx={12} cy={8} r={3.5} stroke={color} strokeWidth={strokeWidth} />
          <Path d="M5 20a7 7 0 0114 0" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );
    case 'logOut':
      return (
        <Svg {...common}>
          <Path d="M10 7V5a1 1 0 011-1h8v16h-8a1 1 0 01-1-1v-2" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
          <Polyline points="7 12 3 12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Polyline points="6 9 3 12 6 15" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'inbox':
      return (
        <Svg {...common}>
          <Rect x={3} y={5} width={18} height={14} rx={2} stroke={color} strokeWidth={strokeWidth} />
          <Path d="M3 10h5l2 3h4l2-3h5" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </Svg>
      );
    case 'live':
      return (
        <Svg {...common}>
          <Circle cx={12} cy={12} r={2.5} fill={color} />
          <Circle cx={12} cy={12} r={6} stroke={color} strokeWidth={strokeWidth} opacity={0.45} />
          <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} opacity={0.2} />
        </Svg>
      );
    default:
      return null;
  }
}
