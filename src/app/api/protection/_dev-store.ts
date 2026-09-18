// DEV-ONLY route store: single-process, non-durable, resets on restart.
// Never import from client components or product logic. No durability is
// promised; a real persistence layer replaces this in a later phase.
import { createDevStore, type TenaxDevStore } from "@/lib/tenax/dev-store";

export const routeDevStore: TenaxDevStore = createDevStore();
