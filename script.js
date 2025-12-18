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

  let viewWidth = window.innerWidth || 800;
  let viewHeight = window.innerHeight || 600;
  let dpr = window.devicePixelRatio || 1;

  // 3D point sets
  let treePoints = [];
  let garlandPoints = [];
  let groundPoints = [];
  let starPoints = [];
  let heartPoints = [];

  // Foreground 2D snowflakes
  let snowFlakes = [];

  // Draw list used for depth sorting
  let drawList = [];

  let angle = 0.0; // rotation angle around Y axis
  let time = 0.0; // scene time for animations
  let lastTimestamp = performance.now();
  let running = true;

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

      const point = { x, y, z, color, isBauble: false };

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
        const baubleColor = lerpColor(SILVER, ICE_WHITE, Math.random());
        point.color = {
            r: clamp(baubleColor.r + randInt(-5, 5), 200, 255),
            g: clamp(baubleColor.g + randInt(-5, 5), 220, 255),
            b: clamp(baubleColor.b + randInt(-5, 5), 235, 255),
        };
        // Baubles don't twinkle
        delete point.twinkle;
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

      pts.push({ x, y, z, color, isBauble: false });
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

        pts.push({ x, y, z, color, pulse });
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
  
  function initSnow2D() {
    const flakes = [];
    for (let i = 0; i < SNOW2D_POINTS; i++) {
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

  // ================== Projection ==================

  function projectPoint(x, y, z, ang) {
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    const xz = x * cosA - z * sinA;
    const zz = x * sinA + z * cosA;

    const cosP = Math.cos(PITCH), sinP = Math.sin(PITCH);
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
    snowFlakes = initSnow2D();
    lastTimestamp = performance.now();
  }

  window.addEventListener("resize", resizeCanvasAndRebuild);

  // ================== Rendering ==================

  function clear() {
    ctx.save();
    const grad = ctx.createLinearGradient(0, 0, 0, viewHeight);
    grad.addColorStop(0.0, "#020713");
    grad.addColorStop(0.45, NAVY.r ? `rgb(${NAVY.r}, ${NAVY.g}, ${NAVY.b})` : "#0b1628");
    grad.addColorStop(1.0, "#02040a");
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewWidth, viewHeight);
    
    // Aurora band
    const bandHeight = viewHeight * 0.18;
    const bandY = viewHeight * 0.28;
    const auroraGrad = ctx.createLinearGradient(0, bandY, 0, bandY + bandHeight);
    auroraGrad.addColorStop(0.0, "rgba(136, 201, 255, 0.0)");
    auroraGrad.addColorStop(0.5, "rgba(191, 231, 255, 0.22)");
    auroraGrad.addColorStop(1.0, "rgba(136, 201, 255, 0.0)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = auroraGrad;
    ctx.fillRect(0, bandY, viewWidth, bandHeight);

    ctx.restore();
  }

  function render3DScene() {
    let writeIndex = 0;

    const allPoints = [treePoints, garlandPoints, groundPoints, starPoints, heartPoints];
    
    for(const pointSet of allPoints) {
        for (let i = 0; i < pointSet.length; i++) {
            const p = pointSet[i];
            const proj = projectPoint(p.x, p.y, p.z, angle);
            if (!proj) continue;

            const size = Math.max(1, 3.6 - proj.depth * 0.13);
            if (size <= 0) continue;

            let item = drawList[writeIndex];
            if (!item) {
                item = drawList[writeIndex] = {
                  depth: 0,
                  sx: 0,
                  sy: 0,
                  size: 0,
                  color: { r: 0, g: 0, b: 0 },
                  isBauble: false,
                };
            }
            item.depth = proj.depth;
            item.sx = proj.sx;
            item.sy = proj.sy;
            item.size = size;
            item.color.r = p.color.r;
            item.color.g = p.color.g;
            item.color.b = p.color.b;
            item.isBauble = !!p.isBauble;

            if (p.twinkle) {
                const factor = (Math.sin(time * p.twinkle.speed + p.twinkle.offset) + 1) / 2;
                const brightness = 1.0 + factor * (p.twinkle.max_bright - 1.0);
                item.color.r = clamp(Math.round(p.color.r * brightness), 0, 255);
                item.color.g = clamp(Math.round(p.color.g * brightness), 0, 255);
                item.color.b = clamp(Math.round(p.color.b * brightness), 0, 255);
            }

            if (p.pulse) {
                const factor = (Math.sin(time * p.pulse.speed + p.pulse.offset) + 1) / 2;
                const brightness = lerp(p.pulse.min_bright, p.pulse.max_bright, factor);
                item.color.r = clamp(Math.round(p.color.r * brightness), 0, 255);
                item.color.g = clamp(Math.round(p.color.g * brightness), 0, 255);
                item.color.b = clamp(Math.round(p.color.b * brightness), 0, 255);
            }
            writeIndex++;
        }
    }

    drawList.length = writeIndex;
    drawList.sort((a, b) => b.depth - a.depth);

    for (let i = 0; i < drawList.length; i++) {
      const item = drawList[i];
      const { sx, sy, size, color } = item;
      if (sx < 0 || sx >= viewWidth || sy < 0 || sy >= viewHeight) continue;

      if (item.isBauble) {
          const outerR = size * 1.6;
          const midR = size * 1.15;
          const innerR = size * 0.65;

          ctx.save();
          ctx.globalCompositeOperation = "lighter";

          // Outer cool blue glow
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = "rgba(136, 201, 255, 0.65)";
          ctx.beginPath();
          ctx.arc(sx, sy, outerR, 0, Math.PI * 2);
          ctx.fill();

          // Mid silver body
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`;
          ctx.beginPath();
          ctx.arc(sx, sy, midR, 0, Math.PI * 2);
          ctx.fill();

          // Inner bright core
          ctx.globalAlpha = 1.0;
          ctx.fillStyle = "rgba(238, 246, 255, 1.0)";
          ctx.beginPath();
          ctx.arc(sx, sy, innerR, 0, Math.PI * 2);
          ctx.fill();

          // Specular highlight offset towards top-left
          const highlightR = size * 0.55;
          ctx.globalAlpha = 1.0;
          ctx.fillStyle = "rgba(255, 255, 255, 1.0)";
          ctx.beginPath();
          ctx.arc(sx - size * 0.8, sy - size * 0.8, highlightR, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
      } else {
          ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
          ctx.beginPath();
          ctx.arc(sx, sy, size, 0, Math.PI * 2);
          ctx.fill();
      }
    }
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

  function renderFrame() {
    clear();
    render3DScene();
    drawTexts();
    drawSnow2D();
  }

  // ================== Main loop ==================

  function loop(timestamp) {
    if (!running) return;

    const dt = (timestamp - lastTimestamp) / 1000.0;
    lastTimestamp = timestamp;
    
    time += dt;
    updateSnow2D(dt > 0 ? dt : 0);
    angle += 0.0045;

    renderFrame();

    requestAnimationFrame(loop);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      running = false;
    } else if (!running) {
      running = true;
      lastTimestamp = performance.now();
      requestAnimationFrame(loop);
    }
  });

  // Initial setup
  resizeCanvasAndRebuild();
  requestAnimationFrame(loop);
})();
