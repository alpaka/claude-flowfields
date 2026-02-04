// Flow Fields - Generative Art
// Particles flowing through invisible vector fields

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Configuration
let config = {
    particleCount: 5000,
    noiseScale: 0.003,
    speed: 2,
    fadeAmount: 0.03,
    lineWidth: 0.5,
    colorScheme: 0,
    // New options
    noiseMode: 1, // 0=classic, 1=turbulent, 2=ridged, 3=billow, 4=warp, 5=forces only
    backgroundStrength: 1.0,
    forceFieldStrength: 1.0,
    brownianMotion: 1,
    spawnRate: 0.008,
    // Even more options!
    velocityColor: false, // Color based on speed
    trailLength: 1, // 1=normal, higher=longer trails (affects fade)
    mouseMode: 'vortex', // 'vortex', 'attract', 'repel'
    symmetry: 1, // 1=none, 2=bilateral, 4=quad, 8=octagonal
    globalGravity: 0, // Downward pull
    // Particle interactions
    particleInteraction: 'zones', // 'none', 'attract', 'repel', 'align', 'zones'
    interactionStrength: 1.0,
    interactionRadius: 50,
    // Force field movement
    fieldDriftSpeed: 0.5, // Max drift speed for force fields
    // Particle respawn
    respawnRate: 0.005 // Rate at which particles respawn at random positions
};

// Color schemes - each is an array of colors for gradient
const colorSchemes = [
    // Aurora
    ['#00ff87', '#60efff', '#ff00ff', '#ff0080'],
    // Sunset
    ['#ff6b35', '#f7c59f', '#efefef', '#2e294e'],
    // Ocean
    ['#0077b6', '#00b4d8', '#90e0ef', '#caf0f8'],
    // Forest
    ['#2d6a4f', '#40916c', '#52b788', '#95d5b2'],
    // Fire
    ['#ff0000', '#ff5500', '#ff9900', '#ffcc00'],
    // Neon
    ['#ff00ff', '#00ffff', '#ff00aa', '#00ff00'],
    // Monochrome
    ['#ffffff', '#cccccc', '#999999', '#666666'],
    // Vapor
    ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff']
];

let particles = [];
let time = 0;
let paused = false;
let animationId = null;

// Spatial grid for particle interactions (efficient neighbor lookup)
let spatialGrid = {};
const GRID_CELL_SIZE = 40;

function getSpatialKey(x, y) {
    const gx = Math.floor(x / GRID_CELL_SIZE);
    const gy = Math.floor(y / GRID_CELL_SIZE);
    return `${gx},${gy}`;
}

function buildSpatialGrid() {
    spatialGrid = {};
    for (const particle of particles) {
        const key = getSpatialKey(particle.x, particle.y);
        if (!spatialGrid[key]) spatialGrid[key] = [];
        spatialGrid[key].push(particle);
    }
}

function getNearbyParticles(x, y, radius) {
    const nearby = [];
    const cellRadius = Math.ceil(radius / GRID_CELL_SIZE);
    const gx = Math.floor(x / GRID_CELL_SIZE);
    const gy = Math.floor(y / GRID_CELL_SIZE);

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        for (let dy = -cellRadius; dy <= cellRadius; dy++) {
            const key = `${gx + dx},${gy + dy}`;
            if (spatialGrid[key]) {
                nearby.push(...spatialGrid[key]);
            }
        }
    }
    return nearby;
}

// Mouse interaction
let mouse = {
    x: null,
    y: null,
    radius: 150,
    active: false
};

// Force fields - sinks, sources, and vortexes
let forceFields = [];
let showForceFields = true;

class ForceField {
    constructor(type = null) {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        // Randomized drift velocity based on config
        const speedMultiplier = 0.5 + Math.random() * 1.5; // 0.5x to 2x variation
        this.vx = (Math.random() - 0.5) * config.fieldDriftSpeed * speedMultiplier;
        this.vy = (Math.random() - 0.5) * config.fieldDriftSpeed * speedMultiplier;
        const allTypes = ['sink', 'source', 'vortex', 'vortex', 'gravity', 'shear', 'repulsor', 'turbulence', 'lane'];
        this.type = type || allTypes[Math.floor(Math.random() * allTypes.length)];
        this.strength = 50 + Math.random() * 100;
        this.radius = 80 + Math.random() * 120;
        this.rotation = this.type === 'vortex' ? (Math.random() > 0.5 ? 1 : -1) : 0;
        this.life = 500 + Math.random() * 1000;
        this.maxLife = this.life;
        this.pulsePhase = Math.random() * Math.PI * 2;
        // Extra properties for special types
        this.shearAngle = Math.random() * Math.PI * 2; // Direction of shear
        this.laneAngle = Math.random() * Math.PI * 2; // Direction of lane flow
        this.turbulenceSeed = Math.random() * 1000;
    }

