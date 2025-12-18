(() => {
  "use strict";

  // ================== Camera & scene parameters (matching Python) ==================
  const CAM_DIST = 13.0;
  const CAM_HEIGHT = 6.0;
  const PITCH = -0.25;
  const TREE_HEIGHT = 12.0;

  // ================== Base particle counts (adjusted for new elements) ==================
  const BASE_TREE_POINTS = 45000; // Slightly reduced to balance performance
  const BASE_GARLAND_POINTS = 5000;
  const BASE_GROUND_POINTS = 4000;
  const BASE_STAR_POINTS = 1200;
  const BASE_HEART_POINTS = 1000;
  const SNOW2D_POINTS = 10;

  // Reference resolution for density scaling
  const REF_AREA = 1600 * 900;

  // Blue–silver palette anchors
  const DEEP_NAVY = { r: 0x07, g: 0x0d, b: 0x1f };
  const NAVY = { r: 0x0b, g: 0x16, b: 0x28 };
  const GLACIER = { r: 0x88, g: 0xc9, b: 0xff };
  const ICY = { r: 0xbf, g: 0xe7, b: 0xff };
  const SILVER = { r: 0xcf, g: 0xd8, b: 0xe3 };
  const ICE_WHITE = { r: 0xee, g: 0xf6, b: 0xff };

  const canvas = document.getElementById("treeCanvas");
  const ctx = canvas.getContext("2d");
  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";

  let viewWidth = window.innerWidth || 800;
  let viewHeight = window.innerHeight || 600;
  let dpr = window.devicePixelRatio || 1;

  // 3D point sets
  let treePoints = [];
  let garlandPoints = [];
  let groundPoints = [];
  let starPoints = [];
  let heartPoints = [];
  let sparklePoints = [];

  // Foreground 2D snowflakes
  let snowFlakes = [];

  // Draw list used for depth sorting
  let drawList = [];

  // Camera / interaction state
  let angle = 0.0; // rotation angle around Y axis
  let time = 0.0; // scene time for animations
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

  let twinkleIntensity = 1.0;

  const FESTIVE_DURATION = 5.0;
  let festiveTimeLeft = 0.0;
  let festiveEase = 0.0;

  let dragSpinVelocity = 0.0;
  let isDragging = false;
  let lastPointerX = 0;

  let isPageHidden = false;
  let manualPaused = false;
  let running = true;

  // Hints overlay state
  const HINT_LIFETIME = 7.0;
  let hints = [];
  let hasShownFirstHint = false;

  // WebAudio state
  let audioCtx = null;
  let audioGain = null;
  let audioTimerId = null;
  let audioStarted = false;
  let audioMuted = false;

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

  function getCurrentSnowCount() {
    const base = SNOW_LEVELS[snowLevelIndex] || SNOW_LEVELS[1];
    const area = viewWidth * viewHeight;
    const scale = clamp(area / REF_AREA, 0.7, 1.4);
    return Math.max(2, Math.round(base * scale));
  }

  // ================== Point generation (ported geometry, enriched visuals) ==================

  function genTreePoints(count) {
    const pts = [];
    const loops = 9;
    const spiralN = Math.floor(count * 0.7);

    // Spiral lights (main structure)
    for (let i = 0; i < spiralN; i++) {
      const u = Math.random();
      const h = Math.pow(u, 1.6);
      const y = TREE_HEIGHT * h + 0.2;

      let baseR = Math.pow(1 - h, 1.1) * 3.2;
      const branchWave = Math.max(0.0, Math.sin((h * 5.8 + 0.15) * Math.PI * 2));
      baseR *= 1.0 + 0.65 * branchWave;

      const t = u * loops * Math.PI * 2;
      const angleSpiral = t + randRange(-0.22, 0.22);
      const r = baseR * randRange(0.85, 1.08);

      const x = Math.cos(angleSpiral) * r;
      const z = Math.sin(angleSpiral) * r;

      // Vertical color gradation
      const vertColor = lerpColor(DEEP_NAVY, GLACIER, h * 1.2);
      
      // Mid-section brightness boost
      const midBoost = Math.max(0.15, 1.0 - Math.abs(h - 0.55) * 1.5);
      const tBright = clamp(midBoost, 0.0, 1.0);
      const baseColor = lerpColor(vertColor, ICE_WHITE, tBright);
      
      let color = {
        r: clamp(baseColor.r + randInt(-8, 8), 80, 255),
        g: clamp(baseColor.g + randInt(-10, 10), 120, 255),
        b: clamp(baseColor.b + randInt(-10, 10), 180, 255),
      };

      const point = { x, y, z, color, isBauble: false, shape: "dot" };

      // Add twinkle property to a small subset
      if (Math.random() < 0.06) {
        point.twinkle = {
          speed: randRange(2.0, 4.5),
          offset: Math.random() * Math.PI * 2,
          max_bright: 1.8,
        };
      }
      
      // Upgrade a small subset of points to be glass baubles
      if (Math.random() < 0.015) {
        point.isBauble = true;
        point.shape = "bauble";
        const baubleColor = lerpColor(SILVER, ICE_WHITE, Math.random());
        point.color = {
          r: clamp(baubleColor.r + randInt(-5, 5), 200, 255),
          g: clamp(baubleColor.g + randInt(-5, 5), 220, 255),
          b: clamp(baubleColor.b + randInt(-5, 5), 235, 255),
        };
        // Baubles don't twinkle
        delete point.twinkle;
      } else if (Math.random() < 0.02) {
        // A few cool starlet ornaments
        point.shape = "starlet";
        const starColor = lerpColor(ICE_WHITE, ICY, Math.random() * 0.6);
        point.color = {
          r: clamp(starColor.r + randInt(-6, 6), 210, 255),
          g: clamp(starColor.g + randInt(-6, 6), 220, 255),
          b: clamp(starColor.b + randInt(-6, 6), 230, 255),
        };
        point.starSize = randRange(1.0, 1.5);
        point.twinkle = {
          speed: randRange(1.2, 2.8),
          offset: Math.random() * Math.PI * 2,
          max_bright: 2.1,
        };
      }
      
      pts.push(point);
    }

    // Fluffy fill points
    const fillN = count - spiralN;
    const FILL_LOW = { r: 50, g: 110, b: 170 };
    for (let i = 0; i < fillN; i++) {
      const h = Math.pow(Math.random(), 1.9);
      const y = TREE_HEIGHT * h + 0.2 + randRange(-0.08, 0.08);

      let baseR = Math.pow(1 - h, 1.1) * 4.3;
      const branchWave = Math.max(0.0, Math.sin((h * 5.8 + 0.15) * Math.PI * 2));
      baseR *= 1.0 + 0.65 * branchWave;

      const radius = baseR * Math.sqrt(Math.random());
      const angleFill = Math.random() * Math.PI * 2;

      const x = Math.cos(angleFill) * radius + randRange(-0.08, 0.08);
      const z = Math.sin(angleFill) * radius + randRange(-0.08, 0.08);
      
      const tFill = 0.1 + h * 0.8;
      const baseFill = lerpColor(FILL_LOW, GLACIER, tFill);
      const color = {
        r: clamp(baseFill.r + randInt(-12, 12), 60, 200),
        g: clamp(baseFill.g + randInt(-12, 12), 100, 210),
        b: clamp(baseFill.b + randInt(-12, 12), 150, 230),
      };

      pts.push({ x, y, z, color, isBauble: false, shape: "dot" });
    }

    return pts;
  }
  
  function genSecondaryGarland(count) {
    const pts = [];
    const loops = 7;
    const phaseOffset = 0.8; // Offset from main spiral

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

        const color = lerpColor(GLACIER, ICY, Math.random());
        
        // Alternate brighter segments along the spiral
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

        pts.push({ x, y, z, color, pulse, isRibbon: true });
    }
    return pts;
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

      for(let i=0; i<r_steps.length; i++) {
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

  // ================== Sparkle bursts (for festive mode & star bursts) ==================

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
    const garlandCount = Math.round(BASE_GARLAND_POINTS * densityScale);
    const groundCount = Math.round(BASE_GROUND_POINTS * densityScale);
    const starCount = Math.round(BASE_STAR_POINTS * densityScale);
    const heartCount = Math.round(BASE_HEART_POINTS * densityScale);

    treePoints = genTreePoints(treeCount);
    garlandPoints = genSecondaryGarland(garlandCount);
    groundPoints = genGroundPoints(groundCount);
    starPoints = genStarPoints(starCount);
    heartPoints = genHeartPoints(heartCount);

    drawList = new Array(treeCount + garlandCount + groundCount + starCount + heartCount);
    snowFlakes = initSnow2D(getCurrentSnowCount());
    lastTimestamp = performance.now();
  }

  window.addEventListener("resize", resizeCanvasAndRebuild);

  // ================== Rendering ==================

  function clear() {
    ctx.save();
    const grad = ctx.createLinearGradient(0, 0 + parallaxOffsetY * -0.1, 0, viewHeight + parallaxOffsetY * 0.2);
    grad.addColorStop(0.0, "#020713");
    grad.addColorStop(0.45, NAVY.r ? `rgb(${NAVY.r}, ${NAVY.g}, ${NAVY.b})` : "#0b1628");
    grad.addColorStop(1.0, "#02040a");
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewWidth, viewHeight);
    
    // Aurora band with subtle parallax
    const bandHeight = viewHeight * 0.18;
    const bandY = viewHeight * 0.28 + parallaxOffsetY * 0.2;
    const bandX = parallaxOffsetX * 0.25;
    const auroraGrad = ctx.createLinearGradient(0, bandY, 0, bandY + bandHeight);
    auroraGrad.addColorStop(0.0, "rgba(136, 201, 255, 0.0)");
    auroraGrad.addColorStop(0.5, "rgba(191, 231, 255, 0.22)");
    auroraGrad.addColorStop(1.0, "rgba(136, 201, 255, 0.0)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = auroraGrad;
    ctx.fillRect(bandX - viewWidth * 0.05, bandY, viewWidth * 1.1, bandHeight);

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

  function render3DScene() {
    let writeIndex = 0;

    const festiveBoost = festiveEase;
    const twinkleScale = twinkleIntensity * (1.0 + 0.6 * festiveBoost);
    const pulseTime = time * (1.0 + 0.8 * festiveBoost);

    function pushPoint(p) {
      const proj = projectPoint(p.x, p.y, p.z, angle);
      if (!proj) return;
      const sizeBase = 3.6 - proj.depth * 0.13;
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
          isSparkle: false,
          shape: "dot",
          alpha: 1.0,
        };
      }

      item.depth = proj.depth;
      item.sx = proj.sx;
      item.sy = proj.sy;
      item.size = Math.max(1, sizeBase);
      item.color.r = p.color.r;
      item.color.g = p.color.g;
      item.color.b = p.color.b;
      item.isBauble = !!p.isBauble;
      item.isRibbon = !!p.isRibbon;
      item.isSparkle = !!p.maxLife;
      item.shape = p.shape || (item.isBauble ? "bauble" : "dot");
      item.alpha = 1.0;

      // Time-based modulation
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
        const brightness = lerp(p.pulse.min_bright, p.pulse.max_bright, factor) * (1.0 + 0.5 * festiveBoost);
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
    for (let i = 0; i < groundPoints.length; i++) pushPoint(groundPoints[i]);
    for (let i = 0; i < starPoints.length; i++) pushPoint(starPoints[i]);
    for (let i = 0; i < heartPoints.length; i++) pushPoint(heartPoints[i]);
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

        // Outer cool blue glow
        ctx.globalAlpha = 0.55 * a;
        ctx.fillStyle = "rgba(136, 201, 255, 0.65)";
        ctx.beginPath();
        ctx.arc(sx, sy, outerR, 0, Math.PI * 2);
        ctx.fill();

        // Mid silver body
        ctx.globalAlpha = 0.9 * a;
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`;
        ctx.beginPath();
        ctx.arc(sx, sy, midR, 0, Math.PI * 2);
        ctx.fill();

        // Inner bright core
        ctx.globalAlpha = 1.0 * a;
        ctx.fillStyle = "rgba(238, 246, 255, 1.0)";
        ctx.beginPath();
        ctx.arc(sx, sy, innerR, 0, Math.PI * 2);
        ctx.fill();

        // Specular highlight offset towards top-left
        const highlightR = size * 0.55;
        ctx.globalAlpha = 1.0 * a;
        ctx.fillStyle = "rgba(255, 255, 255, 1.0)";
        ctx.beginPath();
        ctx.arc(sx - size * 0.8, sy - size * 0.8, highlightR, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      } else if (item.shape === "starlet") {
        const outerR = size * 1.7;
        const innerR = outerR * 0.45;
        drawStarShape(sx, sy, outerR, innerR, color, 0.9 * a);
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

    // Halo
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.4 * alpha;
    const haloR = size * 2.4;
    const haloGrad = ctx.createRadialGradient(proj.sx, proj.sy, 0, proj.sx, proj.sy, haloR);
    haloGrad.addColorStop(0.0, "rgba(238,246,255,1.0)");
    haloGrad.addColorStop(1.0, "rgba(191,231,255,0)");
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(proj.sx, proj.sy, haloR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const starColor = ICE_WHITE;
    drawStarShape(proj.sx, proj.sy, size, size * 0.45, starColor, 0.95 * alpha);
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

  function pushHint(text, lifetime) {
    hints.push({
      text,
      createdAt: time,
      lifetime,
    });
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
      if (age < fadeIn) {
        alpha *= age / fadeIn;
      } else if (age > h.lifetime - fadeOut) {
        alpha *= (h.lifetime - age) / fadeOut;
      }
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

  function renderFrame() {
    clear();
    render3DScene();
    drawTopStar();
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
    updateSnow2D(safeDt);
    updateSparkles(safeDt);
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
    if (document.hidden) {
      stopChimeLoop();
    } else if (!audioMuted) {
      startChimeLoop();
    }
  }

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
    } catch (err) {}
    canvas.style.cursor = "grabbing";
  }

  function handlePointerUp(e) {
    isDragging = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (err) {}
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
    clickTimerId = window.setTimeout(() => {
      festiveTimeLeft = FESTIVE_DURATION;
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
      festiveTimeLeft = FESTIVE_DURATION;
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
      // toggle twinkle intensity between soft and strong
      twinkleIntensity = twinkleIntensity < 1.0 ? 1.35 : 0.7;
    } else if (key === "s") {
      snowLevelIndex = (snowLevelIndex + 1) % SNOW_LEVELS.length;
      snowFlakes = initSnow2D(getCurrentSnowCount());
    } else if (key === "m") {
      toggleMute();
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
