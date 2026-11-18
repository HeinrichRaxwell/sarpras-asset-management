export default function SchoolIllustration() {
  return (
    <svg
      role="img"
      aria-hidden="true"
      className="h-auto w-full"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Ilustrasi kampus modern dengan bangunan utama, pohon, dan langit</title>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c7d2fe" />
          <stop offset="55%" stopColor="#e0e7ff" />
          <stop offset="100%" stopColor="#ccfbf1" />
        </linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#99f6e4" />
          <stop offset="100%" stopColor="#5eead4" />
        </linearGradient>
        <linearGradient id="bldg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <linearGradient id="bldgSide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a5b4fc" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
        <linearGradient id="tower" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id="tree1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
        <linearGradient id="tree2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
      </defs>

      {/* Sky */}
      <rect width="800" height="600" fill="url(#sky)" />

      {/* Sun glow */}
      <circle cx="665" cy="105" r="55" fill="#fde68a" opacity="0.55" />
      <circle cx="665" cy="105" r="34" fill="#fcd34d" opacity="0.85" />

      {/* Clouds */}
      <g fill="#ffffff" opacity="0.85">
        <ellipse cx="150" cy="110" rx="55" ry="22" />
        <ellipse cx="185" cy="95" rx="40" ry="26" />
        <ellipse cx="120" cy="100" rx="35" ry="20" />
        <rect x="95" y="110" width="120" height="20" rx="10" />
      </g>
      <g fill="#ffffff" opacity="0.7">
        <ellipse cx="500" cy="75" rx="45" ry="18" />
        <ellipse cx="530" cy="62" rx="32" ry="22" />
        <rect x="455" y="75" width="100" height="16" rx="8" />
      </g>
      <g fill="#ffffff" opacity="0.6">
        <ellipse cx="320" cy="170" rx="38" ry="14" />
        <ellipse cx="345" cy="160" rx="28" ry="18" />
        <rect x="285" y="170" width="90" height="12" rx="6" />
      </g>

      {/* Ground */}
      <rect y="470" width="800" height="130" fill="url(#ground)" />
      {/* Path / walkway */}
      <path d="M340 470 L300 600 L500 600 L460 470 Z" fill="#fed7aa" opacity="0.9" />
      <path d="M390 470 L385 600 M410 470 L415 600" stroke="#fdba74" strokeWidth="3" opacity="0.6" />

      {/* Main building - left wing */}
      <rect x="90" y="320" width="180" height="150" fill="url(#bldgSide)" rx="4" />
      <rect x="90" y="320" width="180" height="14" fill="#4f46e5" opacity="0.4" />
      {/* Left wing windows */}
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <rect
            key={`lw-${r}-${c}`}
            x={110 + c * 40}
            y={345 + r * 38}
            width="26"
            height="24"
            rx="3"
            fill="#e0e7ff"
            opacity="0.9"
          />
        ))
      )}

      {/* Main building - center tower */}
      <rect x="270" y="200" width="260" height="270" fill="url(#bldg)" rx="6" />
      {/* Roof */}
      <polygon points="260,200 540,200 510,170 290,170" fill="#4338ca" />
      <rect x="290" y="170" width="220" height="32" fill="#4f46e5" />

      {/* Dome / small tower on top */}
      <rect x="365" y="120" width="70" height="52" fill="url(#tower)" rx="4" />
      <path d="M365 122 Q400 82 435 122 Z" fill="#6d28d9" />
      <rect x="395" y="82" width="10" height="22" fill="#a78bfa" />
      <circle cx="400" cy="78" r="6" fill="#fbbf24" />
      {/* Dome windows */}
      <rect x="378" y="135" width="12" height="20" rx="2" fill="#ede9fe" opacity="0.9" />
      <rect x="394" y="135" width="12" height="20" rx="2" fill="#ede9fe" opacity="0.9" />
      <rect x="410" y="135" width="12" height="20" rx="2" fill="#ede9fe" opacity="0.9" />

      {/* Main building windows - 4 floors x 5 cols */}
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3, 4].map((c) => (
          <rect
            key={`mw-${r}-${c}`}
            x={292 + c * 46}
            y={230 + r * 55}
            width="30"
            height="38"
            rx="4"
            fill="#e0e7ff"
            opacity={r === 1 && c === 2 ? 1 : 0.88}
          />
        ))
      )}

      {/* Door */}
      <rect x="382" y="440" width="36" height="30" rx="4" fill="#312e81" />
      <rect x="385" y="443" width="14" height="27" rx="2" fill="#a5b4fc" />
      <rect x="401" y="443" width="14" height="27" rx="2" fill="#a5b4fc" />
      {/* Steps */}
      <rect x="372" y="470" width="56" height="6" fill="#c4b5fd" opacity="0.7" />
      <rect x="364" y="476" width="72" height="6" fill="#c4b5fd" opacity="0.5" />

      {/* Right wing */}
      <rect x="530" y="340" width="170" height="130" fill="url(#bldgSide)" rx="4" />
      <rect x="530" y="340" width="170" height="12" fill="#4f46e5" opacity="0.4" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => (
          <rect
            key={`rw-${r}-${c}`}
            x={550 + c * 38}
            y={365 + r * 34}
            width="24"
            height="22"
            rx="3"
            fill="#e0e7ff"
            opacity="0.9"
          />
        ))
      )}

      {/* Trees - left */}
      <g>
        <rect x="55" y="440" width="12" height="50" fill="#92400e" rx="2" />
        <circle cx="61" cy="420" r="38" fill="url(#tree1)" />
        <circle cx="45" cy="435" r="26" fill="#10b981" opacity="0.85" />
        <circle cx="78" cy="435" r="24" fill="#34d399" opacity="0.85" />
      </g>

      {/* Trees - right */}
      <g>
        <rect x="735" y="445" width="12" height="45" fill="#92400e" rx="2" />
        <circle cx="741" cy="425" r="35" fill="url(#tree2)" />
        <circle cx="725" cy="440" r="24" fill="#14b8a6" opacity="0.85" />
        <circle cx="758" cy="440" r="22" fill="#2dd4bf" opacity="0.85" />
      </g>

      {/* Small bushes */}
      <g fill="#6ee7b7" opacity="0.8">
        <ellipse cx="200" cy="478" rx="30" ry="14" />
        <ellipse cx="600" cy="478" rx="28" ry="12" />
        <ellipse cx="640" cy="482" rx="22" ry="10" />
      </g>

      {/* Foreground grass tufts */}
      <g stroke="#059669" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" fill="none">
        <path d="M100 590 l5 -14 M110 590 l0 -16 M120 590 l-5 -14" />
        <path d="M670 590 l5 -14 M680 590 l0 -16 M690 590 l-5 -14" />
        <path d="M300 585 l4 -12 M310 585 l0 -14 M320 585 l-4 -12" />
      </g>
    </svg>
  );
}
