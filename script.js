(() => {
  "use strict";

  // ================== Camera & tree parameters ==================
  const CAM_DIST = 13.0;
  const CAM_HEIGHT = 6.0;
  const PITCH = -0.25;
  const TREE_HEIGHT = 12.0;

  // ================== Base counts (balanced for natural tree) ==================
  const BASE_TREE_POINTS = 22000; // lights on the tree body
  const BASE_GARLAND_POINTS = 4500; // ribbon / garlands
  const BASE_GROUND_POINTS = 3500;
  const BASE_STAR_POINTS = 1200;
  const BASE_HEART_POINTS = 900;
  const SNOW2D_POINTS = 10;

  // Reference resolution for density scaling
  const REF_AREA = 1600 * 900;

  // ================== Palettes ==================
  // Evergreen body
  const EVERGREEN_DARK = { r: 0x0a, g: 0x3a, b: 0x1a }; // #0a3a1a
  const EVERGREEN_MID = { r: 0x14, g: 0x5c, b: 0x2a };  // #145c2a
  const EVERGREEN_HI = { r: 0x66, g: 0xb3, b: 0x7a };   // #66b37a

  // Trunk
  const TRUNK_DARK = { r: 0x3b, g: 0x23, b: 0x14 };
  const TRUNK_MID = { r: 0x74, g: 0x4b, b: 0x29 };
  const TRUNK_LIGHT = { r: 0xa6, g: 0x74, b: 0x3b };

  // Background & cool highlights
  const DEEP_NAVY = { r: 0x04, g: 0x0a, b: 0x12 };
  const NIGHT_SKY = { r: 0x01, g: 0x04, b: 0x08 };
  const GLACIER = { r: 0x88, g: 0xc9, b: 0xff };
  const ICY = { r: 0xbf, g: 0xe7, b: 0xff };
  const SILVER = { r: 0xcf, g: 0xd8, b: 0xe3 };
  const ICE_WHITE = { r: 0xee, g: 0xf6, b: 0xff };

  // Warm gold/orange highlights for base glow, warm bulbs and star
  const GOLD_LIGHT = { r: 0xff, g: 0xd6, b: 0x6b }; // #ffd66b
  const GOLD_DEEP = { r: 0xff, g: 0xb8, b: 0x4a };  // #ffb84a
  const GOLD_SOFT = { r: 0xff, g: 0xf0, b: 0xd2 };

  // Small warm / cool bulbs
  const BULB_WARM = { r: 0xff, g: 0xe6, b: 0xc0 };
  const BULB_COOL = { r: 0xd6, g: 0xf0, b: 0xff };

  const canvas = document.getElementById("treeCanvas");
  const ctx = canvas.getContext("2d");
  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";

  let viewWidth = window.innerWidth || 800;
  let viewHeight = window.innerHeight || 600;
  let dpr = window.devicePixelRatio || 1;

  // ================== Scene point sets ==================
  let treePoints = [];            // tree lights
  let garlandPoints = [];         // cool ribbons
  let goldenGarlandPoints = [];   // warm golden spiral
  let groundPoints = [];
  let starPoints = [];
  let heartPoints = [];
  let sparklePoints = [];
  let outsideOrnaments = [];      // ornaments hanging OUTSIDE tree

  // Natural evergreen branch sprites (needle tiles)
  let branchSprites = [];

  // Foreground snow
  let snowFlakes = [];

  // Large bokeh circles
  let bokehCircles = [];

  // Tree silhouette samples
  const SILHOUETTE_SAMPLES = 260;
  const silhouetteRight = [];
  const silhouetteLeft = [];
  let silhouetteMinY = 0;
  let silhouetteMaxY = 0;

  // Needle tiles (offscreen canvases)
  const NEEDLE_GROUPS = 3; // dark, mid, highlight
  const NEEDLE_VARIANTS = 3;
  const NEEDLE_BASE_W = 120;
  const NEEDLE_BASE_H = 72;
  let needleTiles = []; // [group][variant] -> canvas

  // Branch sprite distribution
  const BRANCH_LEVEL_BASE = 85;
  const MAX_BRANCH_SPRITES = 900;

  // Draw list for depth-sorted points / ornaments / sparkles
  let drawList = [];

  // ================== Camera / interaction state ==================
  let angle = 0.0;
  let time = 0.0;
  let lastTimestamp = performance.now();

  let yawOffset = 0.0;
  let pitchOffset = 0.0;
  let targetYawOffset = 0.0;
  let targetPitchOffset = 0.0;

  let parallaxOffsetX = 0.0;
  let parallaxOffsetY = 0.0;
  let targetParallaxX = 0.0;
  let targetParallaxY = 0.0;

  const SNOW_LEVELS = [4, 8, 14];
  let snowLevelIndex = 1;

  const OUTSIDE_ORNAMENT_BASE_COUNT = 32;
  const OUTSIDE_ORNAMENT_MIN_COUNT = 24;
  const OUTSIDE_ORNAMENT_MAX_COUNT = 40;
  const OUTSIDE_ORNAMENT_MARGIN_MIN = 1.2;
  const OUTSIDE_ORNAMENT_MARGIN_MAX = 1.35;

  let twinkleIntensity = 1.0;
  let baseGlowPhase = 0.0;

  const FESTIVE_DURATION = 5.0;
  let festiveTimeLeft = 0.0;
  let festiveEase = 0.0;

  let dragSpinVelocity = 0.0;
  let isDragging = false;
  let lastPointerX = 0;

  let isPageHidden = false;
  let manualPaused = false;
  let running = true;

  // Hints
  const HINT_LIFETIME = 7.0;
  let hints = [];
  let hasShownFirstHint = false;

  // WebAudio state
  let audioCtx = null;
  let audioGain = null;
  let audioTimerId = null;
  let audioStarted = false;
  let audioMuted = false;

  // Sleigh & reindeer
  let sleighEnabled = true;
  let sleighActive = false;
  let sleighProgress = 0.0;
  let sleighTimer = 0.0;
  const SLEIGH_INTERVAL = 25.0;
  const SLEIGH_DURATION = 9.0;
  let sleighBoostTrailTime = 0.0;
  let sleighTrailAccum = 0.0;
  let sleighScreenX = 0;
  let sleighScreenY = 0;
  let sleighScreenVisible = false;

  let sleighCameoTimeLeft = 0.0;
  let sleighCameoPos = null;

  let santaGroundTimeLeft = 0.0;

  // ================== Utilities ==================
  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function randInt(min, maxInclusive) {
    return Math.floor(min + Math.random() * (maxInclusive - min + 1));
  }

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpColor(c1, c2, t) {
    return {
      r: Math.round(lerp(c1.r, c2.r, t)),
      g: Math.round(lerp(c1.g, c2.g, t)),
      b: Math.round(lerp(c1.b, c2.b, t)),
    };
  }

  function randNormal(mean, stdDev) {
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    const mag = Math.sqrt(-2.0 * Math.log(u1));
    const z0 = mag * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
  }

  function computeDensityScale() {
    const area = viewWidth * viewHeight;
    const pixelScale = area / REF_AREA;
    const dprFactor = Math.max(1, Math.min(2.5, dpr));
    const raw = Math.sqrt(pixelScale / dprFactor);
    return clamp(raw, 0.4, 1.0);
  }

  function treeEnvelopeRadiusAtHeight(hNorm) {
    const h = clamp(hNorm, 0.0, 1.0);
    // Conical base with branch whorls modulation
    let baseR = Math.pow(1 - h, 1.1) * 3.2;
    const branchWave = Math.max(0.0, Math.sin((h * 5.8 + 0.15) * Math.PI * 2));
    baseR *= 1.0 + 0.55 * branchWave;
    return baseR * 1.05;
  }

  function getCurrentSnowCount() {
    const base = SNOW_LEVELS[snowLevelIndex] || SNOW_LEVELS[1];
    const area = viewWidth * viewHeight;
    const scale = clamp(area / REF_AREA, 0.7, 1.4);
    return Math.max(2, Math.round(base * scale));
  }

  // ================== Needle tiles & branch sprites ==================
  function createNeedleTile(groupIndex, variantIndex) {
    const canvasTile = document.createElement("canvas");
    canvasTile.width = NEEDLE_BASE_W;
    canvasTile.height = NEEDLE_BASE_H;
    const tctx = canvasTile.getContext("2d");

    tctx.clearRect(0, 0, NEEDLE_BASE_W, NEEDLE_BASE_H);
    tctx.lineCap = "round";

    let baseA, baseB;
    if (groupIndex === 0) {
      baseA = EVERGREEN_DARK;
      baseB = EVERGREEN_MID;
    } else if (groupIndex === 1) {
      baseA = EVERGREEN_MID;
      baseB = lerpColor(EVERGREEN_MID, EVERGREEN_HI, 0.6);
    } else {
      baseA = lerpColor(EVERGREEN_MID, EVERGREEN_HI, 0.3);
      baseB = EVERGREEN_HI;
    }

    const strokeCount = randInt(72, 120);
    for (let i = 0; i < strokeCount; i++) {
      const t = Math.random();
      const c = lerpColor(baseA, baseB, t * 0.9 + 0.05);
      const alpha = 0.45 + 0.4 * Math.random();
      tctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha.toFixed(3)})`;
      const lineWidth = 1.0 + (groupIndex === 0 ? 0.7 : 1.2) * Math.random();
      tctx.lineWidth = lineWidth;

      const px = randRange(NEEDLE_BASE_W * 0.05, NEEDLE_BASE_W * 0.95);
      const py = randRange(NEEDLE_BASE_H * 0.15, NEEDLE_BASE_H * 0.9);

      let ang = randRange(-0.9, -0.25);
      if (Math.random() < 0.5) ang = Math.PI - ang;
      const len = randRange(NEEDLE_BASE_W * 0.22, NEEDLE_BASE_W * 0.45);

      const x2 = px + Math.cos(ang) * len;
      const y2 = py + Math.sin(ang) * len * 1.05;

      tctx.beginPath();
      tctx.moveTo(px, py);
      tctx.lineTo(x2, y2);
      tctx.stroke();
    }

    // Occasional brighter highlights for frosted tips
    const hlCount = randInt(10, 18);
    for (let i = 0; i < hlCount; i++) {
      const c = lerpColor(EVERGREEN_HI, ICE_WHITE, 0.25);
      const alpha = 0.15 + 0.25 * Math.random();
      tctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha.toFixed(3)})`;
      tctx.lineWidth = 0.9;
      const px = randRange(NEEDLE_BASE_W * 0.1, NEEDLE_BASE_W * 0.9);
      const py = randRange(NEEDLE_BASE_H * 0.1, NEEDLE_BASE_H * 0.5);
      const len = randRange(NEEDLE_BASE_W * 0.12, NEEDLE_BASE_W * 0.24);
      const ang = randRange(-0.7, -0.1);
      const x2 = px + Math.cos(ang) * len;
      const y2 = py + Math.sin(ang) * len;
      tctx.beginPath();
      tctx.moveTo(px, py);
      tctx.lineTo(x2, y2);
      tctx.stroke();
    }

    return canvasTile;
  }

  function initNeedleTiles() {
    needleTiles = new Array(NEEDLE_GROUPS);
    for (let g = 0; g < NEEDLE_GROUPS; g++) {
      const group = [];
      for (let v = 0; v < NEEDLE_VARIANTS; v++) {
        group.push(createNeedleTile(g, v));
      }
      needleTiles[g] = group;
    }
  }

  function genBranchSprites(densityScale) {
    const sprites = [];
    const levels = Math.max(40, Math.round(BRANCH_LEVEL_BASE * clamp(densityScale, 0.7, 1.2)));

    for (let i = 0; i < levels; i++) {
      const t = levels === 1 ? 0.5 : i / (levels - 1);
      const h = lerp(0.06, 0.98, t);
      const y = TREE_HEIGHT * h + 0.2;

      const envR = treeEnvelopeRadiusAtHeight(h);
      const fanCount = randInt(1, 3);
      const baseAngle = t * Math.PI * 6.0 + randRange(-0.5, 0.5);

      for (let f = 0; f < fanCount; f++) {
        const phi = baseAngle + (f / fanCount) * Math.PI * 2 + randRange(-0.25, 0.25);
        const tileCount = randInt(2, 3);

        for (let k = 0; k < tileCount; k++) {
          const tRad = 0.45 + 0.4 * (k / (tileCount - 1 || 1)) + randRange(-0.05, 0.05);
          const r = envR * clamp(tRad, 0.3, 1.15);
          const droop = r * 0.05 * (0.7 + Math.random());
          const wy = y - droop;
          const wx = Math.cos(phi) * r;
          const wz = Math.sin(phi) * r;

          const worldSize = lerp(1.1, 0.4, h) * randRange(0.8, 1.3);

          let groupIndex;
          if (h < 0.32) groupIndex = 0;
          else if (h < 0.72) groupIndex = 1;
          else groupIndex = 2;

          const variantIndex = randInt(0, NEEDLE_VARIANTS - 1);
          const rot = randRange(-0.45, 0.25);
          const alpha = lerp(0.98, 0.78, h) * randRange(0.9, 1.05);

          sprites.push({
            x: wx,
            y: wy,
            z: wz,
            size: worldSize,
            group: groupIndex,
            variant: variantIndex,
            rot,
            alpha,
          });

          if (sprites.length >= MAX_BRANCH_SPRITES) {
            return sprites;
          }
        }
      }
    }

    return sprites;
  }
  // ================== Point generation ==================
  function genTreePoints(count) {
    const pts = [];
    const loops = 9;
    const spiralN = Math.floor(count * 0.7);

    const maxCandy = Math.max(14, Math.floor(count * 0.001));
    let candyCount = 0;

    // Spiral lights
    for (let i = 0; i < spiralN; i++) {
      const u = Math.random();
      const h = Math.pow(u, 1.6);
      const y = TREE_HEIGHT * h + 0.2;

      let baseR = Math.pow(1 - h, 1.1) * 3.2;
      const branchWave = Math.max(0.0, Math.sin((h * 5.8 + 0.15) * Math.PI * 2));
      baseR *= 1.0 + 0.55 * branchWave;

      const t = u * loops * Math.PI * 2;
      const angleSpiral = t + randRange(-0.22, 0.22);
      const r = baseR * randRange(0.85, 1.08);

      const x = Math.cos(angleSpiral) * r;
      const z = Math.sin(angleSpiral) * r;

      const greenBase = lerpColor(EVERGREEN_DARK, EVERGREEN_HI, h * 1.1);
      const warmMix = lerpColor(GOLD_DEEP, GOLD_SOFT, 0.35 + 0.45 * Math.random());
      const baseColor = lerpColor(greenBase, warmMix, 0.35 + 0.4 * Math.random());
      let color = {
        r: clamp(baseColor.r + randInt(-10, 10), 120, 255),
        g: clamp(baseColor.g + randInt(-12, 12), 120, 255),
        b: clamp(baseColor.b + randInt(-12, 12), 80, 255),
      };

      const point = { x, y, z, color, isBauble: false, shape: "dot" };

      // twinkle for a subset
      if (Math.random() < 0.08) {
        point.twinkle = {
          speed: randRange(1.8, 4.0),
          offset: Math.random() * Math.PI * 2,
          max_bright: 1.9,
        };
      }

      // glass baubles
      if (Math.random() < 0.018) {
        point.isBauble = true;
        point.shape = "bauble";
        const useGold = Math.random() < 0.5;
        const base = useGold ? lerpColor(GOLD_DEEP, GOLD_LIGHT, 0.4 + 0.4 * Math.random()) : lerpColor(SILVER, ICE_WHITE, 0.4 + 0.5 * Math.random());
        point.color = {
          r: clamp(base.r + randInt(-6, 6), 200, 255),
          g: clamp(base.g + randInt(-6, 6), 200, 255),
          b: clamp(base.b + randInt(-6, 6), 190, 255),
        };
        delete point.twinkle;
      } else if (Math.random() < 0.025) {
        // cool starlets
        point.shape = "starlet";
        const starColor = lerpColor(ICE_WHITE, GLACIER, Math.random() * 0.7);
        point.color = {
          r: clamp(starColor.r + randInt(-6, 6), 210, 255),
          g: clamp(starColor.g + randInt(-6, 6), 215, 255),
          b: clamp(starColor.b + randInt(-6, 6), 220, 255),
        };
        point.starSize = randRange(1.0, 1.6);
        point.twinkle = {
          speed: randRange(1.2, 2.6),
          offset: Math.random() * Math.PI * 2,
          max_bright: 2.1,
        };
      } else if (h > 0.42 && h < 0.9 && candyCount < maxCandy && Math.random() < 0.16) {
        // in-tree candy canes (sparser)
        point.shape = "candy";
        point.color = { r: 250, g: 245, b: 245 };
        point.sizeScale = 2.0;
        candyCount++;
        delete point.twinkle;
      }

      pts.push(point);
    }

    // Fluffy fill points inside tree
    const fillN = count - spiralN;
    const FILL_LOW = EVERGREEN_DARK;
    for (let i = 0; i < fillN; i++) {
      const h = Math.pow(Math.random(), 1.9);
      const y = TREE_HEIGHT * h + 0.2 + randRange(-0.08, 0.08);

      let baseR = Math.pow(1 - h, 1.1) * 4.0;
      const branchWave = Math.max(0.0, Math.sin((h * 5.2 + 0.12) * Math.PI * 2));
      baseR *= 1.0 + 0.55 * branchWave;

      const radius = baseR * Math.sqrt(Math.random());
      const angleFill = Math.random() * Math.PI * 2;

      const x = Math.cos(angleFill) * radius + randRange(-0.08, 0.08);
      const z = Math.sin(angleFill) * radius + randRange(-0.08, 0.08);

      const tFill = 0.1 + h * 0.9;
      const green = lerpColor(FILL_LOW, EVERGREEN_HI, tFill);
      const color = {
        r: clamp(green.r + randInt(-10, 10), 20, 210),
        g: clamp(green.g + randInt(-10, 10), 60, 220),
        b: clamp(green.b + randInt(-10, 10), 40, 210),
      };

      pts.push({ x, y, z, color, isBauble: false, shape: "dot" });
    }

    return pts;
  }

  function genSecondaryGarland(count) {
    const pts = [];
    const loops = 7;
    const phaseOffset = 0.8;

    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const h = Math.pow(u, 1.5);
      const y = TREE_HEIGHT * h + 0.2;

      let baseR = Math.pow(1 - h, 1.0) * 3.0;
      const branchWave = Math.max(0.0, Math.sin((h * 5.0 + 0.5) * Math.PI * 2));
      baseR *= 1.0 + 0.4 * branchWave;

      const t = u * loops * Math.PI * 2;
      const angleSpiral = t + phaseOffset * Math.PI * 2 + randRange(-0.1, 0.1);
      const r = baseR * randRange(0.95, 1.05);

      const x = Math.cos(angleSpiral) * r;
      const z = Math.sin(angleSpiral) * r;

      const color = lerpColor(BULB_COOL, GLACIER, Math.random());

      const bandIndex = Math.floor(u * 24);
      const speed = randRange(1.0, 2.0);
      const offset = Math.random() * Math.PI * 2;
      const isBrightBand = bandIndex % 2 === 0;
      const pulse = {
        speed,
        offset,
        bandIndex,
        min_bright: isBrightBand ? 0.8 : 0.4,
        max_bright: isBrightBand ? 1.8 : 1.2,
      };

      pts.push({ x, y, z, color, pulse, isRibbon: true, shape: "ribbon" });
    }
    return pts;
  }

  function genGoldenGarland(count) {
    const pts = [];
    const loops = 7;
    const phaseOffset = 0.35;

    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const h = Math.pow(u, 1.4);
      const y = TREE_HEIGHT * h + 0.18;

      let baseR = Math.pow(1 - h, 1.02) * 2.9;
      const branchWave = Math.max(0.0, Math.sin((h * 5.3 + 0.25) * Math.PI * 2));
      baseR *= 1.0 + 0.45 * branchWave;

      const t = u * loops * Math.PI * 2;
      const angleSpiral = t + phaseOffset * Math.PI * 2 + randRange(-0.12, 0.12);
      const r = baseR * randRange(0.92, 1.06);

      const x = Math.cos(angleSpiral) * r;
      const z = Math.sin(angleSpiral) * r;

      const warmT = 0.25 + Math.random() * 0.75;
      const baseWarm = lerpColor(GOLD_DEEP, GOLD_LIGHT, warmT);
      const mixed = lerpColor(baseWarm, GOLD_SOFT, 0.35 + Math.random() * 0.4);
      const color = {
        r: clamp(mixed.r + randInt(-10, 8), 210, 255),
        g: clamp(mixed.g + randInt(-10, 8), 180, 255),
        b: clamp(mixed.b + randInt(-6, 10), 120, 255),
      };

      const twinkle = {
        speed: randRange(1.3, 2.6),
        offset: Math.random() * Math.PI * 2,
        max_bright: 2.0 + Math.random() * 0.7,
      };

      const bandIndex = Math.floor(u * 20);
      const speed = randRange(0.7, 1.4);
      const offset = Math.random() * Math.PI * 2;
      const isBrightBand = bandIndex % 2 === 0;
      const pulse = {
        speed,
        offset,
        bandIndex,
        min_bright: isBrightBand ? 0.85 : 0.55,
        max_bright: isBrightBand ? 2.0 : 1.4,
      };

      pts.push({ x, y, z, color, twinkle, pulse, isGoldGarland: true, shape: "goldGarland" });
    }

    return pts;
  }

  function genBokehCircles(densityScale) {
    const circles = [];
    const baseCount = 16;
    const d = clamp(densityScale, 0.6, 1.2);
    const count = Math.max(8, Math.round(baseCount * d));

    for (let i = 0; i < count; i++) {
      const layer = Math.random() < 0.5 ? "back" : "front";
      const nx = 0.2 + Math.random() * 0.6;
      const ny = 0.12 + Math.random() * 0.7;
      const x = viewWidth * nx;
      const y = viewHeight * ny;

      const maxSide = Math.max(viewWidth, viewHeight);
      const radius = maxSide * randRange(0.06, 0.18);

      const useGold = Math.random() < 0.55;
      const cBase = useGold ? GOLD_LIGHT : GLACIER;
      const alpha = useGold ? randRange(0.14, 0.3) : randRange(0.1, 0.22);

      circles.push({ x, y, radius, color: cBase, alpha, layer });
    }

    return circles;
  }

  function genGroundPoints(count) {
    const pts = [];
    const rings = [4.6, 6.0, 7.4, 8.8, 10.2, 11.4];
    for (let i = 0; i < count; i++) {
      const ring = rings[Math.floor(Math.random() * rings.length)];
      const r = randNormal(ring, 0.3);
      const theta = Math.random() * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      const y = -0.25;

      const t = 0.25 + Math.random() * 0.65;
      let baseColor = lerpColor(SILVER, ICY, t);
      if (Math.random() < 0.15) {
        baseColor = lerpColor(baseColor, ICE_WHITE, 0.5 + Math.random() * 0.5);
      }
      const color = {
        r: clamp(baseColor.r + randInt(-10, 10), 180, 255),
        g: clamp(baseColor.g + randInt(-10, 10), 190, 255),
        b: clamp(baseColor.b + randInt(0, 15), 210, 255),
      };
      pts.push({ x, y, z, color });
    }
    return pts;
  }

  function genStarPoints(count) {
    const pts = [];
    for (let i = 0; i < count; i++) {
      const x = randRange(-18.0, 18.0);
      const z = randRange(-18.0, 18.0);
      const y = randRange(3.0, 18.0);
      const deepBlue = { r: 160, g: 190, b: 255 };
      const t = 0.3 + Math.random() * 0.7;
      const baseColor = lerpColor(deepBlue, ICE_WHITE, t);
      const color = {
        r: clamp(baseColor.r + randInt(-8, 8), 150, 255),
        g: clamp(baseColor.g + randInt(-8, 8), 170, 255),
        b: clamp(baseColor.b + randInt(-8, 8), 210, 255),
      };
      pts.push({ x, y, z, color });
    }
    return pts;
  }

  function genHeartPoints(count) {
    const pts = [];
    const scale = 0.9;
    const topY = TREE_HEIGHT + 0.05;
    while (pts.length < count) {
      const x = randRange(-1.3, 1.3);
      const y = randRange(-1.4, 1.4);
      const f = Math.pow(x * x + y * y - 1.0, 3) - x * x * Math.pow(y, 3);
      if (f <= 0.0) {
        const wx = x * scale * 0.8;
        const wy = topY + (y + 1.0) * scale * 0.5;
        const wz = randRange(-0.18, 0.18);
        const dist = Math.hypot(x, y);
        const factor = Math.max(0.35, 1.15 - 0.5 * dist);
        const tNorm = clamp((factor - 0.35) / (1.15 - 0.35), 0, 1);
        const baseColor = lerpColor(GLACIER, ICE_WHITE, tNorm);
        const color = {
          r: clamp(baseColor.r + randInt(-6, 6), 190, 255),
          g: clamp(baseColor.g + randInt(-6, 8), 210, 255),
          b: clamp(baseColor.b + randInt(-4, 10), 220, 255),
        };
        pts.push({ x: wx, y: wy, z: wz, color });
      }
    }
    return pts;
  }

  function genOutsideOrnaments(densityScale) {
    const ornaments = [];
    const baseCount = OUTSIDE_ORNAMENT_BASE_COUNT;
    const scale = clamp(densityScale, 0.7, 1.2);
    const target = Math.round(baseCount * scale);
    const count = clamp(target, OUTSIDE_ORNAMENT_MIN_COUNT, OUTSIDE_ORNAMENT_MAX_COUNT);

    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const hNorm = lerp(0.25, 0.92, Math.pow(u, 0.85));
      const envelopeR = treeEnvelopeRadiusAtHeight(hNorm);
      const margin = randRange(OUTSIDE_ORNAMENT_MARGIN_MIN, OUTSIDE_ORNAMENT_MARGIN_MAX);
      const rOuter = envelopeR * margin;
      const rInner = envelopeR * randRange(0.98, 1.04);
      const theta = Math.random() * Math.PI * 2;
      const y = TREE_HEIGHT * hNorm + randRange(-0.06, 0.06);

      const ax = Math.cos(theta) * rInner;
      const az = Math.sin(theta) * rInner;
      const ox = Math.cos(theta) * rOuter;
      const oz = Math.sin(theta) * rOuter;

      const typeRand = Math.random();
      let shape;
      if (typeRand < 0.34) shape = "outsideCandy";
      else if (typeRand < 0.67) shape = "outsideSnowflake";
      else shape = "outsideBauble";

      let color;
      let sizeScale;
      if (shape === "outsideCandy") {
        color = { r: 250, g: 245, b: 245 };
        sizeScale = 2.4;
      } else if (shape === "outsideSnowflake") {
        const baseColor = lerpColor(GLACIER, ICE_WHITE, 0.6 + 0.3 * Math.random());
        color = {
          r: clamp(baseColor.r + randInt(-8, 8), 200, 255),
          g: clamp(baseColor.g + randInt(-8, 8), 210, 255),
          b: clamp(baseColor.b + randInt(-8, 8), 220, 255),
        };
        sizeScale = 2.0;
      } else {
        const cool = lerpColor(SILVER, ICE_WHITE, 0.5 + 0.4 * Math.random());
        const mixed = lerpColor(cool, GOLD_SOFT, 0.18);
        color = {
          r: clamp(mixed.r + randInt(-5, 5), 200, 255),
          g: clamp(mixed.g + randInt(-5, 5), 205, 255),
          b: clamp(mixed.b + randInt(-5, 5), 210, 255),
        };
        sizeScale = 2.1;
      }

      const depthBias = Math.random() < 0.45 ? -0.6 : 0.0;

      ornaments.push({
        x: ox,
        y,
        z: oz,
        anchorX: ax,
        anchorY: y + randRange(-0.03, 0.03),
        anchorZ: az,
        color,
        sizeScale,
        shape,
        depthBias,
        stringColor: { r: 210, g: 220, b: 238 },
      });
    }

    return ornaments;
  }
  // ================== Foreground 2D snow ==================
  function initSnow2D(count) {
    const flakes = [];
    const n = typeof count === "number" ? count : SNOW2D_POINTS;
    for (let i = 0; i < n; i++) {
      const x = randRange(0, viewWidth);
      const y = randRange(-80, -10);
      const radius = randRange(10.0, 16.0);
      const speed = randRange(30.0, 45.0);
      const travel = viewHeight + 80 - y;
      flakes.push({ x, y, radius, speed, life: travel / speed, maxLife: travel / speed });
    }
    return flakes;
  }

  function respawnFlake(flake) {
    flake.x = randRange(0, viewWidth);
    flake.y = randRange(-80, -10);
    flake.radius = randRange(10.0, 16.0);
    flake.speed = randRange(30.0, 45.0);
    const travel = viewHeight + 80 - flake.y;
    flake.life = travel / flake.speed;
    flake.maxLife = flake.life;
  }

  function updateSnow2D(dt) {
    if (!snowFlakes || snowFlakes.length === 0) return;
    for (const f of snowFlakes) {
      f.y += f.speed * dt;
      f.life -= dt;
      if (f.life <= 0 || f.y > viewHeight + 50) {
        respawnFlake(f);
      }
    }
  }

  function drawSnow2D() {
    if (!snowFlakes || snowFlakes.length === 0) return;
    ctx.save();
    ctx.fillStyle = "#eef6ff";
    for (const f of snowFlakes) {
      if (f.maxLife <= 0) continue;
      const phase = f.life / f.maxLife;
      if (phase <= 0) continue;

      const alpha = phase > 0.3 ? 255 : Math.floor(255 * (phase / 0.3));
      const r_steps = [1.3, 1.0, 0.75, 0.55, 0.45];
      const a_divs = [20, 12, 6, 3, 1];

      for (let i = 0; i < r_steps.length; i++) {
        const radius = Math.max(1, Math.floor(f.radius * r_steps[i]));
        const point_alpha = Math.floor(alpha / a_divs[i]);
        if (point_alpha > 0) {
          ctx.globalAlpha = point_alpha / 255;
          ctx.beginPath();
          ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // ================== Sparkles ==================
  const MAX_SPARKLES = 260;

  function spawnSparkleBurst(cx, cy, cz, radius, count) {
    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const theta = Math.random() * Math.PI * 2;
      const r = radius * Math.sqrt(u);
      const dx = Math.cos(theta) * r;
      const dz = Math.sin(theta) * r;
      const dy = randRange(-radius * 0.4, radius * 0.4);
      const life = randRange(0.8, 1.4);
      const baseColor = lerpColor(GLACIER, ICE_WHITE, Math.random());
      sparklePoints.push({
        x: cx + dx,
        y: cy + dy,
        z: cz + dz,
        color: {
          r: clamp(baseColor.r + randInt(-10, 10), 200, 255),
          g: clamp(baseColor.g + randInt(-10, 10), 210, 255),
          b: clamp(baseColor.b + randInt(-10, 10), 230, 255),
        },
        life,
        maxLife: life,
      });
    }
    if (sparklePoints.length > MAX_SPARKLES) {
      sparklePoints.splice(0, sparklePoints.length - MAX_SPARKLES);
    }
  }

  function updateSparkles(dt) {
    if (!sparklePoints.length || dt <= 0) return;
    for (let i = sparklePoints.length - 1; i >= 0; i--) {
      const p = sparklePoints[i];
      p.life -= dt;
      if (p.life <= 0) {
        sparklePoints.splice(i, 1);
      }
    }
  }

  // ================== Interactive state & festive mode ==================
  function updateInteractiveState(dt) {
    if (dt <= 0) return;
    const smooth = 1.0 - Math.exp(-dt * 6.0);

    yawOffset += (targetYawOffset - yawOffset) * smooth;
    pitchOffset += (targetPitchOffset - pitchOffset) * smooth;
    parallaxOffsetX += (targetParallaxX - parallaxOffsetX) * smooth;
    parallaxOffsetY += (targetParallaxY - parallaxOffsetY) * smooth;

    if (festiveTimeLeft > 0) {
      festiveTimeLeft = Math.max(0, festiveTimeLeft - dt);
    }
    const t = festiveTimeLeft > 0 ? clamp(festiveTimeLeft / FESTIVE_DURATION, 0, 1) : 0;
    festiveEase = t * t * (3 - 2 * t);

    if (santaGroundTimeLeft > 0) {
      santaGroundTimeLeft = Math.max(0, santaGroundTimeLeft - dt);
    }
    if (sleighCameoTimeLeft > 0) {
      sleighCameoTimeLeft = Math.max(0, sleighCameoTimeLeft - dt);
      if (sleighCameoTimeLeft <= 0) sleighCameoPos = null;
    }
  }

  function triggerFestiveMode() {
    festiveTimeLeft = FESTIVE_DURATION;
    santaGroundTimeLeft = 3.0;

    if (sleighEnabled) {
      const hNorm = randRange(0.55, 0.85);
      const envelopeR = treeEnvelopeRadiusAtHeight(hNorm);
      const margin = randRange(1.45, 1.75);
      const radius = envelopeR * margin;
      const theta = Math.random() * Math.PI * 2;
      const y = TREE_HEIGHT * hNorm + 0.25;
      sleighCameoPos = {
        x: Math.cos(theta) * radius,
        y,
        z: Math.sin(theta) * radius,
      };
      sleighCameoTimeLeft = randRange(4.0, 6.0);
    }
  }

  // ================== Sleigh path ==================
  function getSleighWorldPosition(t) {
    const tt = clamp(t, 0, 1);
    const hMid = 0.75;
    const envelopeR = treeEnvelopeRadiusAtHeight(hMid);
    const radius = envelopeR * 1.65;

    const baseY = TREE_HEIGHT * 0.9;
    const lift = TREE_HEIGHT * 0.06;

    const p0 = { x: -radius, y: baseY + lift, z: -radius * 0.35 };
    const p1 = { x: -radius * 0.3, y: baseY + lift * 1.4, z: -radius };
    const p2 = { x: radius * 0.3, y: baseY + lift * 1.1, z: -radius * 0.75 };
    const p3 = { x: radius, y: baseY + lift * 0.6, z: -radius * 0.25 };

    const inv = 1 - tt;
    const x =
      inv * inv * inv * p0.x +
      3 * inv * inv * tt * p1.x +
      3 * inv * tt * tt * p2.x +
      tt * tt * tt * p3.x;
    const yBase =
      inv * inv * inv * p0.y +
      3 * inv * inv * tt * p1.y +
      3 * inv * tt * tt * p2.y +
      tt * tt * tt * p3.y;
    const z =
      inv * inv * inv * p0.z +
      3 * inv * inv * tt * p1.z +
      3 * inv * tt * tt * p2.z +
      tt * tt * tt * p3.z;
    const bob = Math.sin(time * 2.4 + tt * Math.PI * 2) * 0.35;
    return { x, y: yBase + bob, z };
  }

  function startSleighFlight(fromClick) {
    if (!sleighEnabled) return;
    sleighActive = true;
    sleighProgress = 0.0;
    sleighTimer = 0.0;
    sleighTrailAccum = 0.0;
    sleighBoostTrailTime = fromClick ? 3.5 : 1.5;
    playSleighJingle();
  }

  function updateSleigh(dt) {
    if (dt <= 0) return;

    if (!sleighEnabled) {
      sleighActive = false;
      sleighProgress = 0.0;
      sleighTimer = 0.0;
      sleighBoostTrailTime = 0.0;
      sleighTrailAccum = 0.0;
      sleighScreenVisible = false;
      return;
    }

    if (!sleighActive) {
      sleighTimer += dt;
      if (sleighTimer >= SLEIGH_INTERVAL) {
        startSleighFlight(false);
      }
    } else {
      sleighProgress += dt / SLEIGH_DURATION;
      if (sleighProgress >= 1.0) {
        sleighActive = false;
        sleighProgress = 0.0;
        sleighTimer = 0.0;
        sleighBoostTrailTime = 0.0;
        sleighTrailAccum = 0.0;
      } else {
        sleighTrailAccum += dt;
        const trailInterval = 0.07;
        while (sleighTrailAccum >= trailInterval) {
          sleighTrailAccum -= trailInterval;
          const pos = getSleighWorldPosition(sleighProgress);
          const extra = sleighBoostTrailTime > 0 ? 8 : 3;
          spawnSparkleBurst(pos.x - 0.4, pos.y, pos.z - 0.6, 0.7, extra);
        }
      }
    }

    if (sleighBoostTrailTime > 0) {
      sleighBoostTrailTime = Math.max(0, sleighBoostTrailTime - dt);
    }
  }

  function updateRunningFlag() {
    running = !isPageHidden && !manualPaused;
  }

  // ================== Projection ==================
  function projectPoint(x, y, z, ang) {
    const angY = ang + yawOffset;
    const cosA = Math.cos(angY), sinA = Math.sin(angY);
    const xz = x * cosA - z * sinA;
    const zz = x * sinA + z * cosA;

    const pitch = PITCH + pitchOffset;
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    let yp = y * cosP - zz * sinP;
    let zp = y * sinP + zz * cosP;

    zp += CAM_DIST;
    yp -= CAM_HEIGHT;

    if (zp <= 0.1) return null;

    const f = (viewHeight * 0.63) / zp;
    return { sx: viewWidth / 2 + xz * f, sy: viewHeight / 2 - yp * f, depth: zp };
  }

  // ================== Canvas & scene setup ==================
  function resizeCanvasAndRebuild() {
    viewWidth = window.innerWidth || document.documentElement.clientWidth || 800;
    viewHeight = window.innerHeight || document.documentElement.clientHeight || 600;
    dpr = window.devicePixelRatio || 1;

    canvas.width = viewWidth * dpr;
    canvas.height = viewHeight * dpr;
    canvas.style.width = viewWidth + "px";
    canvas.style.height = viewHeight + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const densityScale = computeDensityScale();
    const treeCount = Math.round(BASE_TREE_POINTS * densityScale);
    const garlandTotal = Math.round(BASE_GARLAND_POINTS * densityScale);
    const goldenGarlandCount = Math.round(garlandTotal * 0.45);
    const garlandCount = Math.max(0, garlandTotal - goldenGarlandCount);
    const groundCount = Math.round(BASE_GROUND_POINTS * densityScale);
    const starCount = Math.round(BASE_STAR_POINTS * densityScale);
    const heartCount = Math.round(BASE_HEART_POINTS * densityScale);

    initNeedleTiles();
    branchSprites = genBranchSprites(densityScale);

    treePoints = genTreePoints(treeCount);
    garlandPoints = genSecondaryGarland(garlandCount);
    goldenGarlandPoints = genGoldenGarland(goldenGarlandCount);
    groundPoints = genGroundPoints(groundCount);
    starPoints = genStarPoints(starCount);
    heartPoints = genHeartPoints(heartCount);
    outsideOrnaments = genOutsideOrnaments(densityScale);
    bokehCircles = genBokehCircles(densityScale);

    const estimatedSparkles = MAX_SPARKLES;
    const ornamentCount = outsideOrnaments.length;
    drawList = new Array(treeCount + garlandTotal + groundCount + starCount + heartCount + ornamentCount + estimatedSparkles);
    snowFlakes = initSnow2D(getCurrentSnowCount());
    lastTimestamp = performance.now();
  }

  window.addEventListener("resize", resizeCanvasAndRebuild);
  // ================== Rendering helpers ==================
  function clear() {
    ctx.save();
    const grad = ctx.createLinearGradient(0, 0 + parallaxOffsetY * -0.1, 0, viewHeight + parallaxOffsetY * 0.2);
    grad.addColorStop(0.0, "#010307");
    grad.addColorStop(0.45, `rgb(${DEEP_NAVY.r}, ${DEEP_NAVY.g}, ${DEEP_NAVY.b})`);
    grad.addColorStop(1.0, `rgb(${NIGHT_SKY.r}, ${NIGHT_SKY.g}, ${NIGHT_SKY.b})`);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    // Very subtle aurora band
    const bandHeight = viewHeight * 0.1;
    const bandY = viewHeight * 0.28 + parallaxOffsetY * 0.2;
    const bandX = parallaxOffsetX * 0.25;
    const auroraGrad = ctx.createLinearGradient(0, bandY, 0, bandY + bandHeight);
    auroraGrad.addColorStop(0.0, "rgba(136,201,255,0.0)");
    auroraGrad.addColorStop(0.5, "rgba(191,231,255,0.03)");
    auroraGrad.addColorStop(1.0, "rgba(136,201,255,0.0)");
    ctx.fillStyle = auroraGrad;
    ctx.fillRect(bandX - viewWidth * 0.05, bandY, viewWidth * 1.1, bandHeight);

    ctx.restore();
  }

  function buildTreeSilhouette() {
    silhouetteRight.length = 0;
    silhouetteLeft.length = 0;
    silhouetteMinY = Infinity;
    silhouetteMaxY = -Infinity;

    const sampleCount = SILHOUETTE_SAMPLES;
    if (!viewWidth || !viewHeight || sampleCount <= 0) return;

    for (let i = 0; i < sampleCount; i++) {
      const t = sampleCount === 1 ? 0.0 : i / (sampleCount - 1);
      const hNorm = 1.0 - t;
      const y = TREE_HEIGHT * hNorm + 0.2;
      const radius = treeEnvelopeRadiusAtHeight(hNorm) * 1.08;

      const pr = projectPoint(radius, y, 0, angle);
      const pl = projectPoint(-radius, y, 0, angle);
      if (!pr || !pl) continue;

      const offXLeft = pr.sx < -viewWidth * 0.6 && pl.sx < -viewWidth * 0.6;
      const offXRight = pr.sx > viewWidth * 1.6 && pl.sx > viewWidth * 1.6;
      const offYTop = pr.sy < -viewHeight * 0.6 && pl.sy < -viewHeight * 0.6;
      const offYBottom = pr.sy > viewHeight * 1.6 && pl.sy > viewHeight * 1.6;
      if (offXLeft || offXRight || offYTop || offYBottom) continue;

      let right = pr;
      let left = pl;
      if (pr.sx < pl.sx) {
        right = pl;
        left = pr;
      }

      silhouetteRight.push({ x: right.sx, y: right.sy });
      silhouetteLeft.push({ x: left.sx, y: left.sy });

      if (right.sy < silhouetteMinY) silhouetteMinY = right.sy;
      if (left.sy < silhouetteMinY) silhouetteMinY = left.sy;
      if (right.sy > silhouetteMaxY) silhouetteMaxY = right.sy;
      if (left.sy > silhouetteMaxY) silhouetteMaxY = left.sy;
    }
  }

  function drawTreeSilhouette() {
    buildTreeSilhouette();
    if (silhouetteRight.length < 2 || silhouetteLeft.length < 2) return;

    const topY = silhouetteMinY;
    const bottomY = silhouetteMaxY;
    if (!isFinite(topY) || !isFinite(bottomY) || bottomY <= topY) return;

    const topColor = lerpColor(EVERGREEN_MID, EVERGREEN_HI, 0.7);
    const midColor = EVERGREEN_MID;
    const baseColor = EVERGREEN_DARK;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1.0;

    const grad = ctx.createLinearGradient(0, topY, 0, bottomY);
    grad.addColorStop(0.0, `rgb(${topColor.r}, ${topColor.g}, ${topColor.b})`);
    grad.addColorStop(0.45, `rgb(${midColor.r}, ${midColor.g}, ${midColor.b})`);
    grad.addColorStop(1.0, `rgb(${baseColor.r}, ${baseColor.g}, ${baseColor.b})`);

    ctx.beginPath();
    const first = silhouetteRight[0];
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < silhouetteRight.length; i++) {
      const p = silhouetteRight[i];
      ctx.lineTo(p.x, p.y);
    }
    for (let i = silhouetteLeft.length - 1; i >= 0; i--) {
      const p = silhouetteLeft[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // soft internal highlights
    ctx.globalCompositeOperation = "screen";
    const maxSide = Math.max(viewWidth, viewHeight);
    const midIndex = Math.floor(silhouetteRight.length * 0.45);
    const lowIndex = Math.floor(silhouetteRight.length * 0.8);
    const midP = silhouetteRight[midIndex] || silhouetteRight[Math.floor(silhouetteRight.length / 2)] || first;
    const lowP = silhouetteRight[lowIndex] || silhouetteRight[silhouetteRight.length - 1] || first;

    const hl1R = maxSide * 0.16;
    const hl2R = maxSide * 0.22;

    let grad1 = ctx.createRadialGradient(midP.x, midP.y, 0, midP.x, midP.y, hl1R);
    grad1.addColorStop(0.0, "rgba(255,255,255,0.14)");
    grad1.addColorStop(1.0, "rgba(255,255,255,0)");
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = grad1;
    ctx.beginPath();
    ctx.arc(midP.x, midP.y, hl1R, 0, Math.PI * 2);
    ctx.fill();

    const icy = EVERGREEN_HI;
    let grad2 = ctx.createRadialGradient(lowP.x, lowP.y, 0, lowP.x, lowP.y, hl2R);
    grad2.addColorStop(0.0, `rgba(${icy.r}, ${icy.g}, ${icy.b}, 0.16)`);
    grad2.addColorStop(1.0, `rgba(${icy.r}, ${icy.g}, ${icy.b}, 0)`);
    ctx.fillStyle = grad2;
    ctx.beginPath();
    ctx.arc(lowP.x, lowP.y, hl2R, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawTrunk() {
    if (silhouetteRight.length < 2 || silhouetteLeft.length < 2) return;
    const baseRight = silhouetteRight[silhouetteRight.length - 1];
    const baseLeft = silhouetteLeft[silhouetteLeft.length - 1];
    const baseY = (baseRight.y + baseLeft.y) * 0.5;
    const topY = baseY - (silhouetteMaxY - silhouetteMinY) * 0.35;

    const width = (baseRight.x - baseLeft.x) * 0.18;
    if (!isFinite(width) || width <= 2) return;
    const cx = (baseRight.x + baseLeft.x) * 0.5;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.96;

    const grad = ctx.createLinearGradient(0, topY, 0, baseY);
    grad.addColorStop(0.0, `rgb(${TRUNK_LIGHT.r}, ${TRUNK_LIGHT.g}, ${TRUNK_LIGHT.b})`);
    grad.addColorStop(0.4, `rgb(${TRUNK_MID.r}, ${TRUNK_MID.g}, ${TRUNK_MID.b})`);
    grad.addColorStop(1.0, `rgb(${TRUNK_DARK.r}, ${TRUNK_DARK.g}, ${TRUNK_DARK.b})`);

    const halfW = width * 0.5;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(cx - halfW, topY, width, baseY - topY, width * 0.25);
    ctx.fill();

    // bark lines
    ctx.strokeStyle = "rgba(20,10,4,0.5)";
    ctx.lineWidth = Math.max(1, width * 0.08);
    for (let i = -1; i <= 1; i++) {
      const ox = cx + i * width * 0.22;
      ctx.beginPath();
      ctx.moveTo(ox, topY + (baseY - topY) * 0.1);
      ctx.lineTo(ox + width * 0.06 * i, baseY - (baseY - topY) * 0.08);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBranchSprites() {
    if (!branchSprites.length || !needleTiles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";

    for (let i = 0; i < branchSprites.length; i++) {
      const s = branchSprites[i];
      const proj = projectPoint(s.x, s.y, s.z, angle);
      if (!proj) continue;
      const depth = proj.depth;
      if (depth <= 0.1) continue;

      const K = viewHeight * 1.55;
      let width = (s.size * K) / depth;
      if (width < 6) continue;
      if (width > viewWidth * 0.45) width = viewWidth * 0.45;
      const height = width * 0.55;

      const group = needleTiles[s.group];
      if (!group) continue;
      const tile = group[s.variant] || group[0];
      if (!tile) continue;

      ctx.save();
      ctx.translate(proj.sx, proj.sy);
      ctx.rotate(s.rot);
      const alpha = clamp(s.alpha * (0.6 + 0.4 * (1 - festiveEase)), 0.3, 1.0);
      ctx.globalAlpha = alpha;
      ctx.drawImage(tile, -width / 2, -height * 0.4, width, height);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawStarShape(cx, cy, outerR, innerR, color, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
    ctx.beginPath();
    const spikes = 5;
    let rot = -Math.PI / 2;
    const step = Math.PI / spikes;
    ctx.moveTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    for (let i = 0; i < spikes; i++) {
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawSparkle2D(cx, cy, radius, color, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 1)`;
    ctx.lineWidth = Math.max(1, radius * 0.35);
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    ctx.globalAlpha *= 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.6)`;
    ctx.fill();
    ctx.restore();
  }

  function drawCandyCane(cx, cy, size, alpha) {
    const h = size * 3.0;
    const w = size * 0.9;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.translate(cx, cy);
    ctx.globalAlpha = alpha;

    const radius = w * 0.5;
    const top = -h * 0.5;
    const bottom = h * 0.5;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.moveTo(-radius, top + radius);
    ctx.arcTo(-radius, top, radius, top, radius);
    ctx.arcTo(radius, top, radius, top + radius, radius);
    ctx.lineTo(radius, bottom - radius);
    ctx.arcTo(radius, bottom, -radius, bottom, radius);
    ctx.arcTo(-radius, bottom, -radius, bottom - radius, radius);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(220,60,70,0.95)";
    ctx.lineWidth = w * 0.55;
    const stripeStep = h * 0.35;
    for (let y = -h * 0.6; y <= h * 0.6; y += stripeStep) {
      ctx.beginPath();
      ctx.moveTo(-w, y - stripeStep * 0.3);
      ctx.lineTo(w, y + stripeStep * 0.3);
      ctx.stroke();
    }

    ctx.globalAlpha = alpha * 0.6;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = w * 0.15;
    ctx.beginPath();
    ctx.moveTo(-w * 0.3, top + radius * 0.6);
    ctx.lineTo(-w * 0.3, bottom - radius * 0.6);
    ctx.stroke();

    ctx.restore();
  }

  function drawSnowflakeOrnament(cx, cy, size, color, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 1)`;
    ctx.lineWidth = Math.max(1, size * 0.18);
    const r1 = size;
    const r2 = size * 0.55;

    ctx.beginPath();
    ctx.moveTo(cx - r1, cy);
    ctx.lineTo(cx + r1, cy);
    ctx.moveTo(cx, cy - r1);
    ctx.lineTo(cx, cy + r1);
    ctx.moveTo(cx - r2, cy - r2);
    ctx.lineTo(cx + r2, cy + r2);
    ctx.moveTo(cx - r2, cy + r2);
    ctx.lineTo(cx + r2, cy - r2);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.7;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.8)`;
    ctx.fill();

    ctx.restore();
  }

  function drawBokehLayer(layer) {
    if (!bokehCircles || !bokehCircles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < bokehCircles.length; i++) {
      const c = bokehCircles[i];
      if (layer && c.layer !== layer) continue;

      const depthFactor = c.layer === "front" ? 0.35 : 0.18;
      const bx = c.x + parallaxOffsetX * depthFactor;
      const by = c.y + parallaxOffsetY * depthFactor;
      const radius = c.radius;
      const color = c.color;
      const alpha = c.alpha;

      const grad = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
      grad.addColorStop(0.0, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`);
      grad.addColorStop(0.55, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.55})`);
      grad.addColorStop(1.0, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBaseGlow() {
    const proj = projectPoint(0, 0.0, 0, angle);
    const cx = proj ? proj.sx : viewWidth / 2;
    const cy = proj ? proj.sy : viewHeight * 0.78;
    const maxSide = Math.max(viewWidth, viewHeight);
    const baseR = maxSide * 0.18;
    const intensity = 0.8 + 0.5 * festiveEase;

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      const r = baseR * (0.7 + 0.35 * t);
      const phase = baseGlowPhase * (0.8 + 0.25 * i) + i * 2.3;
      const ox = Math.cos(phase) * baseR * 0.08 * (1 - 0.25 * i);
      const oy = Math.sin(phase) * baseR * 0.04 * (1 - 0.25 * i);
      const x = cx + ox;
      const y = cy + oy;

      const innerColor = GOLD_SOFT;
      const outerColor = GOLD_DEEP;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0.0, `rgba(${innerColor.r}, ${innerColor.g}, ${innerColor.b}, ${0.9 - 0.25 * i})`);
      grad.addColorStop(0.6, `rgba(${outerColor.r}, ${outerColor.g}, ${outerColor.b}, ${0.45 - 0.18 * i})`);
      grad.addColorStop(1.0, `rgba(${outerColor.r}, ${outerColor.g}, ${outerColor.b}, 0)`);

      ctx.globalAlpha = intensity * (0.85 - 0.25 * i);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawGroundSanta() {
    if (santaGroundTimeLeft <= 0) return;
    const proj = projectPoint(0, 0.0, 0, angle);
    if (!proj) return;

    const baseX = proj.sx + viewWidth * 0.09;
    const baseY = proj.sy - viewHeight * 0.08;

    const total = 3.0;
    const remaining = santaGroundTimeLeft;
    const age = total - remaining;
    let alpha = 0.95;
    const fade = 0.4;
    if (age < fade) alpha *= age / fade;
    else if (remaining < fade) alpha *= remaining / fade;
    alpha = clamp(alpha, 0, 0.95);
    if (alpha <= 0) return;

    const size = Math.max(20, viewHeight * 0.06);
    const bodyH = size * 1.1;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.translate(baseX, baseY);
    ctx.globalAlpha = alpha;

    ctx.fillStyle = "rgba(210,40,60,1)";
    ctx.beginPath();
    ctx.moveTo(-size * 0.4, 0);
    ctx.lineTo(size * 0.4, 0);
    ctx.lineTo(size * 0.35, bodyH);
    ctx.lineTo(-size * 0.35, bodyH);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(250,248,245,1)";
    ctx.fillRect(-size * 0.42, bodyH * 0.65, size * 0.84, bodyH * 0.15);

    ctx.beginPath();
    ctx.arc(0, -size * 0.25, size * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,239,220,1)";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-size * 0.35, -size * 0.35);
    ctx.lineTo(size * 0.05, -size * 0.98);
    ctx.lineTo(size * 0.35, -size * 0.35);
    ctx.closePath();
    ctx.fillStyle = "rgba(210,40,60,1)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size * 0.05, -size * 1.02, size * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(250,248,245,1)";
    ctx.fill();

    const wave = Math.sin(time * 4.0) * 0.5;
    ctx.strokeStyle = "rgba(210,40,60,1)";
    ctx.lineWidth = size * 0.14;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(-size * 0.3, bodyH * 0.25);
    ctx.lineTo(-size * 0.8, bodyH * 0.1);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(size * 0.3, bodyH * 0.3);
    ctx.lineTo(size * 0.7, bodyH * (0.15 - 0.2 * wave));
    ctx.stroke();

    ctx.restore();
  }

  function drawCoreBloom() {
    const mid = projectPoint(0, TREE_HEIGHT * 0.6, 0, angle);
    if (!mid) return;
    const maxSide = Math.max(viewWidth, viewHeight);
    const outerR = maxSide * 0.26;
    const innerR = outerR * 0.52;
    const boost = 0.5 + 0.7 * festiveEase;

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const c1 = EVERGREEN_HI;
    let grad1 = ctx.createRadialGradient(mid.sx, mid.sy, 0, mid.sx, mid.sy, outerR);
    grad1.addColorStop(0.0, `rgba(${c1.r}, ${c1.g}, ${c1.b}, ${0.12 * boost})`);
    grad1.addColorStop(1.0, `rgba(${c1.r}, ${c1.g}, ${c1.b}, 0)`);
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = grad1;
    ctx.beginPath();
    ctx.arc(mid.sx, mid.sy, outerR, 0, Math.PI * 2);
    ctx.fill();

    const low = projectPoint(0, TREE_HEIGHT * 0.25, 0, angle) || mid;
    const gx = low.sx;
    const gy = low.sy;
    const c2 = GOLD_LIGHT;
    let grad2 = ctx.createRadialGradient(gx, gy, 0, gx, gy, innerR);
    grad2.addColorStop(0.0, `rgba(${c2.r}, ${c2.g}, ${c2.b}, ${0.16 * boost})`);
    grad2.addColorStop(1.0, `rgba(${c2.r}, ${c2.g}, ${c2.b}, 0)`);
    ctx.fillStyle = grad2;
    ctx.beginPath();
    ctx.arc(gx, gy, innerR, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ================== Sleigh drawing ==================
  function drawSleighSilhouette(cx, cy, scale) {
    const baseSize = Math.max(26, viewHeight * 0.04) * scale;
    const bodyW = baseSize * 1.8;
    const bodyH = baseSize * 0.7;
    const deerOffsetX = -baseSize * 1.8;
    const deerH = baseSize * 1.1;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = "screen";

    const glowR = baseSize * 2.4;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
    grad.addColorStop(0.0, `rgba(${GOLD_SOFT.r}, ${GOLD_SOFT.g}, ${GOLD_SOFT.b}, 0.9)`);
    grad.addColorStop(1.0, `rgba(${GOLD_SOFT.r}, ${GOLD_SOFT.g}, ${GOLD_SOFT.b}, 0)`);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.95;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(40,18,8,1)";
    ctx.lineWidth = baseSize * 0.18;
    ctx.fillStyle = `rgba(${GOLD_DEEP.r}, ${GOLD_DEEP.g}, ${GOLD_DEEP.b}, 0.95)`;

    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.2, -bodyH * 0.2);
    ctx.lineTo(bodyW * 0.5, -bodyH * 0.2);
    ctx.quadraticCurveTo(bodyW * 0.7, 0, bodyW * 0.4, bodyH * 0.35);
    ctx.lineTo(-bodyW * 0.6, bodyH * 0.35);
    ctx.quadraticCurveTo(-bodyW * 0.9, bodyH * 0.2, -bodyW * 0.85, bodyH * 0.45);
    ctx.quadraticCurveTo(-bodyW * 0.5, bodyH * 0.55, -bodyW * 0.2, bodyH * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.15, -bodyH * 0.2);
    ctx.quadraticCurveTo(bodyW * 0.25, -bodyH * 0.65, bodyW * 0.5, -bodyH * 0.4);
    ctx.strokeStyle = `rgba(${GOLD_SOFT.r}, ${GOLD_SOFT.g}, ${GOLD_SOFT.b}, 0.95)`;
    ctx.lineWidth = baseSize * 0.09;
    ctx.stroke();

    ctx.strokeStyle = `rgba(${GOLD_SOFT.r}, ${GOLD_SOFT.g}, ${GOLD_SOFT.b}, 0.8)`;
    ctx.lineWidth = baseSize * 0.07;
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.8, bodyH * 0.55);
    ctx.quadraticCurveTo(-bodyW * 0.4, bodyH * 0.9, -bodyW * 0.1, bodyH * 0.7);
    ctx.quadraticCurveTo(bodyW * 0.4, bodyH * 0.9, bodyW * 0.8, bodyH * 0.6);
    ctx.stroke();

    ctx.save();
    ctx.translate(deerOffsetX, -deerH * 0.2);
    ctx.scale(0.9, 0.9);
    ctx.strokeStyle = "rgba(40,18,8,1)";
    ctx.fillStyle = "rgba(60,30,18,1)";
    ctx.lineWidth = baseSize * 0.12;

    ctx.beginPath();
    ctx.moveTo(-baseSize * 0.1, 0);
    ctx.lineTo(baseSize * 0.4, 0);
    ctx.lineTo(baseSize * 0.55, -deerH * 0.2);
    ctx.lineTo(-baseSize * 0.05, -deerH * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(baseSize * 0.45, -deerH * 0.2);
    ctx.lineTo(baseSize * 0.55, -deerH * 0.55);
    ctx.lineTo(baseSize * 0.8, -deerH * 0.6);
    ctx.lineTo(baseSize * 0.7, -deerH * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = `rgba(${GOLD_SOFT.r}, ${GOLD_SOFT.g}, ${GOLD_SOFT.b}, 0.9)`;
    ctx.lineWidth = baseSize * 0.07;
    ctx.beginPath();
    ctx.moveTo(baseSize * 0.7, -deerH * 0.58);
    ctx.lineTo(baseSize * 0.9, -deerH * 0.9);
    ctx.moveTo(baseSize * 0.75, -deerH * 0.7);
    ctx.lineTo(baseSize * 0.92, -deerH * 0.94);
    ctx.moveTo(baseSize * 0.65, -deerH * 0.66);
    ctx.lineTo(baseSize * 0.78, -deerH * 0.92);
    ctx.stroke();

    ctx.strokeStyle = "rgba(40,18,8,1)";
    ctx.lineWidth = baseSize * 0.09;
    ctx.beginPath();
    ctx.moveTo(baseSize * 0.05, 0);
    ctx.lineTo(baseSize * 0.05, deerH * 0.4);
    ctx.moveTo(baseSize * 0.3, 0);
    ctx.lineTo(baseSize * 0.3, deerH * 0.4);
    ctx.stroke();

    ctx.restore();
    ctx.restore();
  }

  function drawSleighCameo2D() {
    if (!sleighEnabled || !sleighCameoPos || sleighCameoTimeLeft <= 0) return;
    const pos = sleighCameoPos;
    const proj = projectPoint(pos.x, pos.y, pos.z, angle);
    if (!proj) return;
    const depth = proj.depth * 0.9;
    const scale = clamp(14 / depth, 1.3, 2.4);
    drawSleighSilhouette(proj.sx, proj.sy, scale);
  }

  function drawSleigh2D() {
    if (!sleighEnabled) return;
    if (!sleighActive && sleighBoostTrailTime <= 0) {
      sleighScreenVisible = false;
      return;
    }

    const t = clamp(sleighProgress, 0, 1);
    const pos = getSleighWorldPosition(t);
    const proj = projectPoint(pos.x, pos.y, pos.z, angle);
    if (!proj) {
      sleighScreenVisible = false;
      return;
    }

    const depth = proj.depth * 0.9;
    const scale = clamp(14 / depth, 1.2, 2.3);
    sleighScreenVisible = true;
    sleighScreenX = proj.sx;
    sleighScreenY = proj.sy;
    drawSleighSilhouette(proj.sx, proj.sy, scale);
  }

  function drawTexts() {
    ctx.save();
    ctx.fillStyle = "#eef6ff";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const baseFontSize = 45;
    const scale = clamp(viewWidth / 1600, 0.7, 1.1);
    const fontSize = baseFontSize * scale;

    ctx.font = `${fontSize}px "Great Vibes", "Monotype Corsiva", "Dancing Script", cursive`;
    ctx.shadowColor = "rgba(191, 231, 255, 0.85)";
    ctx.shadowBlur = 25 * scale;

    const x = 40 * scale;
    const y1 = viewHeight / 3;
    ctx.fillText("Merry Christmas", x, y1);

    ctx.restore();
  }

  function drawTopStar() {
    const proj = projectPoint(0, TREE_HEIGHT + 0.45, 0, angle);
    if (!proj) return;

    const baseSize = Math.max(10, viewHeight * 0.025);
    const pulse = (Math.sin(time * 1.8) + 1) / 2;
    const size = baseSize * (0.9 + 0.25 * pulse + 0.35 * festiveEase);
    const alpha = 0.7 + 0.25 * pulse;

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const haloR = size * 2.6;
    const haloGrad = ctx.createRadialGradient(proj.sx, proj.sy, 0, proj.sx, proj.sy, haloR);
    haloGrad.addColorStop(0.0, `rgba(${GOLD_SOFT.r}, ${GOLD_SOFT.g}, ${GOLD_SOFT.b}, 1.0)`);
    haloGrad.addColorStop(1.0, `rgba(${GOLD_SOFT.r}, ${GOLD_SOFT.g}, ${GOLD_SOFT.b}, 0)`);
    ctx.globalAlpha = 0.55 * alpha;
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(proj.sx, proj.sy, haloR, 0, Math.PI * 2);
    ctx.fill();

    const starColor = GOLD_LIGHT;
    drawStarShape(proj.sx, proj.sy, size, size * 0.45, starColor, 0.95 * alpha);

    const spokes = 8;
    const longR = size * 2.8;
    const shortR = size * 1.6;
    ctx.globalAlpha = 0.35 * alpha;
    ctx.strokeStyle = `rgba(${GOLD_SOFT.r}, ${GOLD_SOFT.g}, ${GOLD_SOFT.b}, 1)`;
    ctx.lineWidth = Math.max(1.0, size * 0.08);
    ctx.beginPath();
    for (let i = 0; i < spokes; i++) {
      const ang = (Math.PI * 2 * i) / spokes + time * 0.15;
      const inner = size * 0.6;
      const outer = i % 2 === 0 ? longR : shortR;
      ctx.moveTo(proj.sx + Math.cos(ang) * inner, proj.sy + Math.sin(ang) * inner);
      ctx.lineTo(proj.sx + Math.cos(ang) * outer, proj.sy + Math.sin(ang) * outer);
    }
    ctx.stroke();

    ctx.restore();
  }

  function isPointNearTopStar(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const proj = projectPoint(0, TREE_HEIGHT + 0.45, 0, angle);
    if (!proj) return false;
    const dx = x - proj.sx;
    const dy = y - proj.sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const threshold = Math.max(40, viewWidth * 0.03);
    return dist <= threshold;
  }

  function isPointNearSleigh(clientX, clientY) {
    if (!sleighEnabled) return false;
    if (!sleighActive && sleighBoostTrailTime <= 0) return false;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    if (!sleighScreenVisible) {
      const t = clamp(sleighProgress, 0, 1);
      const pos = getSleighWorldPosition(t);
      const proj = projectPoint(pos.x, pos.y, pos.z, angle);
      if (!proj) return false;
      sleighScreenX = proj.sx;
      sleighScreenY = proj.sy;
      sleighScreenVisible = true;
    }

    const dx = x - sleighScreenX;
    const dy = y - sleighScreenY;
    const distSq = dx * dx + dy * dy;
    const baseRadius = Math.max(viewHeight * 0.06, 40);
    return distSq <= baseRadius * baseRadius;
  }

  // ================== Hints ==================
  function pushHint(text, lifetime) {
    hints.push({ text, createdAt: time, lifetime });
  }

  function ensureInitialHints() {
    if (hasShownFirstHint) return;
    hasShownFirstHint = true;
    pushHint("点击画面进入 5 秒节日模式，拖拽可调节旋转速度", 6.5);
    pushHint("Space 暂停 · T 闪烁强度 · S 雪花多少 · M 开关音乐", 7.0);
  }

  function drawHints() {
    if (!hints.length) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const baseFontSize = 15;
    const scale = clamp(viewWidth / 1200, 0.8, 1.2);
    ctx.font = `${baseFontSize * scale}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

    let y = viewHeight * 0.12;
    for (let i = 0; i < hints.length; i++) {
      const h = hints[i];
      const age = time - h.createdAt;
      if (age >= h.lifetime) continue;
      let alpha = 0.9;
      const fadeIn = 0.6;
      const fadeOut = 1.0;
      if (age < fadeIn) alpha *= age / fadeIn;
      else if (age > h.lifetime - fadeOut) alpha *= (h.lifetime - age) / fadeOut;
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(238,246,255,0.96)";
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 10;
      ctx.fillText(h.text, viewWidth / 2, y);
      y += 26 * scale;
    }

    ctx.restore();
    hints = hints.filter((h) => time - h.createdAt < h.lifetime);
  }

  // ================== 3D draw list & rendering ==================
  function render3DScene() {
    let writeIndex = 0;

    const festiveBoost = festiveEase;
    const twinkleScale = twinkleIntensity * (1.0 + 0.6 * festiveBoost);
    const pulseTime = time * (1.0 + 0.8 * festiveBoost);

    function pushPoint(p) {
      const proj = projectPoint(p.x, p.y, p.z, angle);
      if (!proj) return;
      let sizeBase = 3.6 - proj.depth * 0.13;
      if (p.sizeScale) sizeBase *= p.sizeScale;
      if (sizeBase <= 0) return;

      let item = drawList[writeIndex];
      if (!item) {
        item = drawList[writeIndex] = {
          depth: 0,
          sx: 0,
          sy: 0,
          size: 0,
          color: { r: 0, g: 0, b: 0 },
          isBauble: false,
          isRibbon: false,
          isGoldGarland: false,
          isSparkle: false,
          shape: "dot",
          alpha: 1.0,
          hasAnchor: false,
          anchorSX: 0,
          anchorSY: 0,
          stringColor: null,
        };
      }

      let depth = proj.depth;
      let anchorProj = null;
      let hasAnchor = false;
      if (
        typeof p.anchorX === "number" &&
        typeof p.anchorY === "number" &&
        typeof p.anchorZ === "number"
      ) {
        anchorProj = projectPoint(p.anchorX, p.anchorY, p.anchorZ, angle);
        if (anchorProj) {
          depth = Math.min(depth, anchorProj.depth);
          hasAnchor = true;
        }
      }
      if (typeof p.depthBias === "number" && isFinite(p.depthBias)) {
        depth += p.depthBias;
      }

      item.depth = depth;
      item.sx = proj.sx;
      item.sy = proj.sy;
      item.size = Math.max(1, sizeBase);
      item.color.r = p.color.r;
      item.color.g = p.color.g;
      item.color.b = p.color.b;
      item.isBauble = !!p.isBauble;
      item.isRibbon = !!p.isRibbon;
      item.isGoldGarland = !!p.isGoldGarland;
      item.isSparkle = !!p.maxLife;
      item.shape = p.shape || (item.isBauble ? "bauble" : "dot");
      item.alpha = 1.0;

      if (hasAnchor && anchorProj) {
        item.hasAnchor = true;
        item.anchorSX = anchorProj.sx;
        item.anchorSY = anchorProj.sy;
      } else {
        item.hasAnchor = false;
      }
      if (p.stringColor) item.stringColor = p.stringColor;
      else item.stringColor = null;

      if (p.twinkle) {
        const factor = (Math.sin(pulseTime * p.twinkle.speed + p.twinkle.offset) + 1) / 2;
        const amplitude = (p.twinkle.max_bright - 1.0) * twinkleScale;
        const brightness = 1.0 + factor * amplitude;
        item.color.r = clamp(Math.round(item.color.r * brightness), 0, 255);
        item.color.g = clamp(Math.round(item.color.g * brightness), 0, 255);
        item.color.b = clamp(Math.round(item.color.b * brightness), 0, 255);
      }

      if (p.pulse) {
        const factor = (Math.sin(pulseTime * p.pulse.speed + p.pulse.offset) + 1) / 2;
        const brightness =
          lerp(p.pulse.min_bright, p.pulse.max_bright, factor) * (1.0 + 0.5 * festiveBoost);
        item.color.r = clamp(Math.round(item.color.r * brightness), 0, 255);
        item.color.g = clamp(Math.round(item.color.g * brightness), 0, 255);
        item.color.b = clamp(Math.round(item.color.b * brightness), 0, 255);
      }

      if (p.maxLife) {
        const lifeRatio = p.life > 0 ? clamp(p.life / p.maxLife, 0, 1) : 0;
        let alpha = lifeRatio < 0.3 ? lifeRatio / 0.3 : 1.0 - (lifeRatio - 0.3) / 0.7;
        alpha = clamp(alpha, 0, 1);
        item.alpha = alpha;
        item.size = item.size * (1.2 + (1 - lifeRatio) * 0.6);
      }

      writeIndex++;
    }

    for (let i = 0; i < treePoints.length; i++) pushPoint(treePoints[i]);
    for (let i = 0; i < garlandPoints.length; i++) pushPoint(garlandPoints[i]);
    for (let i = 0; i < goldenGarlandPoints.length; i++) pushPoint(goldenGarlandPoints[i]);
    for (let i = 0; i < groundPoints.length; i++) pushPoint(groundPoints[i]);
    for (let i = 0; i < starPoints.length; i++) pushPoint(starPoints[i]);
    for (let i = 0; i < heartPoints.length; i++) pushPoint(heartPoints[i]);
    for (let i = 0; i < outsideOrnaments.length; i++) pushPoint(outsideOrnaments[i]);
    for (let i = 0; i < sparklePoints.length; i++) pushPoint(sparklePoints[i]);

    drawList.length = writeIndex;
    drawList.sort((a, b) => b.depth - a.depth);

    ctx.save();
    for (let i = 0; i < drawList.length; i++) {
      const item = drawList[i];
      const { sx, sy, size, color, alpha } = item;
      if (sx < -10 || sx > viewWidth + 10 || sy < -10 || sy > viewHeight + 10) continue;
      const a = alpha != null ? alpha : 1.0;

      if (item.shape === "bauble" || item.isBauble) {
        const outerR = size * 1.6;
        const midR = size * 1.15;
        const innerR = size * 0.65;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.55 * a;
        ctx.fillStyle = "rgba(136,201,255,0.65)";
        ctx.beginPath();
        ctx.arc(sx, sy, outerR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9 * a;
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`;
        ctx.beginPath();
        ctx.arc(sx, sy, midR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0 * a;
        ctx.fillStyle = "rgba(238,246,255,1.0)";
        ctx.beginPath();
        ctx.arc(sx, sy, innerR, 0, Math.PI * 2);
        ctx.fill();
        const highlightR = size * 0.55;
        ctx.globalAlpha = 1.0 * a;
        ctx.fillStyle = "rgba(255,255,255,1.0)";
        ctx.beginPath();
        ctx.arc(sx - size * 0.8, sy - size * 0.8, highlightR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (item.shape === "starlet") {
        const outerR = size * 1.7;
        const innerR = outerR * 0.45;
        drawStarShape(sx, sy, outerR, innerR, color, 0.9 * a);
      } else if (
        item.shape === "outsideCandy" ||
        item.shape === "outsideSnowflake" ||
        item.shape === "outsideBauble"
      ) {
        if (item.hasAnchor && item.anchorSX != null && item.anchorSY != null) {
          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          const sc = item.stringColor || { r: 210, g: 220, b: 238 };
          const lineAlpha = 0.7 * a;
          ctx.strokeStyle = `rgba(${sc.r}, ${sc.g}, ${sc.b}, ${lineAlpha})`;
          ctx.lineWidth = Math.max(1, size * 0.35);
          ctx.beginPath();
          ctx.moveTo(item.anchorSX, item.anchorSY);
          ctx.lineTo(sx, sy - size * 0.9);
          ctx.stroke();
          ctx.restore();
        }
        if (item.shape === "outsideCandy") {
          drawCandyCane(sx, sy, size * 1.1, a);
        } else if (item.shape === "outsideSnowflake") {
          const flakeSize = size * 1.7;
          drawSnowflakeOrnament(sx, sy, flakeSize, color, a);
        } else {
          const outerR = size * 1.7;
          const midR = size * 1.25;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.5 * a;
          ctx.beginPath();
          ctx.arc(sx, sy, outerR, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`;
          ctx.fill();
          ctx.globalAlpha = 0.95 * a;
          ctx.beginPath();
          ctx.arc(sx, sy, midR, 0, Math.PI * 2);
          ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
          ctx.fill();
          ctx.globalAlpha = 1.0 * a;
          ctx.beginPath();
          ctx.arc(sx - size * 0.6, sy - size * 0.7, size * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          ctx.fill();
          ctx.restore();
        }
      } else if (item.shape === "candy") {
        drawCandyCane(sx, sy, size, a);
      } else if (item.shape === "goldGarland" || item.isGoldGarland) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const glowR = size * 2.4;
        const coreR = size * 0.95;
        ctx.globalAlpha = 0.35 * a;
        ctx.beginPath();
        ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.85)`;
        ctx.fill();
        ctx.globalAlpha = 0.95 * a;
        ctx.beginPath();
        ctx.arc(sx, sy, coreR, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
        ctx.fill();
        ctx.globalAlpha = 0.95 * a;
        ctx.beginPath();
        ctx.arc(sx - size * 0.45, sy - size * 0.45, size * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,244,225,0.96)";
        ctx.fill();
        ctx.restore();
      } else if (item.isRibbon) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = (0.32 + 0.38 * festiveBoost) * a;
        const radiusX = size * 3.0;
        const radiusY = size * 1.1;
        ctx.beginPath();
        ctx.ellipse(sx, sy, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 1.0)`;
        ctx.fill();
        ctx.restore();
      } else if (item.isSparkle) {
        drawSparkle2D(sx, sy, size * 0.9, color, a);
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = a;
        ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function renderFrame() {
    clear();
    drawBokehLayer("back");
    drawBaseGlow();
    drawTreeSilhouette();
    drawTrunk();
    drawBranchSprites();
    render3DScene();
    drawCoreBloom();
    drawTopStar();
    drawSleighCameo2D();
    drawSleigh2D();
    drawBokehLayer("front");
    drawGroundSanta();
    drawTexts();
    drawSnow2D();
    drawHints();
  }

  // ================== Main loop ==================
  function loop(timestamp) {
    const dt = (timestamp - lastTimestamp) / 1000.0;
    lastTimestamp = timestamp;

    if (!running) {
      requestAnimationFrame(loop);
      return;
    }

    const safeDt = dt > 0 ? Math.min(dt, 0.05) : 0.0;

    time += safeDt;
    baseGlowPhase += safeDt * 0.7;
    updateSnow2D(safeDt);
    updateSparkles(safeDt);
    updateSleigh(safeDt);
    updateInteractiveState(safeDt);

    const baseSpin = 0.0045;
    const extraSpin = dragSpinVelocity;
    const festiveSpin = festiveEase * 0.0015;
    angle += baseSpin + extraSpin + festiveSpin;
    dragSpinVelocity *= 0.96;

    renderFrame();

    requestAnimationFrame(loop);
  }

  document.addEventListener("visibilitychange", () => {
    isPageHidden = document.hidden;
    updateRunningFlag();
    if (!isPageHidden) {
      lastTimestamp = performance.now();
    }
    handleAudioVisibilityChange();
  });

  // ================== WebAudio ==================
  function ensureAudioStarted() {
    if (audioStarted) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      audioCtx = new AudioCtx();
      audioGain = audioCtx.createGain();
      audioGain.gain.value = 0.15;
      audioGain.connect(audioCtx.destination);
      audioStarted = true;
      audioMuted = false;
      startChimeLoop();
    } catch (e) {
      audioStarted = false;
    }
  }

  function scheduleChime() {
    if (!audioCtx || !audioGain) return;
    const now = audioCtx.currentTime;
    const dur = 1.2;
    const freqs = [880, 987.77, 1046.5, 1174.66];
    const freq = freqs[Math.floor(Math.random() * freqs.length)];

    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);

    const overtone = audioCtx.createOscillator();
    overtone.type = "triangle";
    overtone.frequency.setValueAtTime(freq * 2.0, now);

    const gain = audioCtx.createGain();
    const overtoneGain = audioCtx.createGain();
    overtoneGain.gain.setValueAtTime(0.3, now);

    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gain);
    overtone.connect(overtoneGain).connect(gain);
    gain.connect(audioGain);

    osc.start(now);
    overtone.start(now);
    osc.stop(now + dur + 0.05);
    overtone.stop(now + dur + 0.05);
  }

  function playSleighJingle() {
    if (!audioCtx || !audioGain || !audioStarted || audioMuted || document.hidden) return;
    const now = audioCtx.currentTime;
    const baseFreq = 1320;
    const semitone = Math.pow(2, 1 / 12);
    const offsets = [0, 3, 7, 12];
    const notes = 4;

    for (let i = 0; i < notes; i++) {
      const t = now + i * 0.14;
      const f = baseFreq * Math.pow(semitone, offsets[i % offsets.length]);
      const osc = audioCtx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, t);

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

      osc.connect(gain).connect(audioGain);
      osc.start(t);
      osc.stop(t + 0.65);
    }
  }

  function startChimeLoop() {
    if (!audioCtx || audioTimerId || audioMuted) return;
    audioTimerId = window.setInterval(() => {
      if (document.hidden || manualPaused || audioMuted) return;
      scheduleChime();
    }, 1600);
  }

  function stopChimeLoop() {
    if (audioTimerId) {
      window.clearInterval(audioTimerId);
      audioTimerId = null;
    }
  }

  function toggleMute() {
    if (!audioStarted) {
      ensureAudioStarted();
      return;
    }
    if (!audioCtx || !audioGain) return;
    const now = audioCtx.currentTime;
    audioMuted = !audioMuted;
    if (audioMuted) {
      audioGain.gain.setTargetAtTime(0.0, now, 0.08);
      stopChimeLoop();
    } else {
      audioGain.gain.setTargetAtTime(0.15, now, 0.08);
      startChimeLoop();
    }
  }

  function handleAudioVisibilityChange() {
    if (!audioStarted) return;
    if (document.hidden) stopChimeLoop();
    else if (!audioMuted) startChimeLoop();
  }

  // ================== Input handlers ==================
  function handlePointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const nx = rect.width > 0 ? (x / rect.width) * 2 - 1 : 0;
    const ny = rect.height > 0 ? (y / rect.height) * 2 - 1 : 0;

    targetYawOffset = nx * 0.18;
    targetPitchOffset = ny * 0.12;
    targetParallaxX = nx * 40;
    targetParallaxY = ny * 22;
  }

  function handlePointerDown(e) {
    e.preventDefault();
    ensureAudioStarted();
    ensureInitialHints();
    isDragging = true;
    lastPointerX = e.clientX;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}
    canvas.style.cursor = "grabbing";
  }

  function handlePointerUp(e) {
    isDragging = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}
    canvas.style.cursor = "grab";
  }

  function handlePointerMoveWithDrag(e) {
    handlePointerMove(e);
    if (!isDragging) return;
    const dx = e.clientX - lastPointerX;
    lastPointerX = e.clientX;
    dragSpinVelocity += dx * 0.00002;
    dragSpinVelocity = clamp(dragSpinVelocity, -0.02, 0.02);
  }

  let clickTimerId = null;

  function handleCanvasClick(e) {
    ensureAudioStarted();
    ensureInitialHints();

    if (clickTimerId) {
      window.clearTimeout(clickTimerId);
      clickTimerId = null;
    }

    if (isPointNearSleigh(e.clientX, e.clientY)) {
      startSleighFlight(true);
      return;
    }

    clickTimerId = window.setTimeout(() => {
      triggerFestiveMode();
      const midY = TREE_HEIGHT * 0.55;
      spawnSparkleBurst(0, midY, 0, 1.5, 40);
      clickTimerId = null;
    }, 220);
  }

  function handleCanvasDblClick(e) {
    if (clickTimerId) {
      window.clearTimeout(clickTimerId);
      clickTimerId = null;
    }
    ensureAudioStarted();
    ensureInitialHints();
    if (isPointNearTopStar(e.clientX, e.clientY)) {
      const topY = TREE_HEIGHT + 0.45;
      spawnSparkleBurst(0, topY, 0, 0.9, 55);
      triggerFestiveMode();
    }
  }

  function handleKeyDown(e) {
    if (e.repeat) return;
    const key = e.key.toLowerCase();
    if (key === " ") {
      e.preventDefault();
      manualPaused = !manualPaused;
      updateRunningFlag();
      if (!manualPaused) {
        lastTimestamp = performance.now();
      }
      ensureInitialHints();
    } else if (key === "t") {
      twinkleIntensity = twinkleIntensity < 1.0 ? 1.35 : 0.7;
    } else if (key === "s") {
      snowLevelIndex = (snowLevelIndex + 1) % SNOW_LEVELS.length;
      snowFlakes = initSnow2D(getCurrentSnowCount());
    } else if (key === "m") {
      toggleMute();
    } else if (key === "r") {
      sleighEnabled = !sleighEnabled;
      if (!sleighEnabled) {
        sleighActive = false;
        sleighProgress = 0.0;
        sleighTimer = 0.0;
        sleighBoostTrailTime = 0.0;
        sleighTrailAccum = 0.0;
        sleighScreenVisible = false;
      }
    }
  }

  canvas.addEventListener("pointermove", handlePointerMoveWithDrag, { passive: true });
  canvas.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("pointercancel", handlePointerUp);

  canvas.addEventListener("click", handleCanvasClick);
  canvas.addEventListener("dblclick", handleCanvasDblClick);

  window.addEventListener("keydown", handleKeyDown);

  // Initial setup
  resizeCanvasAndRebuild();
  requestAnimationFrame(loop);
})();
