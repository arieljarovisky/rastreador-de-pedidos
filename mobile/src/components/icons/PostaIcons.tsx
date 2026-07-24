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
  | 'live'
  | 'bell'
  | 'plus'
  | 'settings'
  | 'chevronUp'
  | 'chevronDown'
  | 'tag'
  | 'circle'
  | 'panel'
  | 'map'
  | 'building'
  | 'alert'
  | 'search'
  | 'sun'
  | 'moon';

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
    case 'bell':
      return (
        <Svg {...common}>
          <Path d="M6 17h12M10 17v1a2 2 0 004 0v-1" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Path d="M5 14.5V11a7 7 0 0114 0v3.5l1.5 2.5H3.5L5 14.5z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </Svg>
      );
    case 'plus':
      return (
        <Svg {...common}>
          <Line x1={12} y1={5} x2={12} y2={19} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={5} y1={12} x2={19} y2={12} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );
    case 'settings':
      return (
        <Svg {...common}>
          <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={strokeWidth} />
          <Path
            d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'chevronUp':
      return (
        <Svg {...common}>
          <Polyline points="6 14 12 8 18 14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'chevronDown':
      return (
        <Svg {...common}>
          <Polyline points="6 10 12 16 18 10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'tag':
      return (
        <Svg {...common}>
          <Path d="M4 12V5a1 1 0 011-1h7l8 8-7 7-8-8z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
          <Circle cx={8.5} cy={8.5} r={1.25} fill={color} />
        </Svg>
      );
    case 'circle':
      return (
        <Svg {...common}>
          <Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={strokeWidth} />
        </Svg>
      );
    case 'panel':
      return (
        <Svg {...common}>
          <Rect x={3} y={3} width={7} height={9} rx={1.5} stroke={color} strokeWidth={strokeWidth} />
          <Rect x={14} y={3} width={7} height={5} rx={1.5} stroke={color} strokeWidth={strokeWidth} />
          <Rect x={14} y={12} width={7} height={9} rx={1.5} stroke={color} strokeWidth={strokeWidth} />
          <Rect x={3} y={16} width={7} height={5} rx={1.5} stroke={color} strokeWidth={strokeWidth} />
        </Svg>
      );
    case 'map':
      return (
        <Svg {...common}>
          <Path
            d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          <Path d="M9 4v14M15 6v14" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </Svg>
      );
    case 'building':
      return (
        <Svg {...common}>
          <Path d="M3 21h18M4 21V8l8-5 8 5v13" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
          <Path d="M10 21v-6h4v6" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </Svg>
      );
    case 'alert':
      return (
        <Svg {...common}>
          <Path
            d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          <Path d="M12 9v5M12 18h.01" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );
    case 'search':
      return (
        <Svg {...common}>
          <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={strokeWidth} />
          <Path d="M20 20l-3.5-3.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );
    case 'sun':
      return (
        <Svg {...common}>
          <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={strokeWidth} />
          <Path
            d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'moon':
      return (
        <Svg {...common}>
          <Path
            d="M21 14.5A8.5 8.5 0 1110.5 3a7 7 0 0010.5 11.5z"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </Svg>
      );
    default:
      return null;
  }
}
