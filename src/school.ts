/** Vicsek / boids fish school with spatial hashing. */

export const FISH_COUNT = 280;
export const TRAIL_LEN = 5;

/** Soft wall inset as a fraction of min(width, height). */
const WALL_MARGIN = 0.04;
const WALL_FORCE = 2.8;

/** Short-range hard separation radius (px). */
const SEPARATION_RADIUS = 14;

export type PhaseId = "chaos" | "swirling" | "aligned" | "vortex";

export type PresetId = "swarm" | "mill" | "chaos";

export interface SchoolParams {
  /** Neighbour perception radius (px). */
  range: number;
  /** Alignment weight. */
  align: number;
  /** Cohesion weight. */
  cohesion: number;
  /** Separation weight. */
  separation: number;
  /** Angular noise amplitude (radians). */
  noise: number;
  /** Preferred speed (px / frame @ 60fps baseline). */
  speed: number;
  /**
   * Tangential orbit bias around school centroid (0 = none).
   * Used by Mill preset so a vortex forms reliably.
   */
  orbit: number;
}

export interface Fish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Previous positions for motion trails (ring buffer). */
  trailX: Float32Array;
  trailY: Float32Array;
  trailI: number;
}

export interface FoodPellet {
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
}

export interface PointerState {
  x: number;
  y: number;
  active: boolean;
  /** True while primary button / touch is held (food mode). */
  holding: boolean;
}

export interface SchoolMetrics {
  order: number;
  vorticity: number;
  phase: PhaseId;
  phaseLabel: string;
}

export const PRESETS: Record<
  PresetId,
  { label: string; hint: string; params: SchoolParams }
> = {
  swarm: {
    label: "Swarm",
    hint: "tight aligned school",
    params: {
      range: 55,
      align: 1.35,
      cohesion: 0.55,
      separation: 1.1,
      noise: 0.08,
      speed: 2.15,
      orbit: 0,
    },
  },
  mill: {
    label: "Mill / Vortex",
    hint: "rotating ring",
    params: {
      range: 68,
      align: 0.22,
      cohesion: 1.15,
      separation: 1.45,
      noise: 0.1,
      speed: 2.1,
      orbit: 1.55,
    },
  },
  chaos: {
    label: "Chaos",
    hint: "noise dominates",
    params: {
      range: 40,
      align: 0.25,
      cohesion: 0.15,
      separation: 0.9,
      noise: 1.35,
      speed: 2.3,
      orbit: 0,
    },
  },
};

const PHASE_LABELS: Record<PhaseId, string> = {
  chaos: "Chaos",
  swirling: "Swirling",
  aligned: "Aligned school",
  vortex: "Vortex",
};

export function phaseLabel(id: PhaseId): string {
  return PHASE_LABELS[id];
}

function hashCell(cx: number, cy: number, cols: number): number {
  return cy * cols + cx;
}

/**
 * Create fish already mid-motion in a loose milling ring so the page
 * loads alive — no blank / idle first frame.
 */
export function createSchool(width: number, height: number): Fish[] {
  const fish: Fish[] = [];
  const cx = width * 0.5;
  const cy = height * 0.5;
  const rx = Math.min(width, height) * 0.28;
  const ry = Math.min(width, height) * 0.22;

  for (let i = 0; i < FISH_COUNT; i += 1) {
    const t = (i / FISH_COUNT) * Math.PI * 2;
    const jitter = 0.65 + Math.random() * 0.55;
    const x = cx + Math.cos(t) * rx * jitter + (Math.random() - 0.5) * 40;
    const y = cy + Math.sin(t) * ry * jitter + (Math.random() - 0.5) * 40;
    // Tangential heading so a mill is already forming.
    const hx = -Math.sin(t);
    const hy = Math.cos(t);
    const speed = 1.6 + Math.random() * 0.8;
    const trailX = new Float32Array(TRAIL_LEN);
    const trailY = new Float32Array(TRAIL_LEN);
    trailX.fill(x);
    trailY.fill(y);
    fish.push({
      x,
      y,
      vx: hx * speed,
      vy: hy * speed,
      trailX,
      trailY,
      trailI: 0,
    });
  }
  return fish;
}

