// Constellation - Interactive Starfield
// Stars that connect and respond to your presence

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Configuration
let config = {
    starCount: 150,
    connectionDistance: 120,
    mouseRadius: 200,
    starSpeed: 0.3,
    showTrails: false,
    theme: 0
};

// Themes
const themes = [
    { name: 'Midnight', stars: '#ffffff', connections: 'rgba(100, 150, 255, 0.3)', glow: '#4a90d9' },
    { name: 'Aurora', stars: '#88ffcc', connections: 'rgba(100, 255, 180, 0.3)', glow: '#00ff88' },
    { name: 'Nebula', stars: '#ff88cc', connections: 'rgba(255, 100, 180, 0.3)', glow: '#ff44aa' },
    { name: 'Golden', stars: '#ffdd88', connections: 'rgba(255, 200, 100, 0.3)', glow: '#ffaa00' },
    { name: 'Ice', stars: '#aaddff', connections: 'rgba(150, 200, 255, 0.4)', glow: '#88ccff' }
];

let stars = [];
let shootingStars = [];
let mouse = { x: null, y: null, active: false };

class Star {
    constructor(x, y) {
        this.x = x ?? Math.random() * canvas.width;
        this.y = y ?? Math.random() * canvas.height;
        this.baseX = this.x;
        this.baseY = this.y;
        this.vx = (Math.random() - 0.5) * config.starSpeed;
        this.vy = (Math.random() - 0.5) * config.starSpeed;
        this.radius = Math.random() * 2 + 1;
        this.twinkle = Math.random() * Math.PI * 2;
        this.twinkleSpeed = 0.02 + Math.random() * 0.03;
        this.trail = [];
    }

    update() {
        // Gentle drift
        this.x += this.vx;
        this.y += this.vy;

        // Mouse attraction
        if (mouse.active && mouse.x !== null) {
            const dx = mouse.x - this.x;
            const dy = mouse.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < config.mouseRadius) {
                const force = (config.mouseRadius - dist) / config.mouseRadius;
                this.x += dx * force * 0.02;
                this.y += dy * force * 0.02;
            }
        }

        // Wrap around edges with buffer
        const buffer = 50;
        if (this.x < -buffer) this.x = canvas.width + buffer;
        if (this.x > canvas.width + buffer) this.x = -buffer;
        if (this.y < -buffer) this.y = canvas.height + buffer;
        if (this.y > canvas.height + buffer) this.y = -buffer;

        // Twinkle
        this.twinkle += this.twinkleSpeed;

        // Trail
        if (config.showTrails) {
            this.trail.push({ x: this.x, y: this.y });
            if (this.trail.length > 10) this.trail.shift();
        }
    }

    draw() {
        const theme = themes[config.theme];
        const brightness = 0.5 + Math.sin(this.twinkle) * 0.5;

        // Draw trail
        if (config.showTrails && this.trail.length > 1) {
            ctx.beginPath();
            ctx.moveTo(this.trail[0].x, this.trail[0].y);
            for (let i = 1; i < this.trail.length; i++) {
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
            }
            ctx.strokeStyle = `rgba(255, 255, 255, ${brightness * 0.1})`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Glow effect
        const gradient = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.radius * 4
        );
        gradient.addColorStop(0, theme.glow);
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 4, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.globalAlpha = brightness * 0.3;
        ctx.fill();

        // Star core
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * brightness, 0, Math.PI * 2);
        ctx.fillStyle = theme.stars;
        ctx.globalAlpha = brightness;
        ctx.fill();

        ctx.globalAlpha = 1;
    }
}

class ShootingStar {
    constructor(x, y) {
        this.x = x ?? Math.random() * canvas.width;
        this.y = y ?? 0;
        this.length = 50 + Math.random() * 100;
        this.speed = 15 + Math.random() * 10;
        this.angle = Math.PI / 4 + (Math.random() - 0.5) * 0.5;
        this.life = 1;
        this.decay = 0.02;
    }

    update() {
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
        this.life -= this.decay;
    }

