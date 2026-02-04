// Boids - Flocking Simulation
// Emergent flocking behavior from simple rules

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Configuration
let config = {
    boidCount: 200,
    maxSpeed: 4,
    maxForce: 0.1,
    separationDist: 25,
    alignmentDist: 50,
    cohesionDist: 50,
    separationWeight: 1.5,
    alignmentWeight: 1.0,
    cohesionWeight: 1.0,
    showTrails: false,
    species: 0,
    predatorActive: false,
    mouseAttract: true
};

// Species configurations
const species = [
    { name: 'Starlings', color: '#4a90d9', trailColor: 'rgba(74, 144, 217, 0.1)', size: 4 },
    { name: 'Fireflies', color: '#ffdd44', trailColor: 'rgba(255, 221, 68, 0.15)', size: 3 },
    { name: 'Fish', color: '#44ddaa', trailColor: 'rgba(68, 221, 170, 0.1)', size: 5 },
    { name: 'Butterflies', color: '#ff77aa', trailColor: 'rgba(255, 119, 170, 0.12)', size: 6 }
];

let boids = [];
let predator = null;
let mouse = { x: null, y: null, active: false };

class Boid {
    constructor(x, y) {
        this.position = { x: x ?? Math.random() * canvas.width, y: y ?? Math.random() * canvas.height };
        this.velocity = { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 };
        this.acceleration = { x: 0, y: 0 };
        this.trail = [];
        this.hueOffset = Math.random() * 0.1 - 0.05; // Slight color variation
    }

    update() {
        // Store position for trail
        if (config.showTrails) {
            this.trail.push({ ...this.position });
            if (this.trail.length > 20) this.trail.shift();
        }

        // Update velocity
        this.velocity.x += this.acceleration.x;
        this.velocity.y += this.acceleration.y;

        // Limit speed
        const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
        if (speed > config.maxSpeed) {
            this.velocity.x = (this.velocity.x / speed) * config.maxSpeed;
            this.velocity.y = (this.velocity.y / speed) * config.maxSpeed;
        }

        // Update position
        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;

        // Wrap around edges
        if (this.position.x < 0) this.position.x = canvas.width;
        if (this.position.x > canvas.width) this.position.x = 0;
        if (this.position.y < 0) this.position.y = canvas.height;
        if (this.position.y > canvas.height) this.position.y = 0;

        // Reset acceleration
        this.acceleration = { x: 0, y: 0 };
    }

    applyForce(force) {
        this.acceleration.x += force.x;
        this.acceleration.y += force.y;
    }

    flock(boids) {
        const separation = this.separate(boids);
        const alignment = this.align(boids);
        const cohesion = this.cohere(boids);

        // Weight forces
        separation.x *= config.separationWeight;
        separation.y *= config.separationWeight;
        alignment.x *= config.alignmentWeight;
        alignment.y *= config.alignmentWeight;
        cohesion.x *= config.cohesionWeight;
        cohesion.y *= config.cohesionWeight;

        this.applyForce(separation);
        this.applyForce(alignment);
        this.applyForce(cohesion);

        // Mouse interaction
        if (mouse.active && mouse.x !== null) {
            const mouseForce = this.seekOrFlee(mouse, config.mouseAttract);
            mouseForce.x *= 0.5;
            mouseForce.y *= 0.5;
            this.applyForce(mouseForce);
        }

        // Predator avoidance
        if (config.predatorActive && predator) {
            const flee = this.seekOrFlee(predator.position, false);
            flee.x *= 2;
            flee.y *= 2;
            this.applyForce(flee);
        }
    }

    separate(boids) {
        const steer = { x: 0, y: 0 };
        let count = 0;

        for (const other of boids) {
            const d = this.distance(other.position);
            if (d > 0 && d < config.separationDist) {
                const diff = {
                    x: this.position.x - other.position.x,
                    y: this.position.y - other.position.y
                };
                const len = Math.sqrt(diff.x ** 2 + diff.y ** 2);
                diff.x /= len;
                diff.y /= len;
                diff.x /= d; // Weight by distance
                diff.y /= d;
                steer.x += diff.x;
                steer.y += diff.y;
                count++;
            }
        }

        if (count > 0) {
            steer.x /= count;
            steer.y /= count;
            return this.limit(steer, config.maxForce);
        }
        return steer;
    }

    align(boids) {
        const sum = { x: 0, y: 0 };
        let count = 0;

        for (const other of boids) {
            const d = this.distance(other.position);
            if (d > 0 && d < config.alignmentDist) {
                sum.x += other.velocity.x;
                sum.y += other.velocity.y;
                count++;
            }
        }

        if (count > 0) {
            sum.x /= count;
            sum.y /= count;
            const len = Math.sqrt(sum.x ** 2 + sum.y ** 2);
            if (len > 0) {
                sum.x = (sum.x / len) * config.maxSpeed;
                sum.y = (sum.y / len) * config.maxSpeed;
            }
            const steer = { x: sum.x - this.velocity.x, y: sum.y - this.velocity.y };
            return this.limit(steer, config.maxForce);
        }
        return sum;
    }

    cohere(boids) {
        const sum = { x: 0, y: 0 };
        let count = 0;

        for (const other of boids) {
            const d = this.distance(other.position);
            if (d > 0 && d < config.cohesionDist) {
                sum.x += other.position.x;
                sum.y += other.position.y;
                count++;
            }
        }

        if (count > 0) {
            sum.x /= count;
            sum.y /= count;
            return this.seekOrFlee(sum, true);
        }
        return { x: 0, y: 0 };
    }