    update() {
        // Drift slowly
        this.x += this.vx;
        this.y += this.vy;

        // Bounce off edges
        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;

        // Keep in bounds
        this.x = Math.max(0, Math.min(canvas.width, this.x));
        this.y = Math.max(0, Math.min(canvas.height, this.y));

        this.life--;
        this.pulsePhase += 0.05;
    }

    getForce(px, py) {
        const dx = px - this.x;
        const dy = py - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > this.radius || dist < 5) return { fx: 0, fy: 0 };

        // Pulsing strength
        const pulse = 1 + Math.sin(this.pulsePhase) * 0.3;
        const falloff = 1 - (dist / this.radius);
        const strength = (this.strength / 100) * falloff * pulse;

        // Fade in/out
        let lifeFactor = 1;
        if (this.life < 100) lifeFactor = this.life / 100;
        if (this.life > this.maxLife - 100) lifeFactor = (this.maxLife - this.life) / 100;

        const finalStrength = strength * lifeFactor;

        switch (this.type) {
            case 'sink': // Pull particles in
                return {
                    fx: -(dx / dist) * finalStrength,
                    fy: -(dy / dist) * finalStrength
                };
            case 'source': // Push particles out
                return {
                    fx: (dx / dist) * finalStrength,
                    fy: (dy / dist) * finalStrength
                };
            case 'vortex': // Swirl particles
                const perpX = -dy / dist;
                const perpY = dx / dist;
                return {
                    fx: perpX * finalStrength * this.rotation,
                    fy: perpY * finalStrength * this.rotation
                };
            case 'gravity': // Strong attractor with orbital tendency
                // Combine inward pull with slight tangential push for orbits
                const gravityStrength = finalStrength * 2;
                const inwardX = -(dx / dist) * gravityStrength;
                const inwardY = -(dy / dist) * gravityStrength;
                const tangentX = (-dy / dist) * gravityStrength * 0.3;
                const tangentY = (dx / dist) * gravityStrength * 0.3;
                return {
                    fx: inwardX + tangentX,
                    fy: inwardY + tangentY
                };
            case 'shear': // Horizontal shearing - particles slide sideways based on y distance
                const shearDir = Math.sign(dy) || 1;
                const shearX = Math.cos(this.shearAngle) * finalStrength * shearDir * 1.5;
                const shearY = Math.sin(this.shearAngle) * finalStrength * shearDir * 1.5;
                return { fx: shearX, fy: shearY };
            case 'repulsor': // Strong inverse-square repulsion
                const repelStrength = finalStrength * 3 * (this.radius / (dist + 10));
                return {
                    fx: (dx / dist) * repelStrength,
                    fy: (dy / dist) * repelStrength
                };
            case 'turbulence': // Local random jitter zone
                const turbAngle = noise.noise2D(px * 0.1 + this.turbulenceSeed, py * 0.1 + time * 0.01) * Math.PI * 2;
                const turbStrength = finalStrength * 2;
                return {
                    fx: Math.cos(turbAngle) * turbStrength,
                    fy: Math.sin(turbAngle) * turbStrength
                };
            case 'lane': // Parallel flow streams
                const laneX = Math.cos(this.laneAngle) * finalStrength * 2;
                const laneY = Math.sin(this.laneAngle) * finalStrength * 2;
                return { fx: laneX, fy: laneY };
            default:
                return { fx: 0, fy: 0 };
        }
    }

    draw() {
        if (!showForceFields) return;

        const alpha = Math.min(1, this.life / 100, (this.maxLife - this.life) / 100) * 0.15;
        const pulse = 1 + Math.sin(this.pulsePhase) * 0.2;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Draw based on type
        switch (this.type) {
            case 'sink':
                // Concentric circles pointing inward
                ctx.strokeStyle = '#ff4444';
                for (let r = this.radius * pulse; r > 10; r -= 20) {
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
                    ctx.stroke();
                }
                // Center dot
                ctx.fillStyle = '#ff4444';
                ctx.beginPath();
                ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'source':
                // Radiating lines
                ctx.strokeStyle = '#44ff44';
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * pulse, 0, Math.PI * 2);
                ctx.stroke();
                for (let i = 0; i < 8; i++) {
                    const angle = (i / 8) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(this.x + Math.cos(angle) * 10, this.y + Math.sin(angle) * 10);
                    ctx.lineTo(this.x + Math.cos(angle) * this.radius * pulse * 0.5, this.y + Math.sin(angle) * this.radius * pulse * 0.5);
                    ctx.stroke();
                }
                break;

            case 'vortex':
                // Spiral
                ctx.strokeStyle = this.rotation > 0 ? '#4444ff' : '#ff44ff';
                ctx.beginPath();
                for (let t = 0; t < Math.PI * 4; t += 0.1) {
                    const r = (t / (Math.PI * 4)) * this.radius * pulse;
                    const angle = t * this.rotation + this.pulsePhase;
                    const x = this.x + Math.cos(angle) * r;
                    const y = this.y + Math.sin(angle) * r;
                    if (t === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
                break;

            case 'gravity':
                // Black hole style - concentric rings with glow
                ctx.strokeStyle = '#ffaa00';
                for (let r = this.radius * pulse; r > 15; r -= 15) {
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
                    ctx.stroke();
                }
                // Center glow
                const glow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 20);
                glow.addColorStop(0, 'rgba(255, 200, 0, 0.8)');
                glow.addColorStop(1, 'transparent');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(this.x, this.y, 20, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'shear':
                // Parallel lines showing shear direction
                ctx.strokeStyle = '#ff8844';
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * pulse, 0, Math.PI * 2);
                ctx.stroke();
                for (let i = -2; i <= 2; i++) {
                    const offset = i * 20;
                    const perpX = -Math.sin(this.shearAngle);
                    const perpY = Math.cos(this.shearAngle);
                    const startX = this.x + perpX * offset - Math.cos(this.shearAngle) * 40;
                    const startY = this.y + perpY * offset - Math.sin(this.shearAngle) * 40;
                    const endX = this.x + perpX * offset + Math.cos(this.shearAngle) * 40;
                    const endY = this.y + perpY * offset + Math.sin(this.shearAngle) * 40;
                    ctx.beginPath();
                    ctx.moveTo(startX, startY);
                    ctx.lineTo(endX, endY);
                    // Arrow head
                    const arrowSize = 8;
                    const arrowAngle = this.shearAngle + (i >= 0 ? 0 : Math.PI);
                    ctx.lineTo(endX - Math.cos(arrowAngle - 0.5) * arrowSize, endY - Math.sin(arrowAngle - 0.5) * arrowSize);
                    ctx.moveTo(endX, endY);
                    ctx.lineTo(endX - Math.cos(arrowAngle + 0.5) * arrowSize, endY - Math.sin(arrowAngle + 0.5) * arrowSize);
                    ctx.stroke();
                }
                break;

            case 'repulsor':
                // Exploding star pattern
                ctx.strokeStyle = '#ff2222';
                ctx.fillStyle = '#ff2222';
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * pulse, 0, Math.PI * 2);
                ctx.stroke();
                for (let i = 0; i < 12; i++) {
                    const angle = (i / 12) * Math.PI * 2 + this.pulsePhase * 0.5;
                    const innerR = 15;
                    const outerR = this.radius * pulse * 0.6;
                    ctx.beginPath();
                    ctx.moveTo(this.x + Math.cos(angle) * innerR, this.y + Math.sin(angle) * innerR);
                    ctx.lineTo(this.x + Math.cos(angle) * outerR, this.y + Math.sin(angle) * outerR);
                    ctx.stroke();
                }
                // Center warning
                ctx.beginPath();
                ctx.arc(this.x, this.y, 8, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'turbulence':
                // Chaotic squiggles
                ctx.strokeStyle = '#aa44ff';
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * pulse, 0, Math.PI * 2);
                ctx.stroke();
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    const startAngle = Math.random() * Math.PI * 2;
                    let px = this.x + Math.cos(startAngle) * 10;
                    let py = this.y + Math.sin(startAngle) * 10;
                    ctx.moveTo(px, py);
                    for (let j = 0; j < 20; j++) {
                        const noiseVal = noise.noise2D(px * 0.05 + this.turbulenceSeed + i, py * 0.05 + time * 0.02);
                        const angle = noiseVal * Math.PI * 2;
                        px += Math.cos(angle) * 5;
                        py += Math.sin(angle) * 5;
                        ctx.lineTo(px, py);
                    }
                    ctx.stroke();
                }
                break;

            case 'lane':
                // Parallel arrows showing flow direction
                ctx.strokeStyle = '#44aaff';
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * pulse, 0, Math.PI * 2);
                ctx.stroke();
                const laneCount = 5;
                for (let i = 0; i < laneCount; i++) {
                    const perpDist = (i - (laneCount - 1) / 2) * 25;
                    const perpX = -Math.sin(this.laneAngle) * perpDist;
                    const perpY = Math.cos(this.laneAngle) * perpDist;
                    const cx = this.x + perpX;
                    const cy = this.y + perpY;
                    // Arrow
                    const arrowLen = 30;
                    const endX = cx + Math.cos(this.laneAngle) * arrowLen;
                    const endY = cy + Math.sin(this.laneAngle) * arrowLen;
                    ctx.beginPath();
                    ctx.moveTo(cx - Math.cos(this.laneAngle) * arrowLen, cy - Math.sin(this.laneAngle) * arrowLen);
                    ctx.lineTo(endX, endY);
                    ctx.lineTo(endX - Math.cos(this.laneAngle - 0.5) * 10, endY - Math.sin(this.laneAngle - 0.5) * 10);
                    ctx.moveTo(endX, endY);
                    ctx.lineTo(endX - Math.cos(this.laneAngle + 0.5) * 10, endY - Math.sin(this.laneAngle + 0.5) * 10);
                    ctx.stroke();
                }
                break;
        }

        ctx.restore();
    }

    isDead() {
        return this.life <= 0;
    }
}