    draw() {
        if (this.life <= 0) return;

        const theme = themes[config.theme];
        const tailX = this.x - Math.cos(this.angle) * this.length;
        const tailY = this.y - Math.sin(this.angle) * this.length;

        const gradient = ctx.createLinearGradient(tailX, tailY, this.x, this.y);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(1, theme.stars);

        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(this.x, this.y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.globalAlpha = this.life;
        ctx.stroke();

        // Bright head
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.globalAlpha = 1;
    }

    isDead() {
        return this.life <= 0 || this.x > canvas.width + 100 || this.y > canvas.height + 100;
    }
}

function init() {
    resize();
    stars = [];
    shootingStars = [];
    for (let i = 0; i < config.starCount; i++) {
        stars.push(new Star());
    }
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function drawConnections() {
    const theme = themes[config.theme];

    for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
            const dx = stars[i].x - stars[j].x;
            const dy = stars[i].y - stars[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < config.connectionDistance) {
                const opacity = 1 - (dist / config.connectionDistance);
                ctx.beginPath();
                ctx.moveTo(stars[i].x, stars[i].y);
                ctx.lineTo(stars[j].x, stars[j].y);
                ctx.strokeStyle = theme.connections.replace('0.3', (opacity * 0.4).toFixed(2));
                ctx.lineWidth = opacity * 1.5;
                ctx.stroke();
            }
        }
    }

    // Mouse connections
    if (mouse.active && mouse.x !== null) {
        for (const star of stars) {
            const dx = mouse.x - star.x;
            const dy = mouse.y - star.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < config.mouseRadius) {
                const opacity = 1 - (dist / config.mouseRadius);
                ctx.beginPath();
                ctx.moveTo(star.x, star.y);
                ctx.lineTo(mouse.x, mouse.y);
                ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.2})`;
                ctx.lineWidth = opacity;
                ctx.stroke();
            }
        }

        // Draw mouse cursor glow
        const gradient = ctx.createRadialGradient(
            mouse.x, mouse.y, 0,
            mouse.x, mouse.y, 30
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        gradient.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 30, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
    }
}

function animate() {
    // Clear with gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, '#0a0a1a');
    bgGradient.addColorStop(0.5, '#1a1a2e');
    bgGradient.addColorStop(1, '#16213e');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Update and draw stars
    for (const star of stars) {
        star.update();
    }

    drawConnections();

    for (const star of stars) {
        star.draw();
    }

    // Shooting stars
    shootingStars = shootingStars.filter(s => !s.isDead());
    for (const ss of shootingStars) {
        ss.update();
        ss.draw();
    }

    // Random shooting star
    if (Math.random() < 0.005) {
        shootingStars.push(new ShootingStar());
    }

    requestAnimationFrame(animate);
}

// Control functions
function addStars(count) {
    for (let i = 0; i < count; i++) {
        stars.push(new Star());
    }
    updateInfo();
}

function toggleTrails() {
    config.showTrails = !config.showTrails;
    if (!config.showTrails) {
        for (const star of stars) {
            star.trail = [];
        }
    }
}

function cycleTheme() {
    config.theme = (config.theme + 1) % themes.length;
    updateInfo();
}

function reset() {
    init();
    updateInfo();
}

function updateInfo() {
    document.getElementById('info').textContent =
        `Constellation - ${themes[config.theme].name} (${stars.length} stars)`;
}

// Event listeners
window.addEventListener('resize', () => {
    resize();
});

canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
});

canvas.addEventListener('mouseleave', () => {
    mouse.active = false;
});

canvas.addEventListener('click', (e) => {
    // Create shooting star from click position
    const ss = new ShootingStar(e.clientX, e.clientY);
    ss.angle = Math.random() * Math.PI * 2;
    shootingStars.push(ss);
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    config.connectionDistance = Math.max(50, Math.min(300,
        config.connectionDistance - e.deltaY * 0.5));
});

// Start
init();
updateInfo();
animate();

console.log('Constellation loaded! Move mouse, click for shooting stars, scroll to change connections');
