import {
  TRAIL_LEN,
  type Fish,
  type FoodPellet,
  type PointerState,
  type Shockwave,
} from "./school";

export interface OceanPalette {
  deep: string;
  mid: string;
  shaft: string;
  plankton: string;
  fishBody: string;
  fishGlow: string;
  fishBelly: string;
  trail: string;
  predator: string;
  food: string;
  meterBg: string;
  meterFill: string;
  meterText: string;
}

export const OCEAN: OceanPalette = {
  deep: "#020b14",
  mid: "#041824",
  shaft: "rgba(120, 200, 220, 0.045)",
  plankton: "rgba(180, 230, 240,",
  fishBody: "#5eead4",
  fishGlow: "rgba(94, 234, 212, 0.55)",
  fishBelly: "#a7f3e8",
  trail: "rgba(94, 234, 212,",
  predator: "rgba(255, 120, 90,",
  food: "rgba(255, 210, 120,",
  meterBg: "rgba(8, 24, 36, 0.72)",
  meterFill: "#5eead4",
  meterText: "#d7f6f0",
};

export interface PlanktonField {
  x: Float32Array;
  y: Float32Array;
  r: Float32Array;
  a: Float32Array;
}

export function resizeCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
): { width: number; height: number; dpr: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(cssWidth));
  const height = Math.max(1, Math.floor(cssHeight));
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height, dpr };
}