    seekOrFlee(target, seek = true) {
        const desired = {
            x: target.x - this.position.x,
            y: target.y - this.position.y
        };
        const len = Math.sqrt(desired.x ** 2 + desired.y ** 2);

        if (len < 200) { // Only within range
            if (len > 0) {
                desired.x = (desired.x / len) * config.maxSpeed;
                desired.y = (desired.y / len) * config.maxSpeed;
            }
            if (!seek) {
                desired.x *= -1;
                desired.y *= -1;
            }
            const steer = { x: desired.x - this.velocity.x, y: desired.y - this.velocity.y };
            return this.limit(steer, config.maxForce);
        }
        return { x: 0, y: 0 };
    }

    distance(other) {
        return Math.sqrt((this.position.x - other.x) ** 2 + (this.position.y - other.y) ** 2);
    }

    limit(vec, max) {
        const len = Math.sqrt(vec.x ** 2 + vec.y ** 2);
        if (len > max) {
            vec.x = (vec.x / len) * max;
            vec.y = (vec.y / len) * max;
        }
        return vec;
    }

    draw() {
        const spec = species[config.species];
        const angle = Math.atan2(this.velocity.y, this.velocity.x);

        // Draw trail
        if (config.showTrails && this.trail.length > 1) {
            ctx.beginPath();
            ctx.moveTo(this.trail[0].x, this.trail[0].y);
            for (let i = 1; i < this.trail.length; i++) {
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
            }
            ctx.strokeStyle = spec.trailColor;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Draw boid as triangle
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(angle);

        ctx.beginPath();
        ctx.moveTo(spec.size * 2, 0);
        ctx.lineTo(-spec.size, -spec.size);
        ctx.lineTo(-spec.size, spec.size);
        ctx.closePath();

        ctx.fillStyle = spec.color;
        ctx.fill();

        ctx.restore();
    }
}

class Predator {
    constructor() {
        this.position = { x: canvas.width / 2, y: canvas.height / 2 };
        this.velocity = { x: 2, y: 1 };
        this.target = null;
    }

    update(boids) {
        // Find nearest boid to chase
        let nearest = null;
        let minDist = Infinity;
        for (const boid of boids) {
            const d = Math.sqrt(
                (this.position.x - boid.position.x) ** 2 +
                (this.position.y - boid.position.y) ** 2
            );
            if (d < minDist) {
                minDist = d;
                nearest = boid;
            }
        }

        if (nearest && minDist < 300) {
            // Chase
            const dx = nearest.position.x - this.position.x;
            const dy = nearest.position.y - this.position.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            this.velocity.x += (dx / len) * 0.1;
            this.velocity.y += (dy / len) * 0.1;
        }

        // Limit speed
        const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
        if (speed > 5) {
            this.velocity.x = (this.velocity.x / speed) * 5;
            this.velocity.y = (this.velocity.y / speed) * 5;
        }

        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;

        // Wrap
        if (this.position.x < 0) this.position.x = canvas.width;
        if (this.position.x > canvas.width) this.position.x = 0;
        if (this.position.y < 0) this.position.y = canvas.height;
        if (this.position.y > canvas.height) this.position.y = 0;
    }

    draw() {
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(Math.atan2(this.velocity.y, this.velocity.x));

        // Draw predator as larger red triangle
        ctx.beginPath();
        ctx.moveTo(20, 0);
        ctx.lineTo(-10, -10);
        ctx.lineTo(-10, 10);
        ctx.closePath();

        ctx.fillStyle = '#ff4444';
        ctx.fill();
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }
}

function init() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    boids = [];
    for (let i = 0; i < config.boidCount; i++) {
        boids.push(new Boid());
    }
    predator = new Predator();
    updateInfo();
}

function animate() {
    // Clear with gradient
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.5, '#16213e');
    gradient.addColorStop(1, '#0f3460');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Update and draw boids
    for (const boid of boids) {
        boid.flock(boids);
        boid.update();
        boid.draw();
    }

    // Predator
    if (config.predatorActive) {
        predator.update(boids);
        predator.draw();
    }

    // Mouse indicator
    if (mouse.active && mouse.x !== null) {
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = config.mouseAttract ? 'rgba(100, 255, 100, 0.5)' : 'rgba(255, 100, 100, 0.5)';
        ctx.fill();
    }

    requestAnimationFrame(animate);
}

// Control functions
function addBoids(count) {
    for (let i = 0; i < count; i++) {
        boids.push(new Boid(mouse.x ?? canvas.width / 2, mouse.y ?? canvas.height / 2));
    }
    updateInfo();
}

function togglePredator() {
    config.predatorActive = !config.predatorActive;
    updateInfo();
}

function cycleSpecies() {
    config.species = (config.species + 1) % species.length;
    updateInfo();
}

function toggleTrails() {
    config.showTrails = !config.showTrails;
    if (!config.showTrails) {
        for (const boid of boids) {
            boid.trail = [];
        }
    }
}

function reset() {
    init();
}

function updateInfo() {
    const spec = species[config.species];
    document.getElementById('info').textContent =
        `Boids - ${spec.name} (${boids.length}) ${config.predatorActive ? '🦅' : ''}`;
}

// Event listeners
canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
});

canvas.addEventListener('mouseleave', () => {
    mouse.active = false;
});

canvas.addEventListener('click', () => {
    config.mouseAttract = !config.mouseAttract;
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -10 : 10;
    if (delta > 0) {
        addBoids(delta);
    } else {
        // Remove boids
        boids.splice(0, Math.min(-delta, boids.length - 10));
    }
    updateInfo();
});

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// Start
init();
animate();

console.log('Boids loaded! Click=Toggle attract/repel, Scroll=Add/remove, Watch them flock!');