function spawnForceField(type = null) {
    if (forceFields.length < 15) { // Max 15 force fields
        forceFields.push(new ForceField(type));
        console.log('Spawned', type || 'random', 'force field. Total:', forceFields.length);
    } else {
        console.log('Max force fields reached (15). Clear some first.');
    }
}

function clearForceFields() {
    forceFields = [];
}

function toggleForceFieldVisibility() {
    showForceFields = !showForceFields;
}

function cycleNoiseMode() {
    config.noiseMode = (config.noiseMode + 1) % 6;
    const modeNames = ['Classic', 'Turbulent fBm', 'Ridged', 'Billow', 'Domain Warp', 'Forces Only'];
    document.getElementById('info').textContent = `Flow Fields - ${modeNames[config.noiseMode]}`;
}

function toggleBrownian() {
    config.brownianMotion = config.brownianMotion > 0 ? 0 : 1.5;
    document.getElementById('info').textContent = `Flow Fields - Brownian: ${config.brownianMotion > 0 ? 'ON' : 'OFF'}`;
}

// Simplex noise implementation (simplified Perlin-like noise)
class NoiseGenerator {
    constructor(seed = Math.random() * 10000) {
        this.seed = seed;
        this.perm = new Uint8Array(512);
        this.gradP = new Array(512);

        const grad3 = [
            [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
            [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
            [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
        ];

        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;

        // Shuffle based on seed
        let n = seed;
        for (let i = 255; i > 0; i--) {
            n = (n * 16807) % 2147483647;
            const j = n % (i + 1);
            [p[i], p[j]] = [p[j], p[i]];
        }

        for (let i = 0; i < 512; i++) {
            this.perm[i] = p[i & 255];
            this.gradP[i] = grad3[this.perm[i] % 12];
        }
    }

    dot(g, x, y) {
        return g[0] * x + g[1] * y;
    }

    noise2D(x, y) {
        const F2 = 0.5 * (Math.sqrt(3) - 1);
        const G2 = (3 - Math.sqrt(3)) / 6;

        let s = (x + y) * F2;
        let i = Math.floor(x + s);
        let j = Math.floor(y + s);

        let t = (i + j) * G2;
        let X0 = i - t;
        let Y0 = j - t;
        let x0 = x - X0;
        let y0 = y - Y0;

        let i1, j1;
        if (x0 > y0) { i1 = 1; j1 = 0; }
        else { i1 = 0; j1 = 1; }

        let x1 = x0 - i1 + G2;
        let y1 = y0 - j1 + G2;
        let x2 = x0 - 1 + 2 * G2;
        let y2 = y0 - 1 + 2 * G2;

        i &= 255;
        j &= 255;

        let gi0 = this.gradP[i + this.perm[j]];
        let gi1 = this.gradP[i + i1 + this.perm[j + j1]];
        let gi2 = this.gradP[i + 1 + this.perm[j + 1]];

        let n0, n1, n2;

        let t0 = 0.5 - x0*x0 - y0*y0;
        if (t0 < 0) n0 = 0;
        else {
            t0 *= t0;
            n0 = t0 * t0 * this.dot(gi0, x0, y0);
        }

        let t1 = 0.5 - x1*x1 - y1*y1;
        if (t1 < 0) n1 = 0;
        else {
            t1 *= t1;
            n1 = t1 * t1 * this.dot(gi1, x1, y1);
        }

        let t2 = 0.5 - x2*x2 - y2*y2;
        if (t2 < 0) n2 = 0;
        else {
            t2 *= t2;
            n2 = t2 * t2 * this.dot(gi2, x2, y2);
        }

        return 70 * (n0 + n1 + n2);
    }
}

let noise = new NoiseGenerator();

// Particle class
class Particle {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.prevX = this.x;
        this.prevY = this.y;
        this.speed = config.speed * (0.5 + Math.random() * 0.5);
        this.colorIndex = Math.floor(Math.random() * colorSchemes[config.colorScheme].length);
        this.life = 0;
        this.maxLife = 100 + Math.random() * 200;
        this.velocity = 0; // Track current velocity for color
        this.hue = Math.random(); // For velocity coloring
    }

    update() {
        this.prevX = this.x;
        this.prevY = this.y;

        let moveX = 0;
        let moveY = 0;

        // Get flow direction from noise field based on mode
        if (config.noiseMode !== 5) { // Mode 5 = Forces Only (no background field)
            let noiseVal;
            const nx = this.x * config.noiseScale + time * 0.0001;
            const ny = this.y * config.noiseScale + time * 0.0001;

            switch (config.noiseMode) {
                case 0: // Classic - single noise layer
                    noiseVal = noise.noise2D(nx, ny);
                    break;
                case 1: // Turbulent fBm - 4 octaves with decreasing amplitude
                    noiseVal = noise.noise2D(nx, ny) * 0.5 +
                               noise.noise2D(nx * 2, ny * 2) * 0.25 +
                               noise.noise2D(nx * 4, ny * 4) * 0.125 +
                               noise.noise2D(nx * 8, ny * 8) * 0.0625;
                    break;
                case 2: // Ridged multifractal - sharp ridges
                    noiseVal = 1 - Math.abs(noise.noise2D(nx, ny));
                    noiseVal *= noiseVal; // Square for sharper ridges
                    noiseVal += (1 - Math.abs(noise.noise2D(nx * 2, ny * 2))) * 0.5;
                    noiseVal += (1 - Math.abs(noise.noise2D(nx * 4, ny * 4))) * 0.25;
                    noiseVal = noiseVal * 0.7 - 0.5; // Normalize
                    break;
                case 3: // Billow - soft puffy clouds
                    noiseVal = Math.abs(noise.noise2D(nx, ny)) * 0.5 +
                               Math.abs(noise.noise2D(nx * 2, ny * 2)) * 0.25 +
                               Math.abs(noise.noise2D(nx * 4, ny * 4)) * 0.125;
                    noiseVal = noiseVal * 2 - 0.5;
                    break;
                case 4: // Warp - domain warping for swirly organic shapes
                    const warpX = noise.noise2D(nx, ny) * 0.5;
                    const warpY = noise.noise2D(nx + 5.2, ny + 1.3) * 0.5;
                    noiseVal = noise.noise2D(nx + warpX, ny + warpY);
                    noiseVal += noise.noise2D((nx + warpX) * 2, (ny + warpY) * 2) * 0.5;
                    break;
                default: // Forces only - no background
                    noiseVal = 0;
            }

            const angle = noiseVal * Math.PI * 4;
            moveX = Math.cos(angle) * this.speed * config.backgroundStrength;
            moveY = Math.sin(angle) * this.speed * config.backgroundStrength;
        }

        // Add brownian motion (random jitter)
        if (config.brownianMotion > 0) {
            moveX += (Math.random() - 0.5) * config.brownianMotion;
            moveY += (Math.random() - 0.5) * config.brownianMotion;
        }

        // Apply force fields with configurable strength
        for (const field of forceFields) {
            const force = field.getForce(this.x, this.y);
            moveX += force.fx * config.forceFieldStrength;
            moveY += force.fy * config.forceFieldStrength;
        }

        // Global gravity
        if (config.globalGravity !== 0) {
            moveY += config.globalGravity;
        }

        // Particle interactions
        if (config.particleInteraction !== 'none') {
            const nearby = getNearbyParticles(this.x, this.y, config.interactionRadius);
            let interactX = 0, interactY = 0;
            let alignX = 0, alignY = 0;
            let neighborCount = 0;

            // Determine interaction mode - for 'zones' mode, use noise to vary by position
            let activeMode = config.particleInteraction;
            if (config.particleInteraction === 'zones') {
                const zoneNoise = noise.noise2D(this.x * 0.005 + time * 0.0002, this.y * 0.005);
                if (zoneNoise < -0.3) {
                    activeMode = 'attract';
                } else if (zoneNoise > 0.3) {
                    activeMode = 'repel';
                } else {
                    activeMode = 'align';
                }
            }

            for (const other of nearby) {
                if (other === this) continue;

                const dx = other.x - this.x;
                const dy = other.y - this.y;
                const distSq = dx * dx + dy * dy;
                const dist = Math.sqrt(distSq);

                if (dist > 0 && dist < config.interactionRadius) {
                    neighborCount++;
                    const force = (config.interactionRadius - dist) / config.interactionRadius;

                    switch (activeMode) {
                        case 'attract':
                            // Pull toward neighbors
                            interactX += (dx / dist) * force;
                            interactY += (dy / dist) * force;
                            break;
                        case 'repel':
                            // Push away from neighbors
                            interactX -= (dx / dist) * force * 2;
                            interactY -= (dy / dist) * force * 2;
                            break;
                        case 'align':
                            // Track average direction of neighbors
                            const otherVX = other.x - other.prevX;
                            const otherVY = other.y - other.prevY;
                            alignX += otherVX;
                            alignY += otherVY;
                            break;
                    }
                }
            }

            if (neighborCount > 0) {
                if (activeMode === 'align') {
                    // Blend toward average neighbor direction
                    alignX /= neighborCount;
                    alignY /= neighborCount;
                    const alignMag = Math.sqrt(alignX * alignX + alignY * alignY);
                    if (alignMag > 0) {
                        moveX = moveX * 0.7 + (alignX / alignMag) * this.speed * 0.3 * config.interactionStrength;
                        moveY = moveY * 0.7 + (alignY / alignMag) * this.speed * 0.3 * config.interactionStrength;
                    }
                } else {
                    moveX += interactX * config.interactionStrength * 0.5;
                    moveY += interactY * config.interactionStrength * 0.5;
                }
            }
        }

        // Mouse interaction - different modes
        if (mouse.active && mouse.x !== null) {
            const dx = this.x - mouse.x;
            const dy = this.y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < mouse.radius && dist > 5) {
                const force = (mouse.radius - dist) / mouse.radius;
                const mouseAngle = Math.atan2(dy, dx);

                switch (config.mouseMode) {
                    case 'vortex':
                        // Swirl around mouse
                        const swirlAngle = mouseAngle + Math.PI / 2;
                        const newAngle = Math.atan2(moveY, moveX);
                        const blendedAngle = newAngle * (1 - force * 0.8) + swirlAngle * force * 0.8;
                        const speed = Math.sqrt(moveX * moveX + moveY * moveY);
                        moveX = Math.cos(blendedAngle) * speed * (1 + force);
                        moveY = Math.sin(blendedAngle) * speed * (1 + force);
                        break;
                    case 'attract':
                        // Pull toward mouse
                        moveX -= (dx / dist) * force * 3;
                        moveY -= (dy / dist) * force * 3;
                        break;
                    case 'repel':
                        // Push away from mouse
                        moveX += (dx / dist) * force * 3;
                        moveY += (dy / dist) * force * 3;
                        break;
                }
            }
        }

        // Store velocity for color
        this.velocity = Math.sqrt(moveX * moveX + moveY * moveY);

        this.x += moveX;
        this.y += moveY;
        this.life++;

        // Reset if out of bounds or too old
        if (this.x < 0 || this.x > canvas.width ||
            this.y < 0 || this.y > canvas.height ||
            this.life > this.maxLife) {
            this.reset();
        }
    }

    draw() {
        let color;

        if (config.velocityColor) {
            // Color based on velocity - map speed to hue
            const hue = (this.velocity / 8) * 360; // Normalize velocity to hue
            const saturation = 80;
            const lightness = 50 + Math.min(this.velocity * 5, 30);
            color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        } else {
            const colors = colorSchemes[config.colorScheme];
            color = colors[this.colorIndex % colors.length];
        }

        // Smooth fade over entire lifetime - starts bright, gradually dims
        // This prevents grey buildup from alpha blending artifacts
        const lifeRatio = this.life / this.maxLife;
        let alpha = 1.0 - (lifeRatio * lifeRatio); // Quadratic fade - stays bright longer, then fades

        // Quick fade-in at start
        const fadeInSpeed = 10 / config.trailLength;
        if (this.life < fadeInSpeed) alpha *= this.life / fadeInSpeed;

        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha * 0.7;
        ctx.lineWidth = config.lineWidth;
        ctx.beginPath();
        ctx.moveTo(this.prevX, this.prevY);
        ctx.lineTo(this.x, this.y);
        ctx.stroke();
    }
}

// Initialize
function init() {
    resize();
    particles = [];
    for (let i = 0; i < config.particleCount; i++) {
        particles.push(new Particle());
    }
    // Clear canvas with background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function animate() {
    if (paused) {
        animationId = requestAnimationFrame(animate);
        return;
    }

    // Subtle fade effect for trails
    ctx.fillStyle = `rgba(0, 0, 0, ${config.fadeAmount})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Randomly spawn force fields (boosted rate in Forces Only mode)
    const effectiveSpawnRate = config.noiseMode === 5 ? config.spawnRate * 3 : config.spawnRate;
    if (Math.random() < effectiveSpawnRate && forceFields.length < 15) {
        spawnForceField();
    }

    // Update force fields
    forceFields = forceFields.filter(f => !f.isDead());
    for (const field of forceFields) {
        field.update();
        field.draw();
    }

    // Build spatial grid for particle interactions
    if (config.particleInteraction !== 'none') {
        buildSpatialGrid();
    }

    // Update and draw particles
    ctx.globalAlpha = 1;
    for (const particle of particles) {
        particle.update();
        particle.draw();
    }

    // In Forces Only mode, continuously spawn new particles at random positions
    // to keep things lively even in areas without force fields
    if (config.noiseMode === 5) {
        const spawnCount = Math.floor(config.particleCount * 0.002); // ~0.2% per frame
        for (let i = 0; i < spawnCount; i++) {
            const idx = Math.floor(Math.random() * particles.length);
            if (particles[idx].life > 50) { // Only reset older particles
                particles[idx].reset();
            }
        }
    }

    // Manual respawn rate - continuously respawn particles at random positions
    if (config.respawnRate > 0) {
        const spawnCount = Math.floor(config.particleCount * config.respawnRate);
        for (let i = 0; i < spawnCount; i++) {
            const idx = Math.floor(Math.random() * particles.length);
            particles[idx].reset();
        }
    }

    // Draw mouse influence area (subtle)
    if (mouse.active && mouse.x !== null) {
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, mouse.radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    time++;
    animationId = requestAnimationFrame(animate);
}

// Control functions
function reset() {
    noise = new NoiseGenerator();
    init();
}

function togglePause() {
    paused = !paused;
}

function cycleColorScheme() {
    config.colorScheme = (config.colorScheme + 1) % colorSchemes.length;
    // Update particle colors
    for (const particle of particles) {
        particle.colorIndex = Math.floor(Math.random() * colorSchemes[config.colorScheme].length);
    }
    // Flash update the info
    const info = document.getElementById('info');
    const schemeNames = ['Aurora', 'Sunset', 'Ocean', 'Forest', 'Fire', 'Neon', 'Monochrome', 'Vapor'];
    info.textContent = `Flow Fields - ${schemeNames[config.colorScheme]}`;
}

function saveImage() {
    const link = document.createElement('a');
    link.download = `flow-field-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
}

// Event listeners
window.addEventListener('resize', () => {
    resize();
    init();
});

// Keyboard controls
window.addEventListener('keydown', (e) => {
    switch(e.key) {
        case ' ':
            togglePause();
            break;
        case 'c':
            cycleColorScheme();
            break;
        case 'r':
            reset();
            break;
        case 's':
            saveImage();
            break;
        case '1':
            spawnForceField('sink');
            break;
        case '2':
            spawnForceField('source');
            break;
        case '3':
            spawnForceField('vortex');
            break;
        case '4':
            spawnForceField('gravity');
            break;
        case '5':
            spawnForceField('shear');
            break;
        case '6':
            spawnForceField('repulsor');
            break;
        case '7':
            spawnForceField('turbulence');
            break;
        case '8':
            spawnForceField('lane');
            break;
        case 'i': // Cycle particle interaction mode
            const modes = ['none', 'attract', 'repel', 'align', 'zones'];
            const currentIdx = modes.indexOf(config.particleInteraction);
            config.particleInteraction = modes[(currentIdx + 1) % modes.length];
            console.log('Particle interaction:', config.particleInteraction);
            document.getElementById('info').textContent = `Flow Fields - Interaction: ${config.particleInteraction}`;
            break;
        case 'f':
            toggleForceFieldVisibility();
            break;
        case 'x':
            clearForceFields();
            break;
        case 'n': // Cycle noise mode
            config.noiseMode = (config.noiseMode + 1) % 6;
            const modeNames = ['Classic', 'Turbulent fBm', 'Ridged', 'Billow', 'Domain Warp', 'Forces Only'];
            console.log('Noise mode:', modeNames[config.noiseMode]);
            document.getElementById('info').textContent = `Flow Fields - ${modeNames[config.noiseMode]}`;
            break;
        case 'b': // Toggle brownian motion
            config.brownianMotion = config.brownianMotion > 0 ? 0 : 1;
            console.log('Brownian motion:', config.brownianMotion > 0 ? 'ON' : 'OFF');
            break;
        case '[': // Decrease background strength
            config.backgroundStrength = Math.max(0, config.backgroundStrength - 0.2);
            console.log('Background strength:', config.backgroundStrength.toFixed(1));
            break;
        case ']': // Increase background strength
            config.backgroundStrength = Math.min(2, config.backgroundStrength + 0.2);
            console.log('Background strength:', config.backgroundStrength.toFixed(1));
            break;
        case '-': // Decrease force field strength
            config.forceFieldStrength = Math.max(0.2, config.forceFieldStrength - 0.2);
            console.log('Force field strength:', config.forceFieldStrength.toFixed(1));
            break;
        case '=': // Increase force field strength
            config.forceFieldStrength = Math.min(3, config.forceFieldStrength + 0.2);
            console.log('Force field strength:', config.forceFieldStrength.toFixed(1));
            break;
        case '+': // Increase spawn rate
            config.spawnRate = Math.min(0.05, config.spawnRate + 0.005);
            console.log('Spawn rate:', config.spawnRate.toFixed(3));
            break;
    }
});

// Mouse controls
canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
});

