"use client";
import { motion, useReducedMotion } from "motion/react";
import { type CSSProperties, type ReactNode, useRef } from "react";

/** Where each line starts on the left edge (y in a 1600 by 600 box). The right side mirrors it. */
const STARTS = [20, 110, 195, 270, 335, 400, 470, 545, 595];
const CX = 800;
const CY = 330;

function lineFor(y0: number): string {
  const endY = CY + (y0 - 310) * 0.045;
  return `M 0 ${y0} C 430 ${y0}, 560 ${endY}, ${CX} ${endY}`;
}

/* ---- Tile glyphs: small marks drawn for this page ---- */
const Glyph = {
  react: (
    <svg
      viewBox="-12 -12 24 24"
      className="size-[58%]"
      fill="none"
      stroke="#61dafb"
      strokeWidth="1.1"
      aria-hidden="true"
    >
      <ellipse rx="10" ry="4" />
      <ellipse rx="10" ry="4" transform="rotate(60)" />
      <ellipse rx="10" ry="4" transform="rotate(120)" />
      <circle r="1.7" fill="#61dafb" stroke="none" />
    </svg>
  ),
  next: <span className="text-[1.15em] font-extrabold tracking-tighter text-white">N</span>,
  gemini: (
    <svg viewBox="0 0 24 24" className="size-[56%]" aria-hidden="true">
      <defs>
        <linearGradient id="g-gem" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#4285f4" />
          <stop offset=".55" stopColor="#9b72ff" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <path
        fill="url(#g-gem)"
        d="M12 1.5c.7 5.6 4.9 9.8 10.5 10.5-5.6.7-9.8 4.9-10.5 10.5C11.3 16.9 7.1 12.7 1.5 12 7.1 11.3 11.3 7.1 12 1.5Z"
      />
    </svg>
  ),
  groq: <span className="text-[0.95em] font-extrabold tracking-tight text-white">groq</span>,
  mongo: (
    <svg viewBox="0 0 24 24" className="size-[52%]" aria-hidden="true">
      <path
        fill="#47a248"
        d="M12.4 1.5c.9 2.2 4.6 4.7 4.6 9.7 0 3.4-1.9 5.9-4 7l-.4 4.3h-.5l-.4-4.3c-2.1-1.1-4-3.6-4-7 0-5 3.7-7.5 4.7-9.7Z"
      />
      <path fill="#b8e0b4" d="M12.1 8.2v13.4h.4V8.2Z" />
    </svg>
  ),
  ts: <span className="text-[0.95em] font-extrabold tracking-tight text-white">TS</span>,
  vercel: (
    <svg viewBox="0 0 24 24" className="size-[46%]" aria-hidden="true">
      <path fill="#fff" d="M12 3 23 21H1L12 3Z" />
    </svg>
  ),
  mic: (
    <svg
      viewBox="0 0 24 24"
      className="size-[52%]"
      fill="none"
      stroke="#fff"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2.5" width="6" height="12" rx="3" />
      <path d="M5 11.5a7 7 0 0 0 14 0M12 18.5V22" />
    </svg>
  ),
};

interface Tile {
  glyph: ReactNode;
  bg: string;
  /** Position inside the 1600 by 600 box, in percent. */
  x: number;
  y: number;
  /** Size relative to the container width, in vw-ish units. */
  size: number;
  depth: number;
  delay: number;
  label: string;
  hideOnMobile?: boolean;
}

const TILES: Tile[] = [
  {
    glyph: Glyph.react,
    bg: "#0b1d2a",
    x: 10,
    y: 26,
    size: 4.7,
    depth: 22,
    delay: 0,
    label: "React",
  },
  {
    glyph: Glyph.next,
    bg: "#000",
    x: 33,
    y: 55,
    size: 3.7,
    depth: -14,
    delay: 1.2,
    label: "Next.js",
    hideOnMobile: true,
  },
  {
    glyph: Glyph.gemini,
    bg: "#fff",
    x: 21,
    y: 80,
    size: 4.3,
    depth: 30,
    delay: 2.1,
    label: "Gemini",
  },
  {
    glyph: Glyph.mongo,
    bg: "#10261a",
    x: 3.5,
    y: 62,
    size: 3.4,
    depth: -26,
    delay: 0.7,
    label: "MongoDB",
    hideOnMobile: true,
  },
  {
    glyph: Glyph.groq,
    bg: "#f55036",
    x: 90,
    y: 22,
    size: 4.6,
    depth: -24,
    delay: 0.4,
    label: "Groq",
  },
  {
    glyph: Glyph.ts,
    bg: "#3178c6",
    x: 66,
    y: 50,
    size: 3.6,
    depth: 16,
    delay: 1.7,
    label: "TypeScript",
    hideOnMobile: true,
  },
  {
    glyph: Glyph.vercel,
    bg: "#000",
    x: 78,
    y: 80,
    size: 4.4,
    depth: -30,
    delay: 2.6,
    label: "Vercel",
  },
  {
    glyph: Glyph.mic,
    bg: "linear-gradient(135deg,#a855f7,#6d4aff)",
    x: 96,
    y: 58,
    size: 3.2,
    depth: 24,
    delay: 1,
    label: "Voice",
    hideOnMobile: true,
  },
];

