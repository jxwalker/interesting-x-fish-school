import "./styles.css";
import {
  PRESETS,
  createPlankton,
  createSchool,
  dropFood,
  emitShock,
  phaseLabel,
  polarizeSchool,
  scrambleHeadings,
  scatterSchool,
  stepSchool,
  type FoodPellet,
  type PointerState,
  type PresetId,
  type SchoolMetrics,
  type SchoolParams,
  type Shockwave,
} from "./school";
import {
  OCEAN,
  paintStage,
  resizeCanvas,
  type PlanktonField,
} from "./viz";

/** Throttle DOM readouts (~10 Hz) and only rewrite when text changes. */
const READOUT_INTERVAL_MS = 100;

/** Emit a predator shockwave at most this often while hovering. */
const SHOCK_INTERVAL_MS = 220;

/** Food drop interval while holding. */
const FOOD_HOLD_INTERVAL_MS = 280;

const NOISE_MIN = 0;
const NOISE_MAX = 1.8;
const RANGE_MIN = 20;
const RANGE_MAX = 110;

interface AppState {
  params: SchoolParams;
  preset: PresetId | "custom";
  width: number;
  height: number;
  order: number;
  phase: string;
}

function mustEl<T extends HTMLElement>(
  root: HTMLElement,
  selector: string,
  ctor: new () => T,
): T {
  const el = root.querySelector(selector);
  if (!(el instanceof ctor)) {
    throw new Error(`Missing or wrong element: ${selector}`);
  }
  return el;
}

function isRecordMode(): boolean {
  return new URLSearchParams(window.location.search).has("record");
}

function setTextIfChanged(el: HTMLElement, next: string): void {
  if (el.textContent !== next) el.textContent = next;
}

function formatNoise(n: number): string {
  return n.toFixed(2);
}

function formatRange(n: number): string {
  return `${Math.round(n)}px`;
}

function cloneParams(p: SchoolParams): SchoolParams {
  return { ...p };
}

function nearestPreset(params: SchoolParams): PresetId | "custom" {
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    const p = PRESETS[id].params;
    if (
      Math.abs(p.noise - params.noise) < 0.001 &&
      Math.abs(p.range - params.range) < 0.001 &&
      Math.abs(p.align - params.align) < 0.001 &&
      Math.abs(p.cohesion - params.cohesion) < 0.001 &&
      Math.abs(p.orbit - params.orbit) < 0.001
    ) {
      return id;
    }
  }
  return "custom";
}

