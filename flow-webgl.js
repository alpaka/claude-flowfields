// Flow Fields - WebGL GPU-Accelerated Version
// Particles computed and rendered entirely on GPU

class FlowFieldsGL {
    constructor(canvas, initialConfig = {}) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
        if (!this.gl) {
            throw new Error('WebGL2 not supported');
        }

        this.config = {
            particleCount: 250000,  // 250k particles default
            particleOpacity: 0.15,
            noiseScale: 0.003,
            speed: 1.0,
            fadeAmount: 0.03,
            colorScheme: 0,
            noiseMode: 1,
            backgroundStrength: 1.0,
            forceFieldStrength: 1.0,
            brownianMotion: 1.5,
            respawnRate: 0.002,
            zonesEnabled: false,
            zonesStrength: 1.0,
            globalGravity: 0,
            particleSize: 1.5,
            forceSpawnRate: 0,      // Auto-spawn rate (0 = disabled, 1 = ~1 per second at 60fps)
            forceLifetime: 1.0,     // Lifetime multiplier (1.0 = default 500-1000 frames)
            maxForceRadius: 200,    // Maximum radius for spawned forces
            globalSwirl: 0,         // Global rotation around center (-1 to 1)
            chargeInteraction: 0,   // Particle charge interaction strength (0 = disabled)
            chargeRatio: 0.5,       // Fraction of positive charges (0.5 = half and half)
            gravityInteraction: 0,  // Particle gravity interaction (-2 to +2, negative repels)
            friction: 0.005,        // Friction in Forces Only mode (0-0.1)
            time: 0,
            ...initialConfig  // Apply initial config before init()
        };

        // Force fields stored as uniform data
        this.forceFields = [];
        this.maxForceFields = 40;
        this.enabledForceTypes = [true, true, true, true, true]; // Which types can auto-spawn

        // Mouse state
        this.mouse = { x: -1000, y: -1000, radius: 150, strength: 1.0, mode: 0 };
        this.paused = false;