/** Explode the school outward — then watch it re-form. */
export function scatterSchool(fish: Fish[], width: number, height: number): void {
  const cx = width * 0.5;
  const cy = height * 0.5;
  for (const f of fish) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * Math.min(width, height) * 0.35;
    f.x = cx + Math.cos(angle) * dist;
    f.y = cy + Math.sin(angle) * dist;
    const burst = 4 + Math.random() * 6;
    f.vx = Math.cos(angle) * burst;
    f.vy = Math.sin(angle) * burst;
    f.trailX.fill(f.x);
    f.trailY.fill(f.y);
    f.trailI = 0;
  }
}

/** Snap velocities toward the mean heading so a mill collapses into a swarm. */
export function polarizeSchool(fish: Fish[], speed: number): void {
  let mx = 0;
  let my = 0;
  for (const f of fish) {
    mx += f.vx;
    my += f.vy;
  }
  const len = Math.hypot(mx, my);
  const hx = len > 1e-6 ? mx / len : 1;
  const hy = len > 1e-6 ? my / len : 0;
  for (const f of fish) {
    const jitter = (Math.random() - 0.5) * 0.35;
    const c = Math.cos(jitter);
    const s = Math.sin(jitter);
    const rx = hx * c - hy * s;
    const ry = hx * s + hy * c;
    f.vx = rx * speed;
    f.vy = ry * speed;
  }
}

/** Randomize headings — used when jumping to the Chaos preset. */
export function scrambleHeadings(fish: Fish[], speed: number): void {
  for (const f of fish) {
    const a = Math.random() * Math.PI * 2;
    f.vx = Math.cos(a) * speed;
    f.vy = Math.sin(a) * speed;
  }
}

export function createPlankton(count: number, width: number, height: number): {
  x: Float32Array;
  y: Float32Array;
  r: Float32Array;
  a: Float32Array;
} {
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const r = new Float32Array(count);
  const a = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    x[i] = Math.random() * width;
    y[i] = Math.random() * height;
    r[i] = 0.6 + Math.random() * 1.8;
    a[i] = 0.08 + Math.random() * 0.22;
  }
  return { x, y, r, a };
}

function pushTrail(f: Fish): void {
  const i = f.trailI % TRAIL_LEN;
  f.trailX[i] = f.x;
  f.trailY[i] = f.y;
  f.trailI += 1;
}

/**
 * One simulation step. `dtScale` normalizes to ~60fps (1 = 60fps frame).
 */