function CenterLogo() {
  return (
    <div className="hero-core absolute top-[55%] left-1/2 z-10 flex aspect-square w-[clamp(64px,7.4vw,120px)] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[26%] bg-gradient-to-br from-[#8b6bff] via-[#6d4aff] to-[#22b8d6] shadow-[0_24px_60px_-10px_var(--glow)]">
      <span className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.45),transparent_55%)]" />
      <svg viewBox="0 0 24 24" className="relative size-[55%]" fill="#fff" aria-hidden="true">
        <rect x="2" y="9" width="2.6" height="6" rx="1.3" />
        <rect x="6.6" y="5" width="2.6" height="14" rx="1.3" />
        <rect x="11.2" y="2" width="2.6" height="20" rx="1.3" />
        <rect x="15.8" y="6.5" width="2.6" height="11" rx="1.3" />
        <rect x="20.4" y="9.5" width="2.6" height="5" rx="1.3" />
      </svg>
    </div>
  );
}

export function HeroFan() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--px", (((event.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
    el.style.setProperty("--py", (((event.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
  };
  const onLeave = () => {
    ref.current?.style.setProperty("--px", "0");
    ref.current?.style.setProperty("--py", "0");
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      initial={reduce ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.4, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="hero-fan relative mx-auto aspect-[4/3] w-full max-w-[1600px] sm:aspect-[16/7] lg:aspect-[8/3]"
      style={{ "--px": 0, "--py": 0 } as CSSProperties}
    >
      <svg
        viewBox="0 0 1600 600"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="fan-line" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={CX} y2="0">
            <stop stopColor="var(--accent)" stopOpacity="0" />
            <stop offset=".45" stopColor="var(--accent)" stopOpacity=".8" />
            <stop offset="1" stopColor="var(--accent-2)" stopOpacity=".95" />
          </linearGradient>
          <linearGradient id="fan-beam" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={CX} y2="0">
            <stop stopColor="#fff" stopOpacity="0" />
            <stop offset=".6" stopColor="var(--accent-2)" />
            <stop offset="1" stopColor="#fff" />
          </linearGradient>
          <filter id="fan-glow" x="-10%" y="-30%" width="120%" height="160%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
        </defs>
        {[false, true].map((mirror) => (
          <g key={String(mirror)} transform={mirror ? "translate(1600 0) scale(-1 1)" : undefined}>
            {STARTS.map((y0, i) => (
              <g key={y0}>
                <path d={lineFor(y0)} stroke="url(#fan-line)" strokeWidth="1.6" />
                {/* the pulse that travels toward the center */}
                <path
                  d={lineFor(y0)}
                  pathLength={1}
                  className="fan-beam"
                  stroke="url(#fan-beam)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  filter="url(#fan-glow)"
                  style={{ animationDelay: `${(i * 0.55 + (mirror ? 0.7 : 0)) % 4.2}s` }}
                />
              </g>
            ))}
          </g>
        ))}
        <circle cx={CX} cy={CY} r="70" fill="var(--accent)" opacity=".16" filter="url(#fan-glow)" />
      </svg>

      {TILES.map((tile) => (
        <div
          key={tile.label}
          className={`hero-tile absolute z-10 ${tile.hideOnMobile ? "hidden sm:block" : ""}`}
          style={
            {
              left: `${tile.x}%`,
              top: `${tile.y}%`,
              width: `clamp(38px, ${tile.size}vw, ${tile.size * 18}px)`,
              "--depth": tile.depth,
              "--delay": `${tile.delay}s`,
            } as CSSProperties
          }
        >
          <div
            title={tile.label}
            role="img"
            aria-label={tile.label}
            className="hero-tile-inner flex aspect-square items-center justify-center rounded-[24%] text-[clamp(0.8rem,1.3vw,1.25rem)] shadow-[0_18px_40px_-14px_rgba(0,0,0,0.55)] ring-1 ring-white/15"
            style={{ background: tile.bg }}
          >
            {tile.glyph}
          </div>
        </div>
      ))}
      <CenterLogo />
    </motion.div>
  );
}