canvas.addEventListener('mouseleave', () => {
    mouse.active = false;
});

canvas.addEventListener('mouseenter', () => {
    mouse.active = true;
});

// Click to spawn force field at mouse position
let spawnTypeOnClick = 'random'; // 'random', 'sink', 'source', 'vortex', 'gravity'

canvas.addEventListener('click', (e) => {
    const type = spawnTypeOnClick === 'random' ? null : spawnTypeOnClick;
    const field = new ForceField(type);
    field.x = e.clientX;
    field.y = e.clientY;
    if (forceFields.length < 10) {
        forceFields.push(field);
    }
});

// Right-click to cycle spawn type
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const types = ['random', 'sink', 'source', 'vortex', 'gravity'];
    const currentIdx = types.indexOf(spawnTypeOnClick);
    spawnTypeOnClick = types[(currentIdx + 1) % types.length];
    console.log('Click spawn type:', spawnTypeOnClick);
});

// Start
init();
animate();

console.log('Flow Fields loaded!');
console.log('Basic: Space=Pause, C=Colors, R=Reset, S=Save');
console.log('Force Fields: 1=Sink, 2=Source, 3=Vortex, 4=Gravity, F=Toggle, X=Clear');
console.log('Click=Spawn at cursor, Right-click=Cycle spawn type');
console.log('Modes: N=Noise mode, B=Brownian, [/]=Background, -/+=Force strength');
