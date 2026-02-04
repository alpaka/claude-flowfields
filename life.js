// Rainbow Life - Colorful Cellular Automaton
// Conway's Game of Life with colors and trails

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Configuration
const cellSize = 6;
let cols, rows;
let grid, nextGrid;
let generation = 0;
let paused = false;
let showTrails = true;
let ruleSet = 0;

// Rules: [survive, birth] - classic Life is [[2,3], [3]]
const rules = [
    { name: 'Classic Life', survive: [2, 3], birth: [3] },
    { name: 'HighLife', survive: [2, 3], birth: [3, 6] },
    { name: 'Day & Night', survive: [3, 4, 6, 7, 8], birth: [3, 6, 7, 8] },
    { name: 'Seeds', survive: [], birth: [2] },
    { name: 'Life without Death', survive: [0, 1, 2, 3, 4, 5, 6, 7, 8], birth: [3] },
    { name: 'Diamoeba', survive: [5, 6, 7, 8], birth: [3, 5, 6, 7, 8] }
];

// Color functions
function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function init() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    cols = Math.floor(canvas.width / cellSize);
    rows = Math.floor(canvas.height / cellSize);

    grid = createGrid();
    nextGrid = createGrid();

    // Start with some random cells
    randomize();
}

function createGrid() {
    const arr = new Array(cols);
    for (let i = 0; i < cols; i++) {
        arr[i] = new Array(rows);
        for (let j = 0; j < rows; j++) {
            arr[i][j] = { alive: false, age: 0, hue: 0 };
        }
    }
    return arr;
}

function randomize() {
    generation = 0;
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            const alive = Math.random() < 0.15;
            grid[i][j] = {
                alive: alive,
                age: alive ? 1 : 0,
                hue: Math.random()
            };
        }
    }
    updateInfo();
}

function clearGrid() {
    generation = 0;
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            grid[i][j] = { alive: false, age: 0, hue: 0 };
        }
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    updateInfo();
}

function countNeighbors(x, y) {
    let count = 0;
    let hueSum = 0;
    let aliveNeighbors = 0;

    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            if (i === 0 && j === 0) continue;

            const nx = (x + i + cols) % cols;
            const ny = (y + j + rows) % rows;

            if (grid[nx][ny].alive) {
                count++;
                hueSum += grid[nx][ny].hue;
                aliveNeighbors++;
            }
        }
    }

    return { count, avgHue: aliveNeighbors > 0 ? hueSum / aliveNeighbors : Math.random() };
}

function update() {
    const rule = rules[ruleSet];

    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            const { count, avgHue } = countNeighbors(i, j);
            const cell = grid[i][j];

            if (cell.alive) {
                // Cell is alive
                if (rule.survive.includes(count)) {
                    nextGrid[i][j] = {
                        alive: true,
                        age: cell.age + 1,
                        hue: (cell.hue + 0.001) % 1 // Slowly shift hue
                    };
                } else {
                    nextGrid[i][j] = {
                        alive: false,
                        age: cell.age, // Keep age for trail
                        hue: cell.hue
                    };
                }
            } else {
                // Cell is dead
                if (rule.birth.includes(count)) {
                    nextGrid[i][j] = {
                        alive: true,
                        age: 1,
                        hue: (avgHue + 0.02) % 1 // Inherit neighbor color with slight shift
                    };
                } else {
                    nextGrid[i][j] = {
                        alive: false,
                        age: showTrails ? Math.max(0, cell.age - 1) : 0, // Decay trail
                        hue: cell.hue
                    };
                }
            }
        }
    }

    // Swap grids
    [grid, nextGrid] = [nextGrid, grid];
    generation++;
    updateInfo();
}

function draw() {
    // Semi-transparent background for trails
    if (showTrails) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            const cell = grid[i][j];

            if (cell.alive) {
                // Living cell - bright color
                const [r, g, b] = hslToRgb(cell.hue, 0.8, 0.6);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(i * cellSize, j * cellSize, cellSize - 1, cellSize - 1);
            } else if (showTrails && cell.age > 0) {
                // Dead cell with trail - dimmer
                const brightness = Math.min(cell.age / 50, 0.4);
                const [r, g, b] = hslToRgb(cell.hue, 0.6, brightness);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(i * cellSize, j * cellSize, cellSize - 1, cellSize - 1);
            }
        }
    }
}

function animate() {
    if (!paused) {
        update();
    }
    draw();
    setTimeout(() => requestAnimationFrame(animate), 50); // ~20 fps
}

// Control functions
function togglePause() {
    paused = !paused;
}

function cycleRules() {
    ruleSet = (ruleSet + 1) % rules.length;
    updateInfo();
}

function toggleTrails() {
    showTrails = !showTrails;
}

function updateInfo() {
    document.getElementById('info').textContent =
        `Rainbow Life - ${rules[ruleSet].name} - Gen ${generation}`;
}

// Mouse drawing
let isDrawing = false;

canvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    drawCell(e);
});

canvas.addEventListener('mousemove', (e) => {
    if (isDrawing) drawCell(e);
});

canvas.addEventListener('mouseup', () => {
    isDrawing = false;
});

canvas.addEventListener('mouseleave', () => {
    isDrawing = false;
});

function drawCell(e) {
    const x = Math.floor(e.clientX / cellSize);
    const y = Math.floor(e.clientY / cellSize);

    if (x >= 0 && x < cols && y >= 0 && y < rows) {
        // Draw a small cluster
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const nx = (x + dx + cols) % cols;
                const ny = (y + dy + rows) % rows;
                if (Math.random() < 0.7) {
                    grid[nx][ny] = {
                        alive: true,
                        age: 1,
                        hue: (Date.now() / 5000) % 1 // Time-based hue
                    };
                }
            }
        }
    }
}

// Keyboard controls
window.addEventListener('keydown', (e) => {
    switch(e.key) {
        case ' ':
            e.preventDefault();
            togglePause();
            break;
        case 'r':
            randomize();
            break;
        case 'c':
            clearGrid();
            break;
    }
});

window.addEventListener('resize', () => {
    init();
});

// Alias for button
window.clear = clearGrid;

// Start
init();
animate();

console.log('Rainbow Life loaded! Space=Pause, R=Randomize, C=Clear, Click=Draw');
