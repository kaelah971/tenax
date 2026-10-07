// Landing hero figure: the existing Tenax mascot asset holding two product
// screens — Event Intelligence in its left hand, the Final Tenax Decision in
// its right. The asset is used unaltered; physical overlap comes from
// re-drawing only the finger regions of the same image above the phones
// (clip-path polygons traced in asset pixels), so the hands genuinely grip
// the devices. Screens are the same fixture-driven, labelled-illustrative
// mockups used elsewhere on the page. Server-rendered, zero client JS.
import Image from "next/image";

import { DecisionScreen, EventScreen, Phone, SignalTraces, type DeviceData } from "./devices";

export const MASCOT_ASSET = "/brand/tenax-agent.png";

const ASSET_PX = 1254;

type Pt = readonly [number, number];

/** Fingers of the palm-up hand (viewer's right), in asset pixels. */
const RIGHT_FINGERS: readonly Pt[] = [
  [901, 860], [905, 834], [915, 815], [930, 810], [942, 814], [948, 808], [955, 794], [961, 786],
  [968, 783], [977, 786], [982, 792], [984, 780], [992, 771], [1000, 771], [1008, 779], [1012, 776],
  [1020, 770], [1029, 769], [1038, 775], [1042, 787], [1040, 802], [1031, 824], [1020, 839],
  [1006, 850], [992, 860], [960, 866], [925, 866],
];

/** Fingers of the gripping hand (viewer's left), in asset pixels. */
const LEFT_FINGERS: readonly Pt[] = [
  [455, 885], [477, 882], [500, 898], [518, 918], [528, 937], [528, 960], [515, 968], [500, 960],
  [507, 983], [505, 998], [487, 1008], [460, 1012], [437, 1005], [432, 987], [447, 960], [453, 923],
  [452, 897],
];

export function clipPolygon(points: readonly Pt[]): string {
  const pct = (v: number) => `${((v / ASSET_PX) * 100).toFixed(2)}%`;
  return `polygon(${points.map(([x, y]) => `${pct(x)} ${pct(y)}`).join(", ")})`;
}

const SIZES = "(min-width: 1280px) 620px, (min-width: 1024px) 50vw, 92vw";

function MascotLayer({ className, clip }: { className: string; clip?: string }) {
  return (
    <span className={className}>
      <Image
        src={MASCOT_ASSET}
        alt=""
        fill
        sizes={SIZES}
        loading="eager"
        fetchPriority="high"
        draggable={false}
        style={clip ? { clipPath: clip } : undefined}
      />
    </span>
  );
}

const LABEL =
  "The Tenax agent holding two illustrative product screens built from demo fixtures: Event Intelligence for NVIDIA earnings with an unverified date, and the Final Tenax Decision refusing an AI proposal that exceeds the mandate — no order sent.";

export default function MascotHero({ data }: { data: DeviceData }) {
  return (
    <div className="tx-device-stage" role="img" aria-label={LABEL}>
      <div className="tx-mascot-scene" aria-hidden="true">
        <SignalTraces />
        <span className="tx-mascot-aura" />
        <span className="tx-mascot-floor" />
        <MascotLayer className="tx-mascot-layer tx-mascot-base" />
        <span className="tx-mascot-spill tx-mascot-spill-l" />
        <span className="tx-mascot-spill tx-mascot-spill-r" />
        <div className="tx-held tx-held-l">
          <Phone className="tx-phone-held">
            <EventScreen data={data} />
          </Phone>
        </div>
        <div className="tx-held tx-held-r">
          <Phone className="tx-phone-held">
            <DecisionScreen data={data} compact />
          </Phone>
        </div>
        <MascotLayer className="tx-mascot-layer tx-mascot-hand" clip={clipPolygon(LEFT_FINGERS)} />
        <MascotLayer className="tx-mascot-layer tx-mascot-hand" clip={clipPolygon(RIGHT_FINGERS)} />
      </div>
    </div>
  );
}