export function stepSchool(
  fish: Fish[],
  width: number,
  height: number,
  params: SchoolParams,
  pointer: PointerState,
  foods: FoodPellet[],
  shocks: Shockwave[],
  dtScale: number,
): SchoolMetrics {
  const n = fish.length;
  const cellSize = Math.max(24, params.range);
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const buckets = new Array<number[]>(cols * rows);
  for (let i = 0; i < buckets.length; i += 1) buckets[i] = [];

  for (let i = 0; i < n; i += 1) {
    const f = fish[i]!;
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(f.x / cellSize)));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(f.y / cellSize)));
    buckets[hashCell(cx, cy, cols)]!.push(i);
  }

  const nextVx = new Float32Array(n);
  const nextVy = new Float32Array(n);

  let sumCos = 0;
  let sumSin = 0;
  let cxSum = 0;
  let cySum = 0;

  for (let i = 0; i < n; i += 1) {
    const f = fish[i]!;
    cxSum += f.x;
    cySum += f.y;
  }
  const schoolCx = cxSum / n;
  const schoolCy = cySum / n;

  let angMom = 0;

  for (let i = 0; i < n; i += 1) {
    const f = fish[i]!;
    const cellX = Math.min(cols - 1, Math.max(0, Math.floor(f.x / cellSize)));
    const cellY = Math.min(rows - 1, Math.max(0, Math.floor(f.y / cellSize)));

    let alignX = 0;
    let alignY = 0;
    let cohX = 0;
    let cohY = 0;
    let sepX = 0;
    let sepY = 0;
    let neighbours = 0;
    let sepCount = 0;

    const range2 = params.range * params.range;
    const sep2 = SEPARATION_RADIUS * SEPARATION_RADIUS;

    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const nx = cellX + ox;
        const ny = cellY + oy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const bucket = buckets[hashCell(nx, ny, cols)]!;
        for (let b = 0; b < bucket.length; b += 1) {
          const j = bucket[b]!;
          if (j === i) continue;
          const o = fish[j]!;
          const dx = o.x - f.x;
          const dy = o.y - f.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > range2 || d2 < 1e-6) continue;
          neighbours += 1;
          alignX += o.vx;
          alignY += o.vy;
          cohX += dx;
          cohY += dy;
          if (d2 < sep2) {
            const d = Math.sqrt(d2);
            sepX -= dx / d;
            sepY -= dy / d;
            sepCount += 1;
          }
        }
      }
    }

    let steerX = 0;
    let steerY = 0;

    if (neighbours > 0) {
      alignX /= neighbours;
      alignY /= neighbours;
      cohX /= neighbours;
      cohY /= neighbours;
      steerX += alignX * params.align + cohX * params.cohesion;
      steerY += alignY * params.align + cohY * params.cohesion;
    }
    if (sepCount > 0) {
      steerX += (sepX / sepCount) * params.separation * 18;
      steerY += (sepY / sepCount) * params.separation * 18;
    }

    // Orbit bias around school centroid → vortex / mill.
    if (params.orbit > 0) {
      const dx = f.x - schoolCx;
      const dy = f.y - schoolCy;
      const dist = Math.hypot(dx, dy) + 1e-3;
      // Tangential unit vector (perpendicular to radial).
      const tx = -dy / dist;
      const ty = dx / dist;
      steerX += tx * params.orbit * 4.2;
      steerY += ty * params.orbit * 4.2;
      // Radial spring keeps a visible ring rather than a packed blob.
      const ideal = Math.min(width, height) * 0.26;
      const radial = (ideal - dist) * 0.028 * params.orbit;
      steerX += (dx / dist) * radial;
      steerY += (dy / dist) * radial;
    }

    // Predator: cursor hover (not holding) repels with a visible shock ring.
    if (pointer.active && !pointer.holding) {
      const dx = f.x - pointer.x;
      const dy = f.y - pointer.y;
      const d2 = dx * dx + dy * dy;
      const fearR = 130;
      if (d2 < fearR * fearR && d2 > 1) {
        const d = Math.sqrt(d2);
        const strength = (1 - d / fearR) * 7.5;
        steerX += (dx / d) * strength;
        steerY += (dy / d) * strength;
      }
    }

    // Food pellets attract.
    for (let fi = 0; fi < foods.length; fi += 1) {
      const food = foods[fi]!;
      const dx = food.x - f.x;
      const dy = food.y - f.y;
      const d2 = dx * dx + dy * dy;
      const attractR = 220;
      if (d2 < attractR * attractR && d2 > 4) {
        const d = Math.sqrt(d2);
        const strength = (1 - d / attractR) * 5.2 * (food.life / food.maxLife);
        steerX += (dx / d) * strength;
        steerY += (dy / d) * strength;
      }
    }

    // Soft walls.
    const margin = Math.min(width, height) * WALL_MARGIN;
    if (f.x < margin) steerX += WALL_FORCE;
    else if (f.x > width - margin) steerX -= WALL_FORCE;
    if (f.y < margin) steerY += WALL_FORCE;
    else if (f.y > height - margin) steerY -= WALL_FORCE;

    // Desired heading from current velocity + steer.
    let hx = f.vx + steerX * dtScale;
    let hy = f.vy + steerY * dtScale;
    const hLen = Math.hypot(hx, hy);
    if (hLen > 1e-6) {
      hx /= hLen;
      hy /= hLen;
    } else {
      hx = 1;
      hy = 0;
    }

    // Vicsek noise: rotate heading by uniform [-η, η].
    if (params.noise > 0) {
      const eta = (Math.random() * 2 - 1) * params.noise;
      const c = Math.cos(eta);
      const s = Math.sin(eta);
      const rx = hx * c - hy * s;
      const ry = hx * s + hy * c;
      hx = rx;
      hy = ry;
    }

    nextVx[i] = hx * params.speed * dtScale;
    nextVy[i] = hy * params.speed * dtScale;

    const heading = Math.atan2(hy, hx);
    sumCos += Math.cos(heading);
    sumSin += Math.sin(heading);
  }

  // Circulation uses residual velocities after removing bulk translation.
  let nextMeanVx = 0;
  let nextMeanVy = 0;
  for (let i = 0; i < n; i += 1) {
    nextMeanVx += nextVx[i]!;
    nextMeanVy += nextVy[i]!;
  }
  nextMeanVx /= n;
  nextMeanVy /= n;
  for (let i = 0; i < n; i += 1) {
    const f = fish[i]!;
    const rx = f.x - schoolCx;
    const ry = f.y - schoolCy;
    angMom += rx * (nextVy[i]! - nextMeanVy) - ry * (nextVx[i]! - nextMeanVx);
  }

  for (let i = 0; i < n; i += 1) {
    const f = fish[i]!;
    f.vx = nextVx[i]!;
    f.vy = nextVy[i]!;
    f.x += f.vx;
    f.y += f.vy;
    // Clamp soft inside bounds.
    if (f.x < 2) {
      f.x = 2;
      f.vx = Math.abs(f.vx);
    } else if (f.x > width - 2) {
      f.x = width - 2;
      f.vx = -Math.abs(f.vx);
    }
    if (f.y < 2) {
      f.y = 2;
      f.vy = Math.abs(f.vy);
    } else if (f.y > height - 2) {
      f.y = height - 2;
      f.vy = -Math.abs(f.vy);
    }
    pushTrail(f);
  }

  // Advance foods & shocks.
  for (let i = foods.length - 1; i >= 0; i -= 1) {
    const food = foods[i]!;
    food.life -= dtScale;
    if (food.life <= 0) foods.splice(i, 1);
  }
  for (let i = shocks.length - 1; i >= 0; i -= 1) {
    const s = shocks[i]!;
    s.life -= 0.045 * dtScale;
    s.radius += (s.maxRadius - s.radius) * 0.12 * dtScale + 2.2 * dtScale;
    if (s.life <= 0) shocks.splice(i, 1);
  }

  const order = Math.hypot(sumCos, sumSin) / n;
  const vorticity = Math.abs(angMom) / (n * params.speed * Math.min(width, height) * 0.25);
  const phase = classifyPhase(order, vorticity);
  return {
    order,
    vorticity,
    phase,
    phaseLabel: PHASE_LABELS[phase],
  };
}

function classifyPhase(order: number, vorticity: number): PhaseId {
  // Mill / vortex: circulating residual motion with only modest global order.
  if (vorticity > 0.48 && order < 0.55) return "vortex";
  if (order < 0.28) return "chaos";
  if (vorticity > 0.28 && order < 0.68) return "swirling";
  if (order > 0.62) return "aligned";
  return "swirling";
}

export function dropFood(
  foods: FoodPellet[],
  x: number,
  y: number,
): void {
  foods.push({
    x,
    y,
    life: 180,
    maxLife: 180,
  });
}

export function emitShock(
  shocks: Shockwave[],
  x: number,
  y: number,
): void {
  shocks.push({
    x,
    y,
    radius: 8,
    maxRadius: 140,
    life: 1,
  });
}