        this.init();
    }

    init() {
        const gl = this.gl;

        // Enable required extensions
        gl.getExtension('EXT_color_buffer_float');
        gl.getExtension('OES_texture_float_linear');

        // Compile shaders
        this.physicsProgram = this.createProgram(physicsVertexShader, physicsFragmentShader);
        this.renderProgram = this.createProgram(renderVertexShader, renderFragmentShader);
        this.trailProgram = this.createProgram(trailVertexShader, trailFragmentShader);
        this.copyProgram = this.createProgram(copyVertexShader, copyFragmentShader);

        // Create particle state textures (ping-pong)
        this.particleTextures = [
            this.createParticleTexture(),
            this.createParticleTexture()
        ];
        this.currentTexture = 0;

        // Create framebuffers for physics computation
        this.framebuffers = [
            this.createFramebuffer(this.particleTextures[0]),
            this.createFramebuffer(this.particleTextures[1])
        ];

        // Create trail texture for fade effect
        this.trailTexture = this.createTrailTexture();
        this.trailFramebuffer = this.createFramebuffer(this.trailTexture);

        // Clear the trail framebuffer and canvas to black
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.trailFramebuffer);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Full-screen quad for physics computation
        this.quadBuffer = this.createQuadBuffer();

        // Particle vertex buffer (just indices)
        this.particleBuffer = this.createParticleBuffer();

        // Initialize particles with random positions
        this.initializeParticles();

        // Set up event listeners
        this.setupEvents();

        console.log(`WebGL Flow Fields initialized with ${this.config.particleCount.toLocaleString()} particles`);
    }

    createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    createProgram(vertexSource, fragmentSource) {
        const gl = this.gl;
        const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(program));
            return null;
        }
        return program;
    }

    createParticleTexture() {
        const gl = this.gl;
        // Calculate texture size to hold all particles
        // Each pixel stores: (x, y, vx, vy) in RGBA
        const size = Math.ceil(Math.sqrt(this.config.particleCount));
        this.textureSize = size;

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size, size, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        return texture;
    }

    createTrailTexture() {
        const gl = this.gl;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
    }

    createFramebuffer(texture) {
        const gl = this.gl;
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        return fb;
    }

    createQuadBuffer() {
        const gl = this.gl;
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 1, -1, -1, 1,
            -1, 1, 1, -1, 1, 1
        ]), gl.STATIC_DRAW);
        return buffer;
    }

    createParticleBuffer() {
        const gl = this.gl;
        // Create buffer with particle indices - sample from texel centers
        const indices = new Float32Array(this.config.particleCount * 2);
        const size = this.textureSize;
        for (let i = 0; i < this.config.particleCount; i++) {
            // Add 0.5 to sample from texel center, not corner
            indices[i * 2] = ((i % size) + 0.5) / size;
            indices[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size;
        }

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        return buffer;
    }

    initializeParticles(uniform = false) {
        const gl = this.gl;
        const size = this.textureSize;
        const data = new Float32Array(size * size * 4);

        if (uniform) {
            // Uniform grid distribution
            const cols = Math.ceil(Math.sqrt(this.config.particleCount * this.canvas.width / this.canvas.height));
            const rows = Math.ceil(this.config.particleCount / cols);
            const spacingX = this.canvas.width / cols;
            const spacingY = this.canvas.height / rows;

            for (let i = 0; i < this.config.particleCount; i++) {
                const idx = i * 4;
                const col = i % cols;
                const row = Math.floor(i / cols);
                data[idx] = (col + 0.5) * spacingX;      // x
                data[idx + 1] = (row + 0.5) * spacingY;  // y
                data[idx + 2] = 0;                        // vx
                data[idx + 3] = 0;                        // vy
            }
        } else {
            // Random distribution
            for (let i = 0; i < this.config.particleCount; i++) {
                const idx = i * 4;
                data[idx] = Math.random() * this.canvas.width;      // x
                data[idx + 1] = Math.random() * this.canvas.height; // y
                data[idx + 2] = (Math.random() - 0.5) * 2;          // vx
                data[idx + 3] = (Math.random() - 0.5) * 2;          // vy
            }
        }

        gl.bindTexture(gl.TEXTURE_2D, this.particleTextures[0]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size, size, 0, gl.RGBA, gl.FLOAT, data);
        gl.bindTexture(gl.TEXTURE_2D, this.particleTextures[1]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size, size, 0, gl.RGBA, gl.FLOAT, data);
    }

    setupEvents() {
        // Mouse events
        this.canvas.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = this.canvas.height - e.clientY; // Flip Y for WebGL
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.mouse.x = -1000;
            this.mouse.y = -1000;
        });

        this.canvas.addEventListener('click', (e) => {
            this.addForceField(e.clientX, this.canvas.height - e.clientY);
        });

        // Touch events for mobile
        let touchStart = { x: 0, y: 0 };

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.mouse.x = touch.clientX;
            this.mouse.y = this.canvas.height - touch.clientY;
            touchStart.x = touch.clientX;
            touchStart.y = touch.clientY;
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.mouse.x = touch.clientX;
            this.mouse.y = this.canvas.height - touch.clientY;
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            // Check if it was a tap (didn't move much)
            const touch = e.changedTouches[0];
            const dx = touch.clientX - touchStart.x;
            const dy = touch.clientY - touchStart.y;
            if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
                this.addForceField(touch.clientX, this.canvas.height - touch.clientY);
            }
            this.mouse.x = -1000;
            this.mouse.y = -1000;
        });
    }

    addForceField(x, y, type = -1) {
        if (this.forceFields.length >= this.maxForceFields) {
            this.forceFields.shift();
        }

        // Determine type - if random (-1), pick from enabled types only
        let finalType = type;
        if (type < 0) {
            const enabledTypes = [];
            for (let i = 0; i < 5; i++) {
                if (this.enabledForceTypes[i]) enabledTypes.push(i);
            }
            if (enabledTypes.length === 0) return; // No types enabled, don't spawn
            finalType = enabledTypes[Math.floor(Math.random() * enabledTypes.length)];
        }

        const baseLife = 500 + Math.random() * 500;
        const minRadius = Math.max(40, this.config.maxForceRadius * 0.3);
        const radiusRange = this.config.maxForceRadius - minRadius;
        this.forceFields.push({
            x: x,
            y: y,
            type: finalType,
            strength: 50 + Math.random() * 100,
            radius: minRadius + Math.random() * radiusRange,
            rotation: Math.random() > 0.5 ? 1 : -1,
            life: baseLife * this.config.forceLifetime,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5
        });
    }

    updateForceFields() {
        for (let i = this.forceFields.length - 1; i >= 0; i--) {
            const f = this.forceFields[i];
            f.x += f.vx;
            f.y += f.vy;
            f.life--;

            // Bounce off edges
            if (f.x < 0 || f.x > this.canvas.width) f.vx *= -1;
            if (f.y < 0 || f.y > this.canvas.height) f.vy *= -1;

            if (f.life <= 0) {
                this.forceFields.splice(i, 1);
            }
        }

        // Random spawning based on config (forceSpawnRate: 0=off, 1=~1/sec, higher=more)
        if (this.config.forceSpawnRate > 0 &&
            Math.random() < this.config.forceSpawnRate / 60 &&
            this.forceFields.length < this.maxForceFields) {
            this.addForceField(
                Math.random() * this.canvas.width,
                Math.random() * this.canvas.height
            );
        }
    }

    getForceFieldUniforms() {
        // Always allocate for max 40 force fields to match shader uniform size
        const data = new Float32Array(40 * 8);
        for (let i = 0; i < Math.min(this.maxForceFields, 40); i++) {
            const f = this.forceFields[i];
            if (f) {
                data[i * 8] = f.x;
                data[i * 8 + 1] = f.y;
                data[i * 8 + 2] = f.type;
                data[i * 8 + 3] = f.strength;
                data[i * 8 + 4] = f.radius;
                data[i * 8 + 5] = f.rotation;
                data[i * 8 + 6] = f.life / 500; // Normalized life
                data[i * 8 + 7] = 1.0; // Active flag
            } else {
                data[i * 8 + 7] = 0.0; // Inactive
            }
        }
        return data;
    }

    update() {
        const gl = this.gl;

        this.updateForceFields();

        // Physics pass - compute new particle positions
        const readTex = this.particleTextures[this.currentTexture];
        const writeTex = this.particleTextures[1 - this.currentTexture];
        const writeFB = this.framebuffers[1 - this.currentTexture];

        gl.bindFramebuffer(gl.FRAMEBUFFER, writeFB);
        gl.viewport(0, 0, this.textureSize, this.textureSize);

        gl.useProgram(this.physicsProgram);

        // Set uniforms
        gl.uniform1f(gl.getUniformLocation(this.physicsProgram, 'u_time'), this.config.time);
        gl.uniform2f(gl.getUniformLocation(this.physicsProgram, 'u_resolution'), this.canvas.width, this.canvas.height);
        gl.uniform1f(gl.getUniformLocation(this.physicsProgram, 'u_noiseScale'), this.config.noiseScale);
        gl.uniform1f(gl.getUniformLocation(this.physicsProgram, 'u_speed'), this.config.speed);
        gl.uniform1i(gl.getUniformLocation(this.physicsProgram, 'u_noiseMode'), this.config.noiseMode);
        gl.uniform1f(gl.getUniformLocation(this.physicsProgram, 'u_backgroundStrength'), this.config.backgroundStrength);
        gl.uniform1f(gl.getUniformLocation(this.physicsProgram, 'u_forceFieldStrength'), this.config.forceFieldStrength);
        gl.uniform1f(gl.getUniformLocation(this.physicsProgram, 'u_brownianMotion'), this.config.brownianMotion);
        gl.uniform1f(gl.getUniformLocation(this.physicsProgram, 'u_globalGravity'), this.config.globalGravity);
        gl.uniform1f(gl.getUniformLocation(this.physicsProgram, 'u_globalSwirl'), this.config.globalSwirl);
        gl.uniform3f(gl.getUniformLocation(this.physicsProgram, 'u_mouse'), this.mouse.x, this.mouse.y, this.mouse.radius);
        gl.uniform1f(gl.getUniformLocation(this.physicsProgram, 'u_mouseStrength'), this.mouse.strength);
        gl.uniform1i(gl.getUniformLocation(this.physicsProgram, 'u_mouseMode'), this.mouse.mode);
        gl.uniform1f(gl.getUniformLocation(this.physicsProgram, 'u_respawnRate'), this.config.respawnRate);
        gl.uniform1i(gl.getUniformLocation(this.physicsProgram, 'u_zonesEnabled'), this.config.zonesEnabled ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(this.physicsProgram, 'u_zonesStrength'), this.config.zonesStrength);
        gl.uniform1f(gl.getUniformLocation(this.physicsProgram, 'u_chargeInteraction'), this.config.chargeInteraction);
        gl.uniform1f(gl.getUniformLocation(this.physicsProgram, 'u_chargeRatio'), this.config.chargeRatio);
        gl.uniform1f(gl.getUniformLocation(this.physicsProgram, 'u_gravityInteraction'), this.config.gravityInteraction);
        gl.uniform1f(gl.getUniformLocation(this.physicsProgram, 'u_friction'), this.config.friction);
        gl.uniform1f(gl.getUniformLocation(this.physicsProgram, 'u_textureSize'), this.textureSize);

        // Force fields
        const forceFieldData = this.getForceFieldUniforms();
        gl.uniform1fv(gl.getUniformLocation(this.physicsProgram, 'u_forceFields'), forceFieldData);
        gl.uniform1i(gl.getUniformLocation(this.physicsProgram, 'u_forceFieldCount'), this.forceFields.length);

        // Bind particle state texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readTex);
        gl.uniform1i(gl.getUniformLocation(this.physicsProgram, 'u_particles'), 0);

        // Draw quad
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        const posLoc = gl.getAttribLocation(this.physicsProgram, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        this.currentTexture = 1 - this.currentTexture;
        this.config.time++;
    }

    render() {
        const gl = this.gl;

        // === STEP 1: Render to trail texture (accumulates over time) ===
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.trailFramebuffer);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        // Fade existing content by drawing semi-transparent black quad
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.useProgram(this.trailProgram);
        gl.uniform1f(gl.getUniformLocation(this.trailProgram, 'u_fade'), this.config.fadeAmount);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        const posLoc = gl.getAttribLocation(this.trailProgram, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Render particles to trail texture with additive blending
        gl.useProgram(this.renderProgram);

        gl.uniform2f(gl.getUniformLocation(this.renderProgram, 'u_resolution'), this.canvas.width, this.canvas.height);
        gl.uniform1i(gl.getUniformLocation(this.renderProgram, 'u_colorScheme'), this.config.colorScheme);
        gl.uniform1f(gl.getUniformLocation(this.renderProgram, 'u_particleSize'), this.config.particleSize);
        gl.uniform1f(gl.getUniformLocation(this.renderProgram, 'u_time'), this.config.time);
        gl.uniform1f(gl.getUniformLocation(this.renderProgram, 'u_opacity'), this.config.particleOpacity);
        gl.uniform1f(gl.getUniformLocation(this.renderProgram, 'u_chargeRatio'), this.config.chargeRatio);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.particleTextures[this.currentTexture]);
        gl.uniform1i(gl.getUniformLocation(this.renderProgram, 'u_particles'), 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer);
        const texCoordLoc = gl.getAttribLocation(this.renderProgram, 'a_texCoord');
        gl.enableVertexAttribArray(texCoordLoc);
        gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.drawArrays(gl.POINTS, 0, this.config.particleCount);

        // === STEP 2: Copy trail texture to screen ===
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.disable(gl.BLEND);

        gl.useProgram(this.copyProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.trailTexture);
        gl.uniform1i(gl.getUniformLocation(this.copyProgram, 'u_texture'), 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        const copyPosLoc = gl.getAttribLocation(this.copyProgram, 'a_position');
        gl.enableVertexAttribArray(copyPosLoc);
        gl.vertexAttribPointer(copyPosLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // Recreate trail texture at new size
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.trailTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        // Clear the trail texture
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.trailFramebuffer);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    cleanup() {
        const gl = this.gl;

        // Stop animation
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        // Delete textures
        gl.deleteTexture(this.particleTextures[0]);
        gl.deleteTexture(this.particleTextures[1]);
        gl.deleteTexture(this.trailTexture);

        // Delete framebuffers
        gl.deleteFramebuffer(this.framebuffers[0]);
        gl.deleteFramebuffer(this.framebuffers[1]);
        gl.deleteFramebuffer(this.trailFramebuffer);

        // Delete buffers
        gl.deleteBuffer(this.quadBuffer);
        gl.deleteBuffer(this.particleBuffer);

        // Delete programs
        gl.deleteProgram(this.physicsProgram);
        gl.deleteProgram(this.renderProgram);
        gl.deleteProgram(this.trailProgram);
        gl.deleteProgram(this.copyProgram);

        // Clear canvas
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    animate() {
        if (!this.paused) {
            this.update();
        }
        this.render();
        this.animationId = requestAnimationFrame(() => this.animate());
    }
}

// ============ SHADERS ============

const physicsVertexShader = `#version 300 es
in vec2 a_position;
out vec2 v_texCoord;

void main() {
    v_texCoord = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const physicsFragmentShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_particles;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_noiseScale;
uniform float u_speed;
uniform int u_noiseMode;
uniform float u_backgroundStrength;
uniform float u_forceFieldStrength;
uniform float u_brownianMotion;
uniform float u_globalGravity;
uniform float u_globalSwirl;
uniform vec3 u_mouse;
uniform float u_mouseStrength;
uniform int u_mouseMode;
uniform float u_forceFields[320]; // 40 force fields * 8 floats each
uniform int u_forceFieldCount;
uniform float u_respawnRate;
uniform bool u_zonesEnabled;
uniform float u_zonesStrength;
uniform float u_chargeInteraction;
uniform float u_chargeRatio;
uniform float u_gravityInteraction;
uniform float u_friction;
uniform float u_textureSize;

// Simplex noise functions
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                           + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                           dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

// Hash-based pseudo-random (better distribution, no grid artifacts)
float random(vec2 st) {
    vec3 p3 = fract(vec3(st.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float getNoiseValue(vec2 pos, float time) {
    float ns = u_noiseScale;
    vec2 np = pos * ns + time * 0.0001;

    if (u_noiseMode == 0) {
        // Classic
        return snoise(np);
    } else if (u_noiseMode == 1) {
        // Turbulent fBm
        return snoise(np) * 0.5 +
               snoise(np * 2.0) * 0.25 +
               snoise(np * 4.0) * 0.125 +
               snoise(np * 8.0) * 0.0625;
    } else if (u_noiseMode == 2) {
        // Ridged
        float n = 1.0 - abs(snoise(np));
        n *= n;
        n += (1.0 - abs(snoise(np * 2.0))) * 0.5;
        n += (1.0 - abs(snoise(np * 4.0))) * 0.25;
        return n * 0.7 - 0.5;
    } else if (u_noiseMode == 3) {
        // Billow
        return abs(snoise(np)) * 0.5 +
               abs(snoise(np * 2.0)) * 0.25 +
               abs(snoise(np * 4.0)) * 0.125;
    } else if (u_noiseMode == 4) {
        // Domain warp
        float warpX = snoise(np) * 0.5;
        float warpY = snoise(np + vec2(5.2, 1.3)) * 0.5;
        return snoise(np + vec2(warpX, warpY)) +
               snoise((np + vec2(warpX, warpY)) * 2.0) * 0.5;
    }

    return 0.0; // Forces only mode
}

vec2 getForceFieldEffect(vec2 pos) {
    vec2 totalForce = vec2(0.0);

    for (int i = 0; i < 16; i++) {
        if (i >= u_forceFieldCount) break;

        int idx = i * 8;
        float fx = u_forceFields[idx];
        float fy = u_forceFields[idx + 1];
        float ftype = u_forceFields[idx + 2];
        float strength = u_forceFields[idx + 3];
        float radius = u_forceFields[idx + 4];
        float rotation = u_forceFields[idx + 5];
        float life = u_forceFields[idx + 6];
        float isActive = u_forceFields[idx + 7];

        if (isActive < 0.5) continue;

        vec2 diff = pos - vec2(fx, fy);
        float dist = length(diff);

        if (dist > radius || dist < 5.0) continue;

        float falloff = 1.0 - (dist / radius);
        float s = (strength / 100.0) * falloff * life;
        vec2 dir = normalize(diff);

        if (ftype < 0.5) {
            // Sink
            totalForce -= dir * s;
        } else if (ftype < 1.5) {
            // Source
            totalForce += dir * s;
        } else if (ftype < 2.5) {
            // Vortex
            vec2 perp = vec2(-diff.y, diff.x) / dist;
            totalForce += perp * s * rotation;
        } else if (ftype < 3.5) {
            // Gravity
            totalForce -= dir * s * 2.0;
            vec2 tangent = vec2(-diff.y, diff.x) / dist;
            totalForce += tangent * s * 0.3;
        } else {
            // Turbulence
            float angle = snoise(pos * 0.1 + u_time * 0.01) * 6.28318;
            totalForce += vec2(cos(angle), sin(angle)) * s * 2.0;
        }
    }

    return totalForce;
}

// Get charge for a particle based on its texture coordinate
float getCharge(vec2 texCoord) {
    float id = texCoord.x * u_textureSize + texCoord.y * u_textureSize * u_textureSize;
    return (fract(id * 0.7919) < u_chargeRatio) ? 1.0 : -1.0;
}

// Calculate charge interaction force by sampling nearby particles
vec2 getChargeInteraction(vec2 pos, vec2 texCoord) {
    if (u_chargeInteraction < 0.001) return vec2(0.0);

    float myCharge = getCharge(texCoord);
    vec2 totalForce = vec2(0.0);
    float interactionRadius = 100.0;

    // Sample nearby particles using a spiral pattern
    for (int i = 0; i < 16; i++) {
        float angle = float(i) * 2.399 + u_time * 0.01; // Golden angle spiral
        float r = (float(i) + 1.0) * 0.05;
        vec2 offset = vec2(cos(angle), sin(angle)) * r;
        vec2 sampleCoord = texCoord + offset;

        // Wrap sample coordinates
        sampleCoord = fract(sampleCoord);

        vec4 other = texture(u_particles, sampleCoord);
        vec2 otherPos = other.xy;
        float otherCharge = getCharge(sampleCoord);

        vec2 diff = pos - otherPos;
        float dist = length(diff);

        if (dist > 5.0 && dist < interactionRadius) {
            float forceMag = 1.0 / (dist * dist + 10.0);
            vec2 dir = normalize(diff);
            // Like charges repel (positive force), unlike attract (negative)
            float chargeProduct = myCharge * otherCharge;
            totalForce += dir * forceMag * chargeProduct * 50.0;
        }
    }

    return totalForce * u_chargeInteraction;
}

// Calculate gravity interaction force (all particles attract/repel each other)
vec2 getGravityInteraction(vec2 pos, vec2 texCoord) {
    if (abs(u_gravityInteraction) < 0.001) return vec2(0.0);

    vec2 totalForce = vec2(0.0);
    float interactionRadius = 120.0;

    // Sample nearby particles using a spiral pattern
    for (int i = 0; i < 16; i++) {
        float angle = float(i) * 2.399 + u_time * 0.01; // Golden angle spiral
        float r = (float(i) + 1.0) * 0.05;
        vec2 offset = vec2(cos(angle), sin(angle)) * r;
        vec2 sampleCoord = fract(texCoord + offset);

        vec4 other = texture(u_particles, sampleCoord);
        vec2 otherPos = other.xy;

        vec2 diff = otherPos - pos; // Points toward other particle
        float dist = length(diff);

        if (dist > 5.0 && dist < interactionRadius) {
            float forceMag = 1.0 / (dist * dist + 10.0);
            vec2 dir = normalize(diff);
            // Positive = attract toward other particles, negative = repel
            totalForce += dir * forceMag * 50.0;
        }
    }

    return totalForce * u_gravityInteraction;
}

void main() {
    vec4 particle = texture(u_particles, v_texCoord);
    vec2 pos = particle.xy;
    vec2 vel = particle.zw;

    // Get noise-based flow direction
    float noiseVal = getNoiseValue(pos, u_time);
    vec2 flowDir;
    if (u_noiseMode == 5) {
        // Forces Only mode - no background flow
        flowDir = vec2(0.0);
    } else {
        // Add position-based offset to prevent uniform drift when noise is near 0
        float posOffset = (pos.x + pos.y) * 0.001;
        float angle = (noiseVal + posOffset) * 12.566370614; // 4 * PI
        flowDir = vec2(cos(angle), sin(angle)) * u_speed * u_backgroundStrength;
    }

    // Add force field effects
    vec2 forceEffect = getForceFieldEffect(pos) * u_forceFieldStrength;

    // Add particle interactions
    vec2 chargeForce = getChargeInteraction(pos, v_texCoord);
    vec2 gravityForce = getGravityInteraction(pos, v_texCoord);
    forceEffect += chargeForce + gravityForce;

    // Add brownian motion - use independent seeds to avoid grid patterns
    vec2 brownian = vec2(
        random(vec2(pos.x * 0.1 + v_texCoord.y * 999.0, u_time + v_texCoord.x * 777.0)) - 0.5,
        random(vec2(u_time * 1.1 + v_texCoord.y * 555.0, pos.y * 0.1 + v_texCoord.x * 333.0)) - 0.5
    ) * u_brownianMotion;

    // Mouse interaction - stored separately for Forces Only mode
    vec2 mouseForce = vec2(0.0);
    vec2 mouseDiff = pos - u_mouse.xy;
    float mouseDist = length(mouseDiff);
    if (mouseDist < u_mouse.z && mouseDist > 5.0) {
        float force = (u_mouse.z - mouseDist) / u_mouse.z * u_mouseStrength;
        vec2 mouseDir = normalize(mouseDiff);

        if (u_mouseMode == 0) {
            // Vortex
            vec2 perp = vec2(-mouseDiff.y, mouseDiff.x) / mouseDist;
            mouseForce = perp * u_speed * 2.0 * force;
        } else if (u_mouseMode == 1) {
            // Attract
            mouseForce = -mouseDir * force * 3.0;
        } else {
            // Repel
            mouseForce = mouseDir * force * 3.0;
        }
    }
    flowDir += mouseForce;

    // Global gravity
    vec2 globalForces = vec2(0.0, -u_globalGravity);

    // Global swirl around screen center
    if (abs(u_globalSwirl) > 0.001) {
        vec2 center = u_resolution * 0.5;
        vec2 toCenter = pos - center;
        vec2 perpendicular = vec2(-toCenter.y, toCenter.x);
        float dist = length(toCenter);
        float swirlStrength = u_globalSwirl * (1.0 - dist / length(center));
        globalForces += normalize(perpendicular) * swirlStrength * 2.0;
    }
    flowDir += globalForces;

    // Zones mode - different behaviors in different areas
    if (u_zonesEnabled) {
        float zoneNoise = snoise(pos * 0.003 + u_time * 0.0001);
        float zoneNoise2 = snoise(pos * 0.005 + vec2(100.0, 50.0));

        if (zoneNoise < -0.3) {
            // Boost zone - speed up
            flowDir *= 1.5 * u_zonesStrength;
        } else if (zoneNoise > 0.3) {
            // Swirl zone - add rotation
            vec2 center = pos + vec2(snoise(pos * 0.01) * 100.0, snoise(pos.yx * 0.01) * 100.0);
            vec2 toCenter = center - pos;
            vec2 perpendicular = vec2(-toCenter.y, toCenter.x) * 0.02 * u_zonesStrength;
            flowDir += perpendicular;
        } else {
            // Turbulence zone - extra chaos
            float turbAngle = zoneNoise2 * 6.28318;
            flowDir += vec2(cos(turbAngle), sin(turbAngle)) * 0.5 * u_zonesStrength;
        }
    }

    // Update velocity
    if (u_noiseMode == 5) {
        // Forces Only mode: use acceleration-based physics with configurable friction
        // This preserves momentum so particles can orbit with gravity
        vec2 acceleration = (forceEffect + mouseForce + globalForces + brownian) * 0.1;
        vel += acceleration;
        vel *= (1.0 - u_friction); // Apply friction
    } else {
        // Normal mode: blend toward flow field velocity (acts like aether drag)
        vel = mix(vel, flowDir + forceEffect + brownian, 0.3);
    }

    // Update position
    pos += vel;

    // Wrap around edges
    if (pos.x < 0.0) pos.x += u_resolution.x;
    if (pos.x > u_resolution.x) pos.x -= u_resolution.x;
    if (pos.y < 0.0) pos.y += u_resolution.y;
    if (pos.y > u_resolution.y) pos.y -= u_resolution.y;

    // Random respawn to prevent convergence - use independent seeds
    float respawnRand = random(v_texCoord * 777.0 + u_time);
    if (respawnRand < u_respawnRate) {
        // Use different seed combinations to avoid grid patterns
        float seedX = random(vec2(v_texCoord.y * 9999.0, u_time * 3.7 + v_texCoord.x * 1111.0));
        float seedY = random(vec2(u_time * 2.3 + v_texCoord.x * 7777.0, v_texCoord.y * 3333.0));
        pos.x = seedX * u_resolution.x;
        pos.y = seedY * u_resolution.y;
        vel = vec2(0.0);
    }

    fragColor = vec4(pos, vel);
}`;

const renderVertexShader = `#version 300 es
in vec2 a_texCoord;

uniform sampler2D u_particles;
uniform vec2 u_resolution;
uniform float u_particleSize;

out float v_speed;
out float v_id;
out float v_angle;

void main() {
    vec4 particle = texture(u_particles, a_texCoord);
    vec2 pos = particle.xy;
    vec2 vel = particle.zw;

    // Convert to clip space
    vec2 clipPos = (pos / u_resolution) * 2.0 - 1.0;

    gl_Position = vec4(clipPos, 0.0, 1.0);
    gl_PointSize = u_particleSize;

    v_speed = length(vel);
    v_id = a_texCoord.x * 1000.0 + a_texCoord.y;
    // Angle from velocity (-PI to PI, normalized to 0-1)
    v_angle = (atan(vel.y, vel.x) + 3.14159265) / 6.28318530;
}`;

const renderFragmentShader = `#version 300 es
precision highp float;

in float v_speed;
in float v_id;
in float v_angle;
out vec4 fragColor;

uniform int u_colorScheme;
uniform float u_time;
uniform float u_opacity;
uniform float u_chargeRatio;

vec3 getColor(int scheme, float t) {
    // Aurora
    if (scheme == 0) {
        vec3 c1 = vec3(0.0, 1.0, 0.53);
        vec3 c2 = vec3(0.38, 0.94, 1.0);
        vec3 c3 = vec3(1.0, 0.0, 1.0);
        vec3 c4 = vec3(1.0, 0.0, 0.5);
        if (t < 0.33) return mix(c1, c2, t * 3.0);
        if (t < 0.66) return mix(c2, c3, (t - 0.33) * 3.0);
        return mix(c3, c4, (t - 0.66) * 3.0);
    }
    // Sunset
    if (scheme == 1) {
        vec3 c1 = vec3(1.0, 0.42, 0.21);
        vec3 c2 = vec3(0.97, 0.77, 0.62);
        vec3 c3 = vec3(0.94, 0.94, 0.94);
        if (t < 0.5) return mix(c1, c2, t * 2.0);
        return mix(c2, c3, (t - 0.5) * 2.0);
    }
    // Ocean
    if (scheme == 2) {
        vec3 c1 = vec3(0.0, 0.47, 0.71);
        vec3 c2 = vec3(0.0, 0.71, 0.85);
        vec3 c3 = vec3(0.56, 0.88, 0.94);
        if (t < 0.5) return mix(c1, c2, t * 2.0);
        return mix(c2, c3, (t - 0.5) * 2.0);
    }
    // Fire
    if (scheme == 3) {
        vec3 c1 = vec3(1.0, 0.0, 0.0);
        vec3 c2 = vec3(1.0, 0.33, 0.0);
        vec3 c3 = vec3(1.0, 0.6, 0.0);
        vec3 c4 = vec3(1.0, 0.8, 0.0);
        if (t < 0.33) return mix(c1, c2, t * 3.0);
        if (t < 0.66) return mix(c2, c3, (t - 0.33) * 3.0);
        return mix(c3, c4, (t - 0.66) * 3.0);
    }
    // Neon
    if (scheme == 4) {
        vec3 c1 = vec3(1.0, 0.0, 1.0);
        vec3 c2 = vec3(0.0, 1.0, 1.0);
        vec3 c3 = vec3(0.0, 1.0, 0.0);
        if (t < 0.5) return mix(c1, c2, t * 2.0);
        return mix(c2, c3, (t - 0.5) * 2.0);
    }
    // Vapor
    if (scheme == 5) {
        vec3 c1 = vec3(1.0, 0.44, 0.81);
        vec3 c2 = vec3(0.0, 0.81, 1.0);
        vec3 c3 = vec3(0.02, 1.0, 0.63);
        vec3 c4 = vec3(0.73, 0.4, 1.0);
        if (t < 0.33) return mix(c1, c2, t * 3.0);
        if (t < 0.66) return mix(c2, c3, (t - 0.33) * 3.0);
        return mix(c3, c4, (t - 0.66) * 3.0);
    }
    // Forest
    if (scheme == 6) {
        vec3 c1 = vec3(0.13, 0.37, 0.13);
        vec3 c2 = vec3(0.24, 0.55, 0.24);
        vec3 c3 = vec3(0.56, 0.74, 0.22);
        vec3 c4 = vec3(0.85, 0.65, 0.13);
        if (t < 0.33) return mix(c1, c2, t * 3.0);
        if (t < 0.66) return mix(c2, c3, (t - 0.33) * 3.0);
        return mix(c3, c4, (t - 0.66) * 3.0);
    }
    // Cosmic
    if (scheme == 7) {
        vec3 c1 = vec3(0.05, 0.0, 0.2);
        vec3 c2 = vec3(0.3, 0.0, 0.5);
        vec3 c3 = vec3(0.9, 0.2, 0.5);
        vec3 c4 = vec3(1.0, 0.8, 0.3);
        if (t < 0.33) return mix(c1, c2, t * 3.0);
        if (t < 0.66) return mix(c2, c3, (t - 0.33) * 3.0);
        return mix(c3, c4, (t - 0.66) * 3.0);
    }
    // Candy
    if (scheme == 8) {
        vec3 c1 = vec3(1.0, 0.4, 0.7);
        vec3 c2 = vec3(0.4, 0.8, 1.0);
        vec3 c3 = vec3(1.0, 0.95, 0.5);
        vec3 c4 = vec3(0.7, 1.0, 0.6);
        if (t < 0.33) return mix(c1, c2, t * 3.0);
        if (t < 0.66) return mix(c2, c3, (t - 0.33) * 3.0);
        return mix(c3, c4, (t - 0.66) * 3.0);
    }
    // Monochrome
    if (scheme == 9) {
        return vec3(t * 0.7 + 0.3);
    }
    // Rainbow
    if (scheme == 10) {
        float h = t * 6.0;
        float x = 1.0 - abs(mod(h, 2.0) - 1.0);
        if (h < 1.0) return vec3(1.0, x, 0.0);
        if (h < 2.0) return vec3(x, 1.0, 0.0);
        if (h < 3.0) return vec3(0.0, 1.0, x);
        if (h < 4.0) return vec3(0.0, x, 1.0);
        if (h < 5.0) return vec3(x, 0.0, 1.0);
        return vec3(1.0, 0.0, x);
    }
    // Velocity (blue=slow -> cyan -> green -> yellow -> red=fast)
    if (scheme == 11) {
        vec3 c1 = vec3(0.0, 0.2, 0.8);   // Deep blue (slow)
        vec3 c2 = vec3(0.0, 0.8, 1.0);   // Cyan
        vec3 c3 = vec3(0.0, 1.0, 0.4);   // Green
        vec3 c4 = vec3(1.0, 0.9, 0.0);   // Yellow
        vec3 c5 = vec3(1.0, 0.2, 0.0);   // Red (fast)
        if (t < 0.25) return mix(c1, c2, t * 4.0);
        if (t < 0.5) return mix(c2, c3, (t - 0.25) * 4.0);
        if (t < 0.75) return mix(c3, c4, (t - 0.5) * 4.0);
        return mix(c4, c5, (t - 0.75) * 4.0);
    }
    // Direction (hue wheel based on movement angle)
    if (scheme == 12) {
        float h = t * 6.0;
        float x = 1.0 - abs(mod(h, 2.0) - 1.0);
        if (h < 1.0) return vec3(1.0, x, 0.0);
        if (h < 2.0) return vec3(x, 1.0, 0.0);
        if (h < 3.0) return vec3(0.0, 1.0, x);
        if (h < 4.0) return vec3(0.0, x, 1.0);
        if (h < 5.0) return vec3(x, 0.0, 1.0);
        return vec3(1.0, 0.0, x);
    }
    // Charge (positive = red/orange, negative = blue/cyan)
    if (scheme == 13) {
        if (t > 0.5) {
            // Positive charge
            return mix(vec3(1.0, 0.5, 0.0), vec3(1.0, 0.2, 0.2), (t - 0.5) * 2.0);
        } else {
            // Negative charge
            return mix(vec3(0.2, 0.2, 1.0), vec3(0.0, 0.8, 1.0), t * 2.0);
        }
    }

    // Default white
    return vec3(1.0);
}

void main() {
    // Circular point
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;

    // Color based on speed and particle ID (or special modes for velocity/direction)
    float t;
    if (u_colorScheme == 11) {
        // Velocity mode: center around typical speed (~1.0), show variance
        float baseline = 1.0;
        float deviation = v_speed - baseline;
        t = clamp(0.5 + deviation * 0.4, 0.0, 1.0);
    } else if (u_colorScheme == 12) {
        // Direction mode: use movement angle
        t = v_angle;
    } else if (u_colorScheme == 13) {
        // Charge mode: derive charge from particle ID
        float charge = (fract(v_id * 0.7919) < u_chargeRatio) ? 1.0 : 0.0;
        t = charge;
    } else {
        t = fract(v_id * 0.1 + v_speed * 0.1);
    }
    vec3 color = getColor(u_colorScheme, t);

    // Soft edges - use configurable opacity
    float alpha = smoothstep(0.5, 0.2, dist) * u_opacity;

    fragColor = vec4(color, alpha);
}`;

const trailVertexShader = `#version 300 es
in vec2 a_position;
out vec2 v_texCoord;

void main() {
    v_texCoord = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const trailFragmentShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform float u_fade;

void main() {
    // Draw black with fade as alpha - this dims the existing content
    fragColor = vec4(0.0, 0.0, 0.0, u_fade);
}`;

const copyVertexShader = `#version 300 es
in vec2 a_position;
out vec2 v_texCoord;

void main() {
    v_texCoord = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const copyFragmentShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;

void main() {
    fragColor = texture(u_texture, v_texCoord);
}`;

// ============ INITIALIZATION ============

let flowFieldsGL;

function initWebGL() {
    const canvas = document.getElementById('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    try {
        flowFieldsGL = new FlowFieldsGL(canvas);
        flowFieldsGL.animate();

        // Update info
        document.getElementById('info').textContent = 'Flow Fields - WebGL (' + flowFieldsGL.config.particleCount.toLocaleString() + ' particles)';

        return true;
    } catch (e) {
        console.error('WebGL initialization failed:', e);
        return false;
    }
}

// Expose config for UI
function getConfig() {
    return flowFieldsGL ? flowFieldsGL.config : null;
}

function setConfig(key, value) {
    if (flowFieldsGL) {
        flowFieldsGL.config[key] = value;
    }
}

function reinitWithParticleCount(count) {
    if (!flowFieldsGL) return;

    // Save current config with new particle count
    const savedConfig = { ...flowFieldsGL.config };
    savedConfig.particleCount = count;
    savedConfig.time = 0;  // Reset time

    // Clean up old instance completely
    flowFieldsGL.cleanup();

    // Reinitialize with saved config (including new particle count)
    const canvas = document.getElementById('canvas');
    flowFieldsGL = new FlowFieldsGL(canvas, savedConfig);

    // Restart
    flowFieldsGL.animate();

    // Update display
    document.getElementById('info').textContent = 'Flow Fields - WebGL (' + count.toLocaleString() + ' particles)';
    document.getElementById('particle-display').textContent = count.toLocaleString();
}

window.addEventListener('resize', () => {
    if (flowFieldsGL) {
        flowFieldsGL.resize();
    }
    // Resize force overlay if it exists
    const overlay = document.getElementById('force-overlay');
    if (overlay) {
        overlay.width = window.innerWidth;
        overlay.height = window.innerHeight;
    }
});
