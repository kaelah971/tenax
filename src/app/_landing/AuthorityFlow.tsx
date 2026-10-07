// Atmospheric decision-network visual for the landing storytelling section.
// One path, six stages, and the authority seam: everything left of the
// mandate is proposal space (probabilistic, violet); everything right of it
// is authorized space (deterministic, teal). Decorative and aria-described;
// no data, no metrics.

const NODES = [
  { id: "event", label: "EVENT", x: 92, y: 318, tone: "neutral" },
  { id: "intent", label: "AI INTENT", x: 238, y: 206, tone: "ai" },
  { id: "mandate", label: "MANDATE", x: 400, y: 276, tone: "authority" },
  { id: "human", label: "HUMAN AUTHORITY", x: 548, y: 170, tone: "cyan" },
  { id: "executor", label: "EXECUTOR", x: 664, y: 278, tone: "neutral" },
  { id: "proof", label: "PROOF", x: 752, y: 168, tone: "authority" },
] as const;

const PATH =
  "M92 318 C150 318 170 206 238 206 S330 276 400 276 S480 170 548 170 S620 278 664 278 S720 168 752 168";

// Deterministic faint "lit" points scattered across the field (no randomness at render).
const LIT = [
  [140, 150], [300, 120], [330, 360], [470, 340], [610, 120], [700, 360], [190, 400], [560, 410], [430, 110], [760, 300],
] as const;

const TONE: Record<(typeof NODES)[number]["tone"], string> = {
  neutral: "#C3CEDC",
  ai: "#A397FF",
  authority: "#45E0CF",
  cyan: "#62D6FF",
};

export default function AuthorityFlow() {
  return (
    <svg
      viewBox="0 0 840 480"
      className="tx-flow h-full w-full"
      role="img"
      aria-label="Authority flow: an event becomes AI intent, the mandate decides whether it has authority, human authority approves where required, the executor acts, and proof records the outcome."
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern id="txf-dots" width="11" height="11" patternUnits="userSpaceOnUse">
          <circle cx="5.5" cy="5.5" r="1.25" fill="#9FB4CF" />
        </pattern>
        <radialGradient id="txf-soft" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.65" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="txf-mask">
          <rect width="840" height="480" fill="#000" />
          <ellipse cx="210" cy="250" rx="210" ry="170" fill="url(#txf-soft)" />
          <ellipse cx="470" cy="210" rx="240" ry="190" fill="url(#txf-soft)" />
          <ellipse cx="690" cy="270" rx="170" ry="160" fill="url(#txf-soft)" />
          <ellipse cx="380" cy="380" rx="160" ry="90" fill="url(#txf-soft)" />
        </mask>
        <linearGradient id="txf-path" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#C3CEDC" stopOpacity="0.35" />
          <stop offset="0.3" stopColor="#A397FF" stopOpacity="0.85" />
          <stop offset="0.48" stopColor="#45E0CF" />
          <stop offset="1" stopColor="#62D6FF" />
        </linearGradient>
        <linearGradient id="txf-proposal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#A397FF" stopOpacity="0" />
          <stop offset="1" stopColor="#A397FF" stopOpacity="0.07" />
        </linearGradient>
        <linearGradient id="txf-authorized" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#45E0CF" stopOpacity="0.08" />
          <stop offset="1" stopColor="#45E0CF" stopOpacity="0" />
        </linearGradient>
        <filter id="txf-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      <g mask="url(#txf-mask)">
        <rect x="0" y="0" width="400" height="480" fill="url(#txf-proposal)" />
        <rect x="400" y="0" width="440" height="480" fill="url(#txf-authorized)" />
        <rect width="840" height="480" fill="url(#txf-dots)" opacity="0.32" />
      </g>

      {LIT.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="7" fill="#45E0CF" opacity="0.18" filter="url(#txf-glow)" />
          <circle cx={x} cy={y} r="1.8" fill="#45E0CF" opacity="0.6" />
        </g>
      ))}

      <line x1="400" y1="52" x2="400" y2="430" stroke="#45E0CF" strokeOpacity="0.45" strokeDasharray="2 6" />
      <text x="388" y="66" textAnchor="end" className="tx-flow-zone" fill="#A397FF">
        PROPOSAL · PROBABILISTIC
      </text>
      <text x="412" y="66" className="tx-flow-zone" fill="#45E0CF">
        AUTHORITY · DETERMINISTIC
      </text>

      <path d={PATH} fill="none" stroke="url(#txf-path)" strokeWidth="1.5" strokeLinecap="round" opacity="0.75" />
      <path d={PATH} fill="none" stroke="url(#txf-path)" strokeWidth="2" strokeLinecap="round" className="tx-flow-pulse" />

      {NODES.map((node) => {
        const color = TONE[node.tone];
        const major = node.id === "mandate";
        const labelBelow = node.y > 240;
        return (
          <g key={node.id}>
            <circle cx={node.x} cy={node.y} r={major ? 22 : 14} fill={color} opacity="0.22" filter="url(#txf-glow)" />
            {major ? (
              <circle cx={node.x} cy={node.y} r="15" fill="none" stroke={color} strokeOpacity="0.55" />
            ) : null}
            <circle cx={node.x} cy={node.y} r={major ? 7 : 5} fill="#05070B" stroke={color} strokeWidth="2" />
            <circle cx={node.x} cy={node.y} r={major ? 3 : 2} fill={color} />
            <text
              x={node.x}
              y={labelBelow ? node.y + (major ? 40 : 30) : node.y - (major ? 30 : 22)}
              textAnchor="middle"
              className="tx-flow-label"
              fill={color}
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