function paintOcean(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  plankton: PlanktonField,
  palette: OceanPalette,
): void {
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, "#061a28");
  g.addColorStop(0.45, palette.mid);
  g.addColorStop(1, palette.deep);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  // Soft light shafts
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 5; i += 1) {
    const drift = Math.sin(time * 0.00018 + i * 1.3) * 40;
    const x = width * (0.12 + i * 0.18) + drift;
    const shaft = ctx.createLinearGradient(x, 0, x + 70, height);
    shaft.addColorStop(0, "rgba(160, 220, 240, 0.07)");
    shaft.addColorStop(0.45, palette.shaft);
    shaft.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shaft;
    ctx.beginPath();
    ctx.moveTo(x - 18, 0);
    ctx.lineTo(x + 55, 0);
    ctx.lineTo(x + 110, height);
    ctx.lineTo(x - 50, height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Plankton
  for (let i = 0; i < plankton.x.length; i += 1) {
    const px = (plankton.x[i]! + Math.sin(time * 0.0003 + i) * 6 + width) % width;
    const py = (plankton.y[i]! + Math.cos(time * 0.00022 + i * 0.7) * 4 + height) % height;
    ctx.beginPath();
    ctx.fillStyle = `${palette.plankton}${plankton.a[i]!})`;
    ctx.arc(px, py, plankton.r[i]!, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintFish(
  ctx: CanvasRenderingContext2D,
  fish: Fish[],
  palette: OceanPalette,
): void {
  for (let i = 0; i < fish.length; i += 1) {
    const f = fish[i]!;
    const speed = Math.hypot(f.vx, f.vy) + 1e-6;
    const ux = f.vx / speed;
    const uy = f.vy / speed;
    const px = -uy;
    const py = ux;

    // Trail
    ctx.strokeStyle = `${palette.trail}0.18)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const start = f.trailI;
    for (let t = 0; t < TRAIL_LEN; t += 1) {
      const idx = (start - 1 - t + TRAIL_LEN * 8) % TRAIL_LEN;
      const tx = f.trailX[idx]!;
      const ty = f.trailY[idx]!;
      if (t === 0) ctx.moveTo(tx, ty);
      else ctx.lineTo(tx, ty);
    }
    ctx.stroke();

    const len = 7.5;
    const half = 2.6;
    const noseX = f.x + ux * len;
    const noseY = f.y + uy * len;
    const tailX = f.x - ux * len * 0.95;
    const tailY = f.y - uy * len * 0.95;
    const leftX = f.x - ux * len * 0.2 + px * half;
    const leftY = f.y - uy * len * 0.2 + py * half;
    const rightX = f.x - ux * len * 0.2 - px * half;
    const rightY = f.y - uy * len * 0.2 - py * half;

    // Soft glow
    ctx.fillStyle = palette.fishGlow;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y, 6.5, 3.2, Math.atan2(uy, ux), 0, Math.PI * 2);
    ctx.fill();

    // Body
    const body = ctx.createLinearGradient(tailX, tailY, noseX, noseY);
    body.addColorStop(0, "rgba(40, 120, 130, 0.55)");
    body.addColorStop(0.45, palette.fishBody);
    body.addColorStop(1, palette.fishBelly);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(noseX, noseY);
    ctx.quadraticCurveTo(leftX, leftY, tailX, tailY);
    ctx.quadraticCurveTo(rightX, rightY, noseX, noseY);
    ctx.fill();
  }
}

function paintFoods(
  ctx: CanvasRenderingContext2D,
  foods: FoodPellet[],
  palette: OceanPalette,
): void {
  for (const food of foods) {
    const t = food.life / food.maxLife;
    const r = 4 + (1 - t) * 6;
    ctx.beginPath();
    ctx.fillStyle = `${palette.food}${0.15 + t * 0.55})`;
    ctx.arc(food.x, food.y, r + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = `${palette.food}${0.55 + t * 0.4})`;
    ctx.arc(food.x, food.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintShocks(
  ctx: CanvasRenderingContext2D,
  shocks: Shockwave[],
  pointer: PointerState,
  palette: OceanPalette,
): void {
  for (const s of shocks) {
    ctx.beginPath();
    ctx.strokeStyle = `${palette.predator}${Math.max(0, s.life * 0.55)})`;
    ctx.lineWidth = 2;
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (pointer.active && !pointer.holding) {
    ctx.beginPath();
    ctx.strokeStyle = `${palette.predator}0.35)`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.arc(pointer.x, pointer.y, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.fillStyle = `${palette.predator}0.18)`;
    ctx.arc(pointer.x, pointer.y, 10, 0, Math.PI * 2);
    ctx.fill();
  } else if (pointer.active && pointer.holding) {
    ctx.beginPath();
    ctx.fillStyle = `${palette.food}0.22)`;
    ctx.arc(pointer.x, pointer.y, 14, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function paintOrderMeter(
  ctx: CanvasRenderingContext2D,
  width: number,
  order: number,
  phaseLabel: string,
  palette: OceanPalette,
): void {
  const pad = 14;
  const meterW = Math.min(220, width - pad * 2);
  const meterH = 10;
  const x = pad;
  const y = pad;

  ctx.fillStyle = palette.meterBg;
  roundRect(ctx, x - 8, y - 8, meterW + 16, 48, 10);
  ctx.fill();

  ctx.fillStyle = "rgba(120, 170, 190, 0.35)";
  roundRect(ctx, x, y + 18, meterW, meterH, 5);
  ctx.fill();

  const fillW = Math.max(0, Math.min(1, order)) * meterW;
  const grad = ctx.createLinearGradient(x, 0, x + meterW, 0);
  grad.addColorStop(0, "#f97316");
  grad.addColorStop(0.45, "#fbbf24");
  grad.addColorStop(1, palette.meterFill);
  ctx.fillStyle = grad;
  roundRect(ctx, x, y + 18, fillW, meterH, 5);
  ctx.fill();

  ctx.fillStyle = palette.meterText;
  ctx.font = "600 11px Sora, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("Order", x, y - 2);
  ctx.font = "500 11px IBM Plex Mono, monospace";
  ctx.textAlign = "right";
  ctx.fillText(order.toFixed(2), x + meterW, y - 2);
  ctx.textAlign = "left";
  ctx.font = "500 12px Sora, sans-serif";
  ctx.fillStyle = "rgba(200, 235, 240, 0.9)";
  ctx.fillText(phaseLabel, x, y + 32);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function paintStage(
  canvas: HTMLCanvasElement,
  fish: Fish[],
  foods: FoodPellet[],
  shocks: Shockwave[],
  pointer: PointerState,
  plankton: PlanktonField,
  order: number,
  phaseLabelText: string,
  time: number,
  palette: OceanPalette = OCEAN,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  paintOcean(ctx, width, height, time, plankton, palette);
  paintFoods(ctx, foods, palette);
  paintFish(ctx, fish, palette);
  paintShocks(ctx, shocks, pointer, palette);
  paintOrderMeter(ctx, width, order, phaseLabelText, palette);
}