function mount(): void {
  const appRoot = document.getElementById("app");
  if (!(appRoot instanceof HTMLElement)) {
    throw new Error("Missing #app");
  }
  const root = appRoot;
  const recordMode = isRecordMode();

  // Start slightly milling so the first seconds look alive, then settle to swarm.
  const boot = cloneParams(PRESETS.mill.params);
  boot.noise = 0.1;

  const state: AppState = {
    params: boot,
    preset: "mill",
    width: 800,
    height: 480,
    order: 0,
    phase: phaseLabel("swirling"),
  };

  const fish = createSchool(state.width, state.height);
  let plankton: PlanktonField = createPlankton(90, state.width, state.height);
  const foods: FoodPellet[] = [];
  const shocks: Shockwave[] = [];
  const pointer: PointerState = {
    x: 0,
    y: 0,
    active: false,
    holding: false,
  };

  const presetButtons = (Object.keys(PRESETS) as PresetId[])
    .map((id) => {
      const p = PRESETS[id];
      const active = id === "mill" ? " active" : "";
      const pressed = id === "mill" ? "true" : "false";
      return `
      <button
        type="button"
        class="preset${active}"
        id="preset-${id}"
        data-preset="${id}"
        aria-pressed="${pressed}"
      >
        <span class="preset-label">${p.label}</span>
        <span class="preset-hint">${p.hint}</span>
      </button>`;
    })
    .join("");

  root.innerHTML = `
    <div class="grain" aria-hidden="true"></div>
    <div class="caustics" aria-hidden="true"></div>

    <header class="hero">
      <p class="brand">Interesting X</p>
      <h1 class="title">Fish school</h1>
      <p class="lede">
        Collective motion from local rules — align with neighbours, stick together,
        avoid collisions, plus noise. Watch order melt into chaos and reform as a vortex.
      </p>
    </header>

    <p class="hint">
      <span class="hint-dot" aria-hidden="true"></span>
      <span>
        Chase the school with your cursor, drop food with a hold, crank the noise,
        and watch order turn into chaos.
      </span>
    </p>

    <aside class="explainer${recordMode ? " record-hide" : ""}" id="explainer" data-open="true">
      <button
        type="button"
        class="explainer-toggle"
        id="explainer-toggle"
        aria-expanded="true"
        aria-controls="explainer-body"
      >
        <span class="explainer-toggle-label">What am I looking at?</span>
        <span class="explainer-chevron" aria-hidden="true"></span>
      </button>
      <div class="explainer-body" id="explainer-body">
        <p>
          Each fish only sees neighbours inside a radius. Shared heading builds an
          <strong>aligned school</strong>; attraction plus a mild orbit bias makes a
          <strong>vortex</strong>; noise melts order into <strong>chaos</strong>.
          The meter is the Vicsek order parameter (0 = random, 1 = all parallel).
        </p>
        <p>
          Inspired by
          <a href="https://x.com/DynamicsSIAM/status/2105193064771821938" target="_blank" rel="noreferrer">@DynamicsSIAM</a>
          on statistical physics of fish collective motion (arXiv 2609.37637).
        </p>
      </div>
    </aside>

    <section class="stage" aria-label="Live fish school" id="stage">
      <canvas id="canvas" role="img" aria-label="Animated school of fish"></canvas>
      <div class="hud" aria-live="polite">
        <span class="hud-order" id="hud-order">order 0.00</span>
        <span class="hud-phase" id="hud-phase">Swirling</span>
      </div>
    </section>

    <section class="controls" aria-label="School controls">
      <div class="presets" role="group" aria-label="Behaviour presets">
        ${presetButtons}
      </div>

      <div class="row">
        <div class="actions">
          <button type="button" class="btn warm" id="btn-scatter">Scatter</button>
          <span class="mode-pill" id="mode-pill" data-mode="predator">mode · predator</span>
        </div>
        <div class="sliders">
          <div class="field">
            <label for="param-noise">Noise</label>
            <input
              id="param-noise"
              type="range"
              min="${NOISE_MIN}"
              max="${NOISE_MAX}"
              step="0.01"
              value="${state.params.noise}"
            />
            <div class="range-meta">
              <span>calm</span>
              <span class="val" id="noise-val">${formatNoise(state.params.noise)}</span>
              <span>chaos</span>
            </div>
          </div>
          <div class="field">
            <label for="param-range">Neighbour range</label>
            <input
              id="param-range"
              type="range"
              min="${RANGE_MIN}"
              max="${RANGE_MAX}"
              step="1"
              value="${state.params.range}"
            />
            <div class="range-meta">
              <span>near</span>
              <span class="val" id="range-val">${formatRange(state.params.range)}</span>
              <span>far</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <p class="caption">
      Vicsek / boids hybrid with spatial hashing · order φ = |Σ e<sup>iθ</sup>| / N.
      Hover repels (predator shockwave); click-and-hold drops food the school swarms.
    </p>

    <footer class="foot">
      <span>apps/fish-school</span>
      <span aria-hidden="true">·</span>
      <span>canvas 2D · no network</span>
    </footer>
  `;

  const stage = mustEl(root, "#stage", HTMLElement);
  const canvas = mustEl(root, "#canvas", HTMLCanvasElement);
  const btnScatter = mustEl(root, "#btn-scatter", HTMLButtonElement);
  const paramNoise = mustEl(root, "#param-noise", HTMLInputElement);
  const paramRange = mustEl(root, "#param-range", HTMLInputElement);
  const noiseVal = mustEl(root, "#noise-val", HTMLElement);
  const rangeVal = mustEl(root, "#range-val", HTMLElement);
  const hudOrder = mustEl(root, "#hud-order", HTMLElement);
  const hudPhase = mustEl(root, "#hud-phase", HTMLElement);
  const modePill = mustEl(root, "#mode-pill", HTMLElement);
  const explainer = mustEl(root, "#explainer", HTMLElement);
  const explainerToggle = mustEl(root, "#explainer-toggle", HTMLButtonElement);

  let lastReadoutMs = 0;
  let lastMetrics: SchoolMetrics = {
    order: 0,
    vorticity: 0,
    phase: "swirling",
    phaseLabel: "Swirling",
  };
  let lastShockMs = 0;
  let lastFoodMs = 0;
  let lastTs = 0;
  let raf = 0;

  function syncPresetButtons(): void {
    for (const id of Object.keys(PRESETS) as PresetId[]) {
      const btn = root.querySelector(`#preset-${id}`);
      if (!(btn instanceof HTMLButtonElement)) continue;
      const on = state.preset === id;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function applyPreset(id: PresetId): void {
    state.params = cloneParams(PRESETS[id].params);
    state.preset = id;
    paramNoise.value = String(state.params.noise);
    paramRange.value = String(state.params.range);
    setTextIfChanged(noiseVal, formatNoise(state.params.noise));
    setTextIfChanged(rangeVal, formatRange(state.params.range));
    // Preset switches must be visually obvious within a second.
    if (id === "swarm") {
      polarizeSchool(fish, state.params.speed);
    } else if (id === "chaos") {
      scrambleHeadings(fish, state.params.speed);
    }
    syncPresetButtons();
  }

  function markCustomIfNeeded(): void {
    state.preset = nearestPreset(state.params);
    syncPresetButtons();
  }

  function layout(): void {
    const rect = stage.getBoundingClientRect();
    const sized = resizeCanvas(canvas, rect.width, Math.max(320, rect.height));
    const scaleX = sized.width / Math.max(1, state.width);
    const scaleY = sized.height / Math.max(1, state.height);
    if (state.width !== sized.width || state.height !== sized.height) {
      for (const f of fish) {
        f.x *= scaleX;
        f.y *= scaleY;
        for (let t = 0; t < f.trailX.length; t += 1) {
          f.trailX[t]! *= scaleX;
          f.trailY[t]! *= scaleY;
        }
      }
      for (const food of foods) {
        food.x *= scaleX;
        food.y *= scaleY;
      }
      plankton = createPlankton(90, sized.width, sized.height);
      state.width = sized.width;
      state.height = sized.height;
    }
  }

  function pointerFromEvent(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * state.width,
      y: ((e.clientY - rect.top) / rect.height) * state.height,
    };
  }

  function updateModePill(): void {
    if (pointer.holding) {
      modePill.dataset.mode = "food";
      setTextIfChanged(modePill, "mode · food");
    } else if (pointer.active) {
      modePill.dataset.mode = "predator";
      setTextIfChanged(modePill, "mode · predator");
    } else {
      modePill.dataset.mode = "idle";
      setTextIfChanged(modePill, "mode · idle");
    }
  }

  function updateReadouts(now: number, force: boolean): void {
    if (!force && now - lastReadoutMs < READOUT_INTERVAL_MS) return;
    lastReadoutMs = now;
    const orderText = `order ${lastMetrics.order.toFixed(2)}`;
    setTextIfChanged(hudOrder, orderText);
    setTextIfChanged(hudPhase, lastMetrics.phaseLabel);
  }

  function tick(ts: number): void {
    if (!lastTs) lastTs = ts;
    const rawDt = Math.min(32, ts - lastTs);
    lastTs = ts;
    const dtScale = rawDt / (1000 / 60);

    lastMetrics = stepSchool(
      fish,
      state.width,
      state.height,
      state.params,
      pointer,
      foods,
      shocks,
      dtScale,
    );

    // Continuous food while holding.
    if (pointer.holding && pointer.active && ts - lastFoodMs > FOOD_HOLD_INTERVAL_MS) {
      dropFood(foods, pointer.x, pointer.y);
      lastFoodMs = ts;
    }

    paintStage(
      canvas,
      fish,
      foods,
      shocks,
      pointer,
      plankton,
      lastMetrics.order,
      lastMetrics.phaseLabel,
      ts,
      OCEAN,
    );
    updateReadouts(ts, false);
    raf = requestAnimationFrame(tick);
  }

  // --- Controls ---
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    const btn = mustEl(root, `#preset-${id}`, HTMLButtonElement);
    btn.addEventListener("click", () => {
      applyPreset(id);
    });
  }

  btnScatter.addEventListener("click", () => {
    scatterSchool(fish, state.width, state.height);
  });

  paramNoise.addEventListener("input", () => {
    state.params.noise = Number(paramNoise.value);
    setTextIfChanged(noiseVal, formatNoise(state.params.noise));
    markCustomIfNeeded();
  });

  paramRange.addEventListener("input", () => {
    state.params.range = Number(paramRange.value);
    setTextIfChanged(rangeVal, formatRange(state.params.range));
    markCustomIfNeeded();
  });

  explainerToggle.addEventListener("click", () => {
    const open = explainer.dataset.open !== "false";
    explainer.dataset.open = open ? "false" : "true";
    explainerToggle.setAttribute("aria-expanded", open ? "false" : "true");
  });

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = pointerFromEvent(e);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.active = true;
    pointer.holding = true;
    dropFood(foods, p.x, p.y);
    lastFoodMs = performance.now();
    updateModePill();
  });

  canvas.addEventListener("pointermove", (e) => {
    const p = pointerFromEvent(e);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.active = true;
    const now = performance.now();
    if (!pointer.holding && now - lastShockMs > SHOCK_INTERVAL_MS) {
      emitShock(shocks, p.x, p.y);
      lastShockMs = now;
    }
    updateModePill();
  });

  const endPointer = (e: PointerEvent): void => {
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    pointer.holding = false;
    // Keep predator active briefly if still over canvas; otherwise clear.
    const rect = canvas.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;
    pointer.active = inside;
    if (inside) {
      const p = pointerFromEvent(e);
      pointer.x = p.x;
      pointer.y = p.y;
    }
    updateModePill();
  };

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", () => {
    if (!pointer.holding) {
      pointer.active = false;
      updateModePill();
    }
  });

  window.addEventListener("resize", () => {
    layout();
  });

  // After a short boot mill, ease into Swarm so first-time viewers see alignment.
  if (!recordMode) {
    window.setTimeout(() => {
      if (state.preset === "mill") applyPreset("swarm");
    }, 3200);
  }

  // Record-mode choreography: predator sweep + food so the X video has wow moments
  // beyond what click-only record.json steps can show.
  if (recordMode) {
    void runRecordChoreography();
  }

  async function runRecordChoreography(): Promise<void> {
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
      });

    await sleep(900);
    // Predator chase across the school.
    pointer.active = true;
    pointer.holding = false;
    updateModePill();
    const steps = 36;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      pointer.x = state.width * (0.15 + t * 0.7);
      pointer.y = state.height * (0.35 + Math.sin(t * Math.PI * 2) * 0.2);
      emitShock(shocks, pointer.x, pointer.y);
      await sleep(40);
    }
    pointer.active = false;
    updateModePill();

    await sleep(400);
    // Drop a cluster of food near the center.
    pointer.active = true;
    pointer.holding = true;
    pointer.x = state.width * 0.55;
    pointer.y = state.height * 0.5;
    updateModePill();
    for (let i = 0; i < 5; i += 1) {
      dropFood(
        foods,
        pointer.x + (Math.random() - 0.5) * 40,
        pointer.y + (Math.random() - 0.5) * 40,
      );
      await sleep(120);
    }
    pointer.holding = false;
    pointer.active = false;
    updateModePill();
  }

  layout();
  // If school was created before real layout, reseed to fill the stage.
  if (fish.length > 0) {
    const seeded = createSchool(state.width, state.height);
    for (let i = 0; i < fish.length; i += 1) {
      const src = seeded[i]!;
      const dst = fish[i]!;
      dst.x = src.x;
      dst.y = src.y;
      dst.vx = src.vx;
      dst.vy = src.vy;
      dst.trailX.set(src.trailX);
      dst.trailY.set(src.trailY);
      dst.trailI = 0;
    }
  }
  syncPresetButtons();
  updateModePill();
  updateReadouts(performance.now(), true);
  raf = requestAnimationFrame(tick);

  // Keep raf referenced for possible future pause; currently always running.
  void raf;

  // Start from mill params visually; sync sliders to boot state.
  paramNoise.value = String(state.params.noise);
  paramRange.value = String(state.params.range);
  setTextIfChanged(noiseVal, formatNoise(state.params.noise));
  setTextIfChanged(rangeVal, formatRange(state.params.range));
}

mount();
