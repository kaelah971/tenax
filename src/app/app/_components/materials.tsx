import type { ReactNode } from "react";

export type MaterialRole =
  | "editorial"
  | "light-frost"
  | "clear-instrument"
  | "authority"
  | "critical";

export const OBSERVATORY_SCENE_ORDER = [
  "editorial",
  "observation",
  "authority",
  "control",
  "witness",
] as const;

const MATERIAL_CLASSES: Record<MaterialRole, string> = {
  editorial: "tx-material-editorial",
  "light-frost": "tx-material-light-frost",
  "clear-instrument": "tx-material-clear-instrument",
  authority: "tx-material-authority",
  critical: "tx-material-critical",
};

export function materialClass(role: MaterialRole): string {
  return MATERIAL_CLASSES[role];
}

type SurfaceProps = {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
};

function Surface({ role, children, className = "", as = "div" }: SurfaceProps & { role: MaterialRole }) {
  const Tag = as;
  return <Tag className={`${materialClass(role)} ${className}`.trim()}>{children}</Tag>;
}

export function EditorialField(props: SurfaceProps) {
  return <Surface {...props} role="editorial" />;
}

export function LightInstrument(props: SurfaceProps) {
  return <Surface {...props} role="light-frost" />;
}

export function ClearInstrument(props: SurfaceProps) {
  return <Surface {...props} role="clear-instrument" />;
}

export function AuthorityInstrument(props: SurfaceProps) {
  return <Surface {...props} role="authority" />;
}

export function CriticalAuthority(props: SurfaceProps) {
  return <Surface {...props} role="critical" />;
}

export function ControlDock({ children, className = "" }: Omit<SurfaceProps, "as">) {
  return <div className={`tx-control-dock ${className}`.trim()}>{children}</div>;
}

export function EvidenceStack({ children, className = "" }: Omit<SurfaceProps, "as">) {
  return <div className={`tx-evidence-stack ${className}`.trim()}>{children}</div>;
}

export function SceneAnchor({ children, className = "" }: Omit<SurfaceProps, "as">) {
  return <div className={`tx-scene-anchor ${className}`.trim()}>{children}</div>;
}
