/**
 * Flat product illustrations, one per product id. They stand in for product
 * photos: swap this component for <img> cut-outs when real photography exists.
 */

const O = { deep: '#E86400', mid: '#FB7F22', soft: '#FF9B4F', pale: '#FFD0A8' };
const S = { deep: '#7FA08A', mid: '#A9C3B0', pale: '#D5E3D8' };
const B = { deep: '#4A5568', mid: '#7A8798', pale: '#C9D2DC' };
const C = { deep: '#B9A58C', mid: '#D9C7AB', pale: '#EFE3D0' };
const Y = { mid: '#9CC3E6', pale: '#CFE3F5' };

const Shadow = ({ rx = 64 }: { rx?: number }) => <ellipse cx="100" cy="132" rx={rx} ry="6" fill="#000" opacity=".07" />;

const dots = (x0: number, y0: number, cols: number, rows: number, gap: number, r: number, fill: string) =>
  Array.from({ length: cols * rows }, (_, i) => (
    <circle key={i} cx={x0 + (i % cols) * gap} cy={y0 + Math.floor(i / cols) * gap} r={r} fill={fill} />
  ));

const ART: Record<string, React.ReactNode> = {
  'travel-set': (
    <>
      <Shadow rx={72} />
      <path d="M149 27c11 0 15 7 15 15" stroke={B.deep} strokeWidth="4" fill="none" strokeLinecap="round" />
      <rect x="120" y="36" width="40" height="92" rx="14" fill={S.mid} />
      <rect x="120" y="74" width="40" height="26" fill={S.deep} opacity=".5" />
      <rect x="126" y="46" width="5" height="22" rx="2.5" fill="#fff" opacity=".5" />
      <rect x="129" y="20" width="22" height="19" rx="5" fill={B.deep} />
      <path d="M38 80h74l-7 14H45z" fill={O.soft} />
      <path d="M45 94h60l-6 13H51z" fill={O.mid} />
      <path d="M51 107h48l-4 15a6 6 0 0 1-6 4H61a6 6 0 0 1-6-4z" fill={O.soft} />
      <rect x="32" y="70" width="86" height="12" rx="6" fill={O.deep} />
    </>
  ),
  'slow-feeder': (
    <>
      <Shadow rx={60} />
      <circle cx="100" cy="76" r="56" fill={S.mid} />
      <circle cx="100" cy="76" r="46" fill={S.deep} />
      <g fill="none" stroke={S.pale} strokeWidth="8" strokeLinecap="round">
        <path d="M100 42c19 0 34 15 34 34" />
        <path d="M67 70c2-11 9-20 19-25" />
        <path d="M84 104c-9-5-15-14-17-24" />
        <path d="M100 60c9 0 16 7 16 16s-7 16-16 16" />
        <path d="M122 103c-6 4-13 7-21 7" />
      </g>
      <circle cx="100" cy="76" r="6" fill={S.pale} />
      <circle cx="84" cy="72" r="3" fill="#C98A4B" />
      <circle cx="127" cy="88" r="3" fill="#C98A4B" />
      <circle cx="96" cy="100" r="3" fill="#C98A4B" />
    </>
  ),
  'led-collar': (
    <>
      <Shadow rx={62} />
      <ellipse cx="100" cy="74" rx="58" ry="40" fill="none" stroke={O.soft} strokeWidth="22" opacity=".28" />
      <ellipse cx="100" cy="74" rx="58" ry="40" fill="none" stroke="#2A2A2A" strokeWidth="12" />
      <path d="M46 59.5a58 40 0 0 1 108 0" fill="none" stroke={O.mid} strokeWidth="5" strokeLinecap="round" />
      <rect x="85" y="105" width="30" height="18" rx="5" fill={B.deep} />
      <circle cx="100" cy="114" r="3" fill="#9CE0A8" />
    </>
  ),
  'lick-mat': (
    <>
      <Shadow rx={58} />
      <g transform="rotate(-8 100 74)">
        <rect x="48" y="24" width="104" height="100" rx="16" fill={O.soft} />
        <rect x="56" y="32" width="88" height="84" rx="10" fill="#FFB673" />
        {dots(68, 44, 6, 6, 12.8, 3.2, O.pale)}
      </g>
    </>
  ),
  'groom-glove': (
    <>
      <Shadow rx={46} />
      <g fill={B.mid}>
        <rect x="50" y="70" width="15" height="42" rx="7.5" transform="rotate(-38 57 91)" />
        <rect x="72" y="32" width="13" height="52" rx="6.5" />
        <rect x="88" y="22" width="13" height="60" rx="6.5" />
        <rect x="104" y="24" width="13" height="58" rx="6.5" />
        <rect x="120" y="34" width="13" height="50" rx="6.5" />
        <rect x="72" y="66" width="61" height="60" rx="14" />
      </g>
      {dots(83, 80, 4, 3, 13, 2.8, B.pale)}
      <rect x="72" y="113" width="61" height="15" rx="6" fill={B.deep} />
    </>
  ),
  'hair-roller': (
    <>
      <Shadow rx={56} />
      <g transform="rotate(-18 100 78)">
        <rect x="93" y="70" width="14" height="60" rx="7" fill={O.mid} />
        <rect x="87" y="68" width="26" height="10" rx="4" fill={B.deep} />
        <rect x="46" y="34" width="108" height="36" rx="18" fill={C.pale} />
        {[64, 78, 92, 106, 120, 134].map((x) => <rect key={x} x={x} y="34" width="4" height="36" fill={C.mid} />)}
        <rect x="42" y="40" width="12" height="24" rx="4" fill={B.deep} />
        <rect x="146" y="40" width="12" height="24" rx="4" fill={B.deep} />
      </g>
    </>
  ),
  'cooling-mat': (
    <>
      <Shadow rx={76} />
      <path d="M42 44h116a8 8 0 0 1 8 7l10 62a8 8 0 0 1-8 9H32a8 8 0 0 1-8-9l10-62a8 8 0 0 1 8-7z" fill={Y.pale} />
      <g fill="none" stroke={Y.mid} strokeWidth="2">
        <path d="M70 44l-12 78M100 44v78M130 44l12 78M31 70h138M27 96h146" />
      </g>
      <g fill={Y.mid}>
        <ellipse cx="100" cy="88" rx="11" ry="9" />
        <circle cx="86" cy="74" r="4.5" />
        <circle cx="95" cy="68" r="4.5" />
        <circle cx="105" cy="68" r="4.5" />
        <circle cx="114" cy="74" r="4.5" />
      </g>
    </>
  ),
  'cat-perch': (
    <>
      <rect x="40" y="14" width="120" height="114" rx="6" fill="#EEF3F8" stroke={B.pale} strokeWidth="3" />
      <path d="M100 14v114" stroke={B.pale} strokeWidth="3" />
      <path d="M62 50l-8 46M138 50l8 46" stroke={B.deep} strokeWidth="2.5" />
      <circle cx="62" cy="50" r="6.5" fill={B.deep} />
      <circle cx="138" cy="50" r="6.5" fill={B.deep} />
      <path d="M46 92h108a6 6 0 0 1 6 6c0 13-25 21-60 21s-60-8-60-21a6 6 0 0 1 6-6z" fill={O.soft} />
      <path d="M46 92h108" stroke={O.deep} strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  'dog-bed': (
    <>
      <Shadow rx={80} />
      <ellipse cx="100" cy="88" rx="78" ry="38" fill={C.deep} />
      <ellipse cx="100" cy="80" rx="78" ry="36" fill={C.mid} />
      <ellipse cx="100" cy="86" rx="54" ry="21" fill={C.pale} />
      <path d="M58 82c14-9 70-9 84 0" stroke={C.mid} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  ),
  /* ── Kitchen ── */
  'herb-keeper': (
    <>
      <Shadow rx={40} />
      <path d="M78 52h44v66a10 10 0 0 1-10 10H88a10 10 0 0 1-10-10z" fill={Y.pale} opacity=".7" />
      <rect x="78" y="100" width="44" height="18" fill={Y.mid} opacity=".55" />
      <path d="M100 100V38M100 70c-10-4-16-14-16-24M100 58c10-3 15-12 15-22M100 84c-9-2-14-8-15-15M100 80c8-1 13-7 14-13" stroke={S.deep} strokeWidth="3" fill="none" strokeLinecap="round" />
      <g fill={S.mid}>
        <ellipse cx="84" cy="44" rx="7" ry="4.5" transform="rotate(-50 84 44)" />
        <ellipse cx="115" cy="34" rx="7" ry="4.5" transform="rotate(40 115 34)" />
        <ellipse cx="85" cy="68" rx="6" ry="4" transform="rotate(-30 85 68)" />
        <ellipse cx="114" cy="66" rx="6" ry="4" transform="rotate(30 114 66)" />
        <ellipse cx="100" cy="34" rx="5" ry="7" />
      </g>
      <rect x="74" y="46" width="52" height="10" rx="5" fill={B.deep} />
      <path d="M78 52v66a10 10 0 0 0 10 10h24a10 10 0 0 0 10-10V52" fill="none" stroke={B.pale} strokeWidth="2.5" />
    </>
  ),
  'silicone-lids': (
    <>
      <Shadow rx={70} />
      <path d="M30 86h70l-6 34a8 8 0 0 1-8 6H44a8 8 0 0 1-8-6z" fill={C.mid} />
      <ellipse cx="65" cy="86" rx="38" ry="9" fill={O.soft} />
      <ellipse cx="65" cy="86" rx="28" ry="5.5" fill={O.mid} opacity=".6" />
      <g transform="translate(118 50)">
        <ellipse cx="30" cy="62" rx="32" ry="8" fill={S.deep} />
        <ellipse cx="30" cy="54" rx="28" ry="7" fill={S.mid} />
        <ellipse cx="30" cy="47" rx="24" ry="6" fill={O.pale} />
        <ellipse cx="30" cy="41" rx="20" ry="5" fill={Y.mid} />
        <ellipse cx="30" cy="36" rx="16" ry="4" fill={O.soft} />
      </g>
    </>
  ),
  'spice-jars': (
    <>
      <Shadow rx={76} />
      {[[30, O.mid], [70, '#B5653A'], [110, S.deep], [150, C.mid]].map(([x, fill]) => (
        <g key={x as number}>
          <rect x={x as number} y="56" width="30" height="66" rx="6" fill="#F1F4F7" stroke={B.pale} strokeWidth="2" />
          <rect x={(x as number) + 3} y="80" width="24" height="39" rx="4" fill={fill as string} />
          <rect x={x as number} y="46" width="30" height="13" rx="4" fill={B.mid} />
          <rect x={(x as number) + 5} y="64" width="20" height="9" rx="2" fill="#fff" />
        </g>
      ))}
    </>
  ),
  'oil-sprayer': (
    <>
      <Shadow rx={34} />
      <rect x="78" y="52" width="44" height="76" rx="12" fill="#EEF3F8" stroke={B.pale} strokeWidth="2.5" />
      <rect x="81" y="84" width="38" height="41" rx="9" fill="#F2C14E" opacity=".85" />
      <rect x="90" y="36" width="20" height="18" rx="4" fill={B.deep} />
      <rect x="86" y="26" width="28" height="12" rx="5" fill="#2A2A2A" />
      <rect x="112" y="29" width="10" height="5" rx="2" fill="#2A2A2A" />
      {dots(132, 22, 3, 3, 8, 2, Y.mid)}
      <rect x="85" y="58" width="5" height="22" rx="2.5" fill="#fff" opacity=".7" />
    </>
  ),
  'mixing-bowls': (
    <>
      <Shadow rx={78} />
      <path d="M22 64h156c0 34-35 62-78 62S22 98 22 64z" fill={B.pale} />
      <path d="M40 62h120c0 26-27 48-60 48S40 88 40 62z" fill="#DCE3EA" />
      <path d="M58 60h84c0 18-19 34-42 34S58 78 58 60z" fill="#EEF2F6" />
      <ellipse cx="100" cy="62" rx="78" ry="8" fill="none" stroke={B.mid} strokeWidth="3" />
      <ellipse cx="100" cy="30" rx="44" ry="8" fill={O.soft} />
      <rect x="92" y="18" width="16" height="9" rx="4" fill={O.deep} />
    </>
  ),
  'bag-clips': (
    <>
      <Shadow rx={70} />
      <path d="M58 30h64l6 98H52z" fill={C.pale} />
      <path d="M58 30h64l1 18H57z" fill={C.mid} />
      <rect x="46" y="44" width="88" height="14" rx="7" fill={O.mid} />
      <rect x="126" y="47" width="14" height="8" rx="3" fill={O.deep} />
      <g transform="rotate(-12 150 100)">
        <rect x="128" y="88" width="58" height="12" rx="6" fill={S.mid} />
        <rect x="128" y="102" width="58" height="12" rx="6" fill={S.deep} />
      </g>
      <g transform="rotate(10 40 112)">
        <rect x="14" y="104" width="52" height="11" rx="5.5" fill={Y.mid} />
      </g>
    </>
  ),

  /* ── Home fitness ── */
  'resistance-bands': (
    <>
      <Shadow rx={72} />
      <ellipse cx="76" cy="80" rx="46" ry="32" fill="none" stroke={O.pale} strokeWidth="14" />
      <ellipse cx="112" cy="72" rx="46" ry="32" fill="none" stroke={O.soft} strokeWidth="14" />
      <ellipse cx="100" cy="92" rx="46" ry="30" fill="none" stroke={O.deep} strokeWidth="14" />
    </>
  ),
  'jump-rope': (
    <>
      <Shadow rx={70} />
      <path d="M50 46c-6 60 20 82 50 82s56-22 50-82" fill="none" stroke={B.deep} strokeWidth="5" strokeLinecap="round" />
      <g transform="rotate(-14 50 34)">
        <rect x="41" y="10" width="18" height="44" rx="9" fill={O.mid} />
        <rect x="41" y="10" width="18" height="12" rx="6" fill={O.deep} />
      </g>
      <g transform="rotate(14 150 34)">
        <rect x="141" y="10" width="18" height="44" rx="9" fill={O.mid} />
        <rect x="141" y="10" width="18" height="12" rx="6" fill={O.deep} />
      </g>
    </>
  ),
  'ab-wheel': (
    <>
      <Shadow rx={74} />
      <rect x="24" y="108" width="70" height="16" rx="8" fill={S.mid} />
      <rect x="40" y="62" width="120" height="10" rx="5" fill={B.mid} />
      <rect x="28" y="58" width="26" height="18" rx="9" fill={B.deep} />
      <rect x="146" y="58" width="26" height="18" rx="9" fill={B.deep} />
      <circle cx="88" cy="74" r="38" fill="#2A2A2A" />
      <circle cx="88" cy="74" r="28" fill={O.mid} />
      <circle cx="112" cy="74" r="38" fill="#2A2A2A" opacity=".85" />
      <circle cx="112" cy="74" r="28" fill={O.soft} />
      <circle cx="112" cy="74" r="8" fill={B.pale} />
    </>
  ),
  'foam-roller': (
    <>
      <Shadow rx={80} />
      <rect x="34" y="50" width="132" height="62" rx="12" fill={Y.mid} />
      {[50, 68, 86, 104, 122, 140].map((x) => <rect key={x} x={x} y="50" width="8" height="62" fill={Y.pale} opacity=".7" />)}
      <ellipse cx="166" cy="81" rx="14" ry="31" fill="#7FAFD8" />
      <ellipse cx="166" cy="81" rx="6" ry="14" fill="#EEF3F8" />
    </>
  ),
  'yoga-mat': (
    <>
      <Shadow rx={66} />
      <rect x="44" y="52" width="104" height="64" rx="4" fill={S.mid} />
      <ellipse cx="148" cy="84" rx="16" ry="32" fill={S.deep} />
      <path d="M148 64a10 20 0 1 1 0 40a6 12 0 1 1 0-24" fill="none" stroke={S.pale} strokeWidth="3" />
      <ellipse cx="44" cy="84" rx="16" ry="32" fill={S.deep} />
      <path d="M44 64a10 20 0 1 1 0 40a6 12 0 1 1 0-24" fill="none" stroke={S.pale} strokeWidth="3" />
      <rect x="78" y="48" width="12" height="72" rx="2" fill={B.deep} />
      <rect x="104" y="48" width="12" height="72" rx="2" fill={B.deep} />
    </>
  ),
  'grip-trainer': (
    <>
      <Shadow rx={52} />
      <path d="M100 30c-14 0-20 14-34 70M100 30c14 0 20 14 34 70" fill="none" stroke={B.mid} strokeWidth="4" />
      <circle cx="100" cy="34" r="12" fill="none" stroke={B.deep} strokeWidth="5" />
      <rect x="46" y="76" width="26" height="54" rx="13" fill={O.mid} transform="rotate(14 59 103)" />
      <rect x="128" y="76" width="26" height="54" rx="13" fill={O.mid} transform="rotate(-14 141 103)" />
      <rect x="92" y="58" width="16" height="12" rx="4" fill={B.deep} />
    </>
  ),

  /* ── Phone accessories ── */
  'cable-organiser': (
    <>
      <Shadow rx={74} />
      <path d="M48 66c0-22 12-34 30-40M80 66c0-18 10-30 26-36M112 66c0-16 8-28 22-34M144 66c0-14 6-24 18-30" fill="none" stroke={B.mid} strokeWidth="5" strokeLinecap="round" />
      <rect x="28" y="84" width="144" height="20" rx="10" fill={B.deep} />
      {[48, 80, 112, 144].map((x, i) => (
        <g key={x}>
          <circle cx={x} cy="78" r="12" fill={[O.mid, S.mid, Y.mid, O.soft][i]} />
          <rect x={x - 3} y="58" width="6" height="14" rx="3" fill="#2A2A2A" />
        </g>
      ))}
    </>
  ),
  'phone-stand': (
    <>
      <Shadow rx={58} />
      <path d="M52 124h96l-8-10H60z" fill={B.mid} />
      <path d="M96 116l20-56" stroke={B.mid} strokeWidth="8" strokeLinecap="round" />
      <g transform="rotate(-16 96 70)">
        <rect x="70" y="16" width="56" height="100" rx="10" fill="#2A2A2A" />
        <rect x="74" y="22" width="48" height="88" rx="6" fill={Y.pale} />
        <rect x="80" y="32" width="36" height="20" rx="4" fill={O.soft} />
        <rect x="80" y="58" width="36" height="6" rx="3" fill="#fff" />
        <rect x="80" y="70" width="26" height="6" rx="3" fill="#fff" />
      </g>
    </>
  ),
  'phone-wallet': (
    <>
      <Shadow rx={48} />
      <rect x="62" y="14" width="76" height="118" rx="14" fill={B.pale} />
      <circle cx="80" cy="34" r="8" fill={B.mid} />
      <circle cx="80" cy="52" r="8" fill={B.mid} />
      <rect x="72" y="66" width="56" height="54" rx="8" fill={O.mid} />
      <rect x="78" y="58" width="44" height="22" rx="3" fill={Y.mid} />
      <rect x="72" y="74" width="56" height="46" rx="8" fill={O.soft} />
      <circle cx="100" cy="97" r="13" fill="none" stroke={O.deep} strokeWidth="2.5" opacity=".6" />
    </>
  ),
  'cleaning-kit': (
    <>
      <Shadow rx={72} />
      <g transform="rotate(-24 70 76)">
        <rect x="34" y="70" width="80" height="12" rx="6" fill={B.pale} />
        <rect x="104" y="70" width="18" height="12" rx="3" fill={O.mid} />
        <rect x="22" y="72" width="14" height="8" rx="2" fill={B.deep} />
      </g>
      <ellipse cx="128" cy="112" rx="26" ry="14" fill={Y.mid} />
      <ellipse cx="128" cy="106" rx="20" ry="9" fill={Y.pale} />
      <g transform="translate(130 22)">
        <circle cx="18" cy="22" r="16" fill="#F4F4F4" stroke={B.pale} strokeWidth="2" />
        <rect x="14" y="34" width="9" height="30" rx="4.5" fill="#F4F4F4" stroke={B.pale} strokeWidth="2" />
        <circle cx="18" cy="22" r="6" fill={B.mid} />
      </g>
    </>
  ),
  'charging-stand': (
    <>
      <Shadow rx={74} />
      <path d="M40 124h120l-6-12H46z" fill="#2A2A2A" />
      <rect x="92" y="24" width="16" height="92" rx="6" fill={B.deep} />
      <rect x="74" y="14" width="52" height="86" rx="10" fill="#2A2A2A" />
      <rect x="78" y="19" width="44" height="76" rx="6" fill={Y.pale} />
      <circle cx="100" cy="57" r="12" fill="none" stroke={O.mid} strokeWidth="3" />
      <rect x="36" y="78" width="26" height="34" rx="9" fill="#2A2A2A" />
      <rect x="40" y="83" width="18" height="24" rx="5" fill={S.mid} />
      <ellipse cx="148" cy="108" rx="16" ry="6" fill={B.mid} />
      <circle cx="142" cy="100" r="7" fill="#F4F4F4" />
      <circle cx="155" cy="100" r="7" fill="#F4F4F4" />
    </>
  ),
  'ring-light': (
    <>
      <Shadow rx={44} />
      <rect x="66" y="12" width="68" height="120" rx="12" fill="#2A2A2A" />
      <rect x="71" y="18" width="58" height="108" rx="8" fill={Y.pale} />
      <circle cx="100" cy="32" r="26" fill="none" stroke="#FFF6E0" strokeWidth="12" />
      <circle cx="100" cy="32" r="26" fill="none" stroke={O.pale} strokeWidth="3" />
      <rect x="92" y="54" width="16" height="12" rx="3" fill={B.deep} />
    </>
  ),
};

export function ProductArt({ id, className }: { id: string; className?: string }) {
  return (
    <svg viewBox="0 0 200 150" className={className} role="img" aria-hidden="true">
      {ART[id]}
    </svg>
  );
}
