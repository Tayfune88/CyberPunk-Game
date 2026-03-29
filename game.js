const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const healthBar = document.getElementById('health-bar');
const energyBar = document.getElementById('energy-bar');
const gameOverScreen = document.getElementById('game-over-screen');
const restartBtn = document.getElementById('restart-btn');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const uiLayer = document.getElementById('ui-layer');

// Game State
let animFrameId = null;

// Game State
let gameState = {
    running: false,
    score: 0,
    lastTime: 0,
    gravity: 0.8,
    friction: 0.8,
    deltaTime: 0,
    playerName: 'UNKNOWN',
    startTime: 0,
    topScore: 0,
    fireworksTriggered: false,
    characterType: 'Viper'
};

// Highscore Functions
function loadHighscores() {
    let scores = localStorage.getItem('neonGhostHighscores');
    if (scores) {
        return JSON.parse(scores);
    }
    return [];
}

function saveHighscore(name, score, survivalTime) {
    let scores = loadHighscores();
    scores.push({ name: name, score: score, time: survivalTime });
    // Sort descending by score, then ascending by time (less time is better for same score? Actually maybe more time is better, let's just sort by score descending)
    scores.sort((a, b) => b.score - a.score);
    // Keep top 20
    scores = scores.slice(0, 20);
    localStorage.setItem('neonGhostHighscores', JSON.stringify(scores));
}

function updateHighscoreUI() {
    const tableBody = document.querySelector('#highscore-table tbody');
    if (!tableBody) return;

    let scores = loadHighscores();
    tableBody.innerHTML = '';

    if (scores.length > 0) {
        gameState.topScore = scores[0].score;
    } else {
        gameState.topScore = 0;
    }

    scores.forEach((entry, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${entry.name}</td>
            <td>${entry.score}</td>
            <td>${entry.time}s</td>
        `;
        tableBody.appendChild(row);
    });
}

// Initial Highscore Load
updateHighscoreUI();

// Camera
let camera = {
    x: 0,
    y: 0,
    offset: 200 // Player position on screen from left
};

// Input handling
const keys = {
    left: false,
    right: false,
    up: false,
    down: false,
    shift: false,
    space: false
};

const mouse = {
    x: 0,
    y: 0,
    leftClick: false,
    rightClick: false
};

window.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyA':
        case 'ArrowLeft': keys.left = true; break;
        case 'KeyD':
        case 'ArrowRight': keys.right = true; break;
        case 'KeyW':
        case 'ArrowUp': keys.up = true; break;
        case 'KeyS':
        case 'ArrowDown': keys.down = true; break;
        case 'ShiftLeft':
        case 'ShiftRight': keys.shift = true; break;
        case 'Space': keys.space = true; break;
    }
});

window.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyA':
        case 'ArrowLeft': keys.left = false; break;
        case 'KeyD':
        case 'ArrowRight': keys.right = false; break;
        case 'KeyW':
        case 'ArrowUp': keys.up = false; break;
        case 'KeyS':
        case 'ArrowDown': keys.down = false; break;
        case 'ShiftLeft':
        case 'ShiftRight': keys.shift = false; break;
        case 'Space': keys.space = false; break;
    }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouse.leftClick = true;
    if (e.button === 2) mouse.rightClick = true;
});

canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.leftClick = false;
    if (e.button === 2) mouse.rightClick = false;
});

// Prevent context menu on right click
canvas.addEventListener('contextmenu', e => e.preventDefault());

// Entities
let player;
let platforms = [];
let enemies = [];
let projectiles = [];
let particles = [];

class Platform {
    constructor(x, y, width, height, isWall = false, isOneWay = false) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.isWall = isWall;
        this.isOneWay = isOneWay;
    }

    draw(ctx) {
        ctx.fillStyle = '#223';
        if (this.isOneWay) {
            // Draw one-way platform thinner visually
            ctx.fillRect(this.x, this.y, this.width, this.height);
        } else {
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }

        // Neon edge
        ctx.strokeStyle = this.isWall ? '#f0f' : (this.isOneWay ? '#ff0' : '#0ff');
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);

        ctx.shadowBlur = 10;
        ctx.shadowColor = this.isWall ? '#f0f' : (this.isOneWay ? '#ff0' : '#0ff');
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        ctx.shadowBlur = 0;
    }
}

// Basic Box Collision
function AABB(rect1, rect2) {
    return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
    );
}

class Player {
    constructor(x, y, characterType = 'Viper') {
        this.x = x;
        this.y = y;
        this.characterType = characterType;
        this.width = 30;
        this.height = 50;

        // Default Stats (Viper)
        this.color = '#0ff';
        this.speed = 350; // pixels per second
        this.jumpForce = -500;
        this.gravity = 1500;
        this.maxJumps = 3;
        this.maxHp = 100;

        // Abilities defaults
        this.dashCooldown = 1.5;
        this.dashSpeed = 1000;
        this.dashDuration = 0.15;

        // Combat defaults
        this.meleeDuration = 0.2;
        this.meleeCooldown = 0.4;
        this.rangedCooldown = 0.4;

        // Wall running defaults
        this.wallSlideSpeed = 100;
        this.wallJumpForceX = 400;
        this.wallJumpForceY = -450;

        // Apply Character specific stats
        switch(this.characterType) {
            case 'Titan':
                this.width = 40;
                this.height = 60;
                this.color = '#f50';
                this.speed = 220; // Slower
                this.jumpForce = -450; // Lower jump
                this.maxJumps = 2; // Less jumps
                this.maxHp = 200; // Tanky
                this.dashCooldown = 3.0; // Slower dash cooldown
                this.dashSpeed = 600; // Slower dash
                this.dashDuration = 0.3; // Longer dash duration
                this.meleeDuration = 0.5; // Slow heavy swing
                this.meleeCooldown = 0.8;
                this.rangedCooldown = 1.0; // Slow fire rate cannon
                break;
            case 'Nova':
                this.color = '#f0f';
                this.speed = 300;
                this.jumpForce = -550; // Higher jump
                this.maxJumps = 2;
                this.maxHp = 100;
                this.dashCooldown = 0.1; // Energy based jetpack, low cooldown
                this.meleeDuration = 0.25;
                this.meleeCooldown = 0.5;
                this.rangedCooldown = 0.15; // Fast fire rate plasma
                break;
            case 'Oracle':
                this.width = 25;
                this.height = 55;
                this.color = '#ff0';
                this.speed = 320;
                this.jumpForce = -500;
                this.maxJumps = 3;
                this.maxHp = 120;
                this.dashCooldown = 2.0; // Teleport cooldown
                this.dashSpeed = 0; // Teleport is instant, no speed
                this.dashDuration = 0.1;
                this.meleeDuration = 0.3;
                this.meleeCooldown = 0.6;
                this.rangedCooldown = 0.6; // Medium fire rate orb
                break;
            case 'Viper':
            default:
                // Uses defaults
                break;
        }

        // Initialize state
        this.vx = 0;
        this.vy = 0;
        this.jumpsLeft = this.maxJumps;
        this.grounded = false;
        this.facingRight = true;
        this.isAirRolling = false;
        this.airRollTimer = 0;
        this.airRollDuration = 0.5;
        this.hp = this.maxHp;
        this.energy = 100;
        this.maxEnergy = 100;
        this.animTimer = 0;

        this.canDash = true;
        this.dashTimer = 0;
        this.isDashing = false;
        this.dashActiveTimer = 0;

        this.isAttackingMelee = false;
        this.meleeTimer = 0;
        this.meleeCooldownTimer = 0;
        this.rangedCooldownTimer = 0;

        this.onWall = false;
        this.wallNormalX = 0;
    }

    update(dt) {
        // Dash cooldowns
        if (!this.canDash) {
            this.dashTimer -= dt;
            if (this.dashTimer <= 0) {
                this.canDash = true;
            }
            // Update Energy Bar UI (simplified mapping)
            energyBar.style.width = Math.max(0, 100 - (this.dashTimer / this.dashCooldown) * 100) + '%';
        } else {
            energyBar.style.width = '100%';
        }

        // Combat cooldowns
        if (this.meleeCooldownTimer > 0) this.meleeCooldownTimer -= dt;
        if (this.rangedCooldownTimer > 0) this.rangedCooldownTimer -= dt;

        if (this.isAttackingMelee) {
            this.meleeTimer -= dt;
            if (this.meleeTimer <= 0) {
                this.isAttackingMelee = false;
            }
        }

        if (this.isDashing) {
            this.dashActiveTimer -= dt;
            if (this.dashActiveTimer <= 0) {
                this.isDashing = false;
                if (this.characterType !== 'Nova') {
                    this.vy = 0; // Stop vertical movement after dash
                }
            } else {
                if (this.characterType === 'Nova') {
                    // Jetpack lift
                    this.vy = -this.dashSpeed;
                    this.vx = keys.left ? -this.speed : (keys.right ? this.speed : 0);
                    createParticles(this.x + this.width/2, this.y + this.height, 5, '#f0f');
                } else if (this.characterType === 'Oracle') {
                    // Handled instantly in dash initiation
                } else {
                    // Dash Movement (Viper, Titan)
                    this.vx = this.facingRight ? this.dashSpeed : -this.dashSpeed;
                    this.vy = 0; // No gravity during dash

                    let pColor = this.characterType === 'Titan' ? '#f50' : '#0ff';
                    let coreColor = this.characterType === 'Titan' ? '#ff0' : '#fff';

                    // Lightning trail effect
                    let px = this.x + this.width/2 + (Math.random() - 0.5) * 30;
                    let py = this.y + this.height/2 + (Math.random() - 0.5) * 40;

                    particles.push({
                        x: px,
                        y: py,
                        vx: 0,
                        vy: 0,
                        life: 0.2,
                        color: coreColor
                    });
                    particles.push({
                        x: px,
                        y: py,
                        vx: 0,
                        vy: 0,
                        life: 0.3,
                        color: pColor
                    });
                }
            }
        } else {
            // Normal Movement
            if (keys.left) {
                this.vx = -this.speed;
                this.facingRight = false;
            } else if (keys.right) {
                this.vx = this.speed;
                this.facingRight = true;
            } else {
                // Friction
                this.vx *= 0.8;
                if (Math.abs(this.vx) < 10) this.vx = 0;
            }

            // Apply Gravity
            if (!this.grounded) {
                if (this.onWall && this.vy > 0) {
                    // Wall slide
                    this.vy = this.wallSlideSpeed;
                } else {
                    this.vy += this.gravity * dt;
                }
            }

            // Jump
            if (keys.up) {
                if (this.grounded) {
                    this.vy = this.jumpForce;
                    this.grounded = false;
                    this.jumpsLeft--;
                    keys.up = false; // Prevent holding jump
                } else if (this.onWall) {
                    // Wall Jump
                    this.vy = this.wallJumpForceY;
                    this.vx = this.wallNormalX * this.wallJumpForceX;
                    this.onWall = false;
                    this.grounded = false;
                    this.jumpsLeft = this.maxJumps - 1;
                    keys.up = false;
                } else if (this.jumpsLeft > 0) {
                    // Air jump
                    this.vy = this.jumpForce;
                    this.jumpsLeft--;
                    keys.up = false;

                    // Trigger air roll animation
                    this.isAirRolling = true;
                    this.airRollTimer = this.airRollDuration;

                    // Neon blitz effect
                    createParticles(this.x + this.width/2, this.y + this.height, 15, '#0ff');
                }
            }

            // Dash Initiation
            if (keys.shift && this.canDash) {
                this.isDashing = true;
                this.canDash = false;
                this.dashTimer = this.dashCooldown;
                this.dashActiveTimer = this.dashDuration;

                if (this.characterType !== 'Nova') {
                    keys.shift = false; // Prevent holding dash for non-Nova
                }

                if (this.characterType === 'Oracle') {
                    // Instant Teleport
                    createParticles(this.x + this.width/2, this.y + this.height/2, 20, '#ff0');
                    let tpDist = 200;
                    this.x += this.facingRight ? tpDist : -tpDist;
                    createParticles(this.x + this.width/2, this.y + this.height/2, 20, '#ff0');
                } else if (this.characterType === 'Titan') {
                    // Heavy dash
                    createParticles(this.x + this.width/2, this.y + this.height/2, 10, '#f50');
                } else {
                    // Spawn dash particles
                    createParticles(this.x + this.width/2, this.y + this.height/2, 10, '#0ff');
                }
            }

            // Melee Attack (Spacebar)
            if (keys.space && this.meleeCooldownTimer <= 0 && !this.isDashing) {
                this.isAttackingMelee = true;
                this.meleeTimer = this.meleeDuration;
                this.meleeCooldownTimer = this.meleeCooldown;
                keys.space = false; // Prevent holding

                // Melee logic handled in update() or enemies update()
                checkMeleeHit(this);

                // Viper double hit (second hit delayed)
                if (this.characterType === 'Viper') {
                    setTimeout(() => {
                        if (this.isAttackingMelee) checkMeleeHit(this);
                    }, (this.meleeDuration / 2) * 1000);
                }
            }

            // Ranged Attack (Left Click)
            if (mouse.leftClick && this.rangedCooldownTimer <= 0 && !this.isDashing) {
                this.rangedCooldownTimer = this.rangedCooldown;

                if (this.characterType !== 'Nova') {
                    mouse.leftClick = false; // Prevent holding for non-Nova (Nova can spray)
                }

                // Calculate direction towards mouse
                const originX = this.x + this.width/2;
                const originY = this.y + this.height/2;

                // Adjust mouse coordinates with camera
                const worldMouseX = mouse.x + camera.x;
                const worldMouseY = mouse.y;

                const angle = Math.atan2(worldMouseY - originY, worldMouseX - originX);

                if (this.characterType === 'Titan') {
                    const speed = 500;
                    projectiles.push(new Projectile(originX, originY, Math.cos(angle) * speed, Math.sin(angle) * speed, true, 20, 10, false, '#f50', 50));
                } else if (this.characterType === 'Nova') {
                    const speed = 1000;
                    // Add slight inaccuracy for fast plasma spray
                    const spreadAngle = angle + (Math.random() - 0.5) * 0.1;
                    projectiles.push(new Projectile(originX, originY, Math.cos(spreadAngle) * speed, Math.sin(spreadAngle) * speed, true, 8, 3, false, '#f0f', 15));
                } else if (this.characterType === 'Oracle') {
                    const speed = 700;
                    // Piercing orb
                    projectiles.push(new Projectile(originX, originY, Math.cos(angle) * speed, Math.sin(angle) * speed, true, 15, 15, true, '#ff0', 30));
                } else {
                    // Viper (Twin shot)
                    const speed = 800;
                    const offset = 10;
                    const perpX = Math.cos(angle + Math.PI/2) * offset;
                    const perpY = Math.sin(angle + Math.PI/2) * offset;
                    projectiles.push(new Projectile(originX + perpX, originY + perpY, Math.cos(angle) * speed, Math.sin(angle) * speed, true, 10, 4, false, '#0ff', 20));
                    projectiles.push(new Projectile(originX - perpX, originY - perpY, Math.cos(angle) * speed, Math.sin(angle) * speed, true, 10, 4, false, '#0ff', 20));
                }
            }
        }

        // Animation
        this.animTimer += dt;
        if (this.isAirRolling) {
            this.airRollTimer -= dt;
            if (this.airRollTimer <= 0) {
                this.isAirRolling = false;
            }
        }

        // Apply velocities
        let dx = this.vx * dt;
        let dy = this.vy * dt;

        // Reset state before collision checks
        this.grounded = false;
        this.onWall = false;
        this.wallNormalX = 0;

        // Collision Detection - Horizontal
        this.x += dx;
        for (let p of platforms) {
            if (AABB(this, p) && !p.isOneWay) { // Ignore horizontal collision for one-way platforms
                if (dx > 0) { // Moving right
                    this.x = p.x - this.width;
                    if (!this.grounded && p.isWall) {
                        this.onWall = true;
                        this.wallNormalX = -1; // Wall is to the right
                    }
                } else if (dx < 0) { // Moving left
                    this.x = p.x + p.width;
                    if (!this.grounded && p.isWall) {
                        this.onWall = true;
                        this.wallNormalX = 1; // Wall is to the left
                    }
                }
                this.vx = 0;
            }
        }

        // Collision Detection - Vertical
        let oldY = this.y - dy; // Previous position to check if we were above
        this.y += dy;
        for (let p of platforms) {
            if (AABB(this, p)) {
                if (dy > 0) { // Falling
                    // For one-way platforms, only collide if we were fully above it previously
                    if (p.isOneWay) {
                        if (oldY + this.height <= p.y + 0.1) {
                            this.y = p.y - this.height;
                            this.grounded = true;
                            this.vy = 0;
                            this.onWall = false;
                            this.jumpsLeft = this.maxJumps;
                            this.isAirRolling = false;
                        }
                    } else {
                        this.y = p.y - this.height;
                        this.grounded = true;
                        this.vy = 0;
                        this.onWall = false; // Reset wall run if grounded
                        this.jumpsLeft = this.maxJumps;
                        this.isAirRolling = false;
                    }
                } else if (dy < 0 && !p.isOneWay) { // Jumping into ceiling (ignore one-way)
                    this.y = p.y + p.height;
                    this.vy = 0;
                }
            }
        }

        // Screen bounds
        if (this.y > canvas.height) {
            this.takeDamage(100); // Fall off screen
        }
        // Left bound relative to start of level
        if (this.x < 0) {
            this.x = 0;
            this.vx = 0;
        }
        // Right bound prevents player from moving out of right view
        // Optional: Keep right bound but make it relative to canvas width?
        // Actually, since camera follows player, we shouldn't restrict player by camera.

    }

    draw(ctx) {
        ctx.save();
        let renderX = Math.round(this.x - camera.x) + Math.floor(camera.x);
        let renderY = Math.round(this.y - camera.y) + Math.floor(camera.y);
        ctx.translate(Math.floor(renderX + this.width/2), Math.floor(renderY + this.height/2));

        if (!this.facingRight) {
            ctx.scale(-1, 1);
        }

        let isRunning = this.grounded && Math.abs(this.vx) > 10;
        let runBob = isRunning ? Math.sin(this.animTimer * 20) * 4 : 0;
        let lean = isRunning ? (this.vx > 0 ? 0.15 : -0.15) : 0;
        if (!this.facingRight && lean !== 0) lean = -lean;

        ctx.rotate(lean);

        if (this.isAirRolling) {
            let rollProg = 1 - (this.airRollTimer / this.airRollDuration);
            let rollAngle = rollProg * Math.PI * 2;
            ctx.rotate(rollAngle);
        }

        switch(this.characterType) {
            case 'Titan':
                this.drawTitan(ctx, isRunning, runBob, lean);
                break;
            case 'Viper':
                this.drawViper(ctx, isRunning, runBob, lean);
                break;
            case 'Nova':
                this.drawNova(ctx, isRunning, runBob, lean);
                break;
            case 'Oracle':
                this.drawOracle(ctx, isRunning, runBob, lean);
                break;
            default:
                this.drawDefault(ctx, isRunning, runBob, lean); // Fallback
                break;
        }

        ctx.restore(); // Restore global player transform

        // --- Melee Hitbox Effect (Swoosh) ---
        if (this.isAttackingMelee && !this.isDashing) {
            let swingProg = 1 - (this.meleeTimer / this.meleeDuration);
            let hx = this.x + this.width/2;
            let hy = this.y + this.height/2;
            let radius = 70;
            let effColor = '#0ff';
            let arcStart = -Math.PI/2;
            let arcExtent = swingProg * Math.PI * 2.5;

            switch(this.characterType) {
                case 'Titan':
                    effColor = 'rgba(255, 85, 0, 0.4)';
                    ctx.shadowColor = '#f50';
                    radius = 90;
                    arcExtent = swingProg * Math.PI * 1.5; // Shorter heavier swing
                    break;
                case 'Nova':
                    effColor = 'rgba(255, 0, 255, 0.4)';
                    ctx.shadowColor = '#f0f';
                    radius = 50;
                    break;
                case 'Oracle':
                    effColor = 'rgba(255, 255, 0, 0.4)';
                    ctx.shadowColor = '#ff0';
                    radius = 60;
                    break;
                case 'Viper':
                default:
                    effColor = 'rgba(0, 255, 255, 0.4)';
                    ctx.shadowColor = '#0ff';
                    arcStart = -Math.PI;
                    arcExtent = swingProg * Math.PI * 2; // Fast twin slashes
                    break;
            }

            ctx.fillStyle = effColor;
            ctx.shadowBlur = 20;

            ctx.beginPath();
            if (this.facingRight) {
                ctx.arc(hx, hy, radius, arcStart, arcStart + arcExtent, false);
                ctx.arc(hx, hy, radius - 20, arcStart + arcExtent, arcStart, true);
            } else {
                ctx.arc(hx, hy, radius, arcStart, arcStart - arcExtent, true);
                ctx.arc(hx, hy, radius - 20, arcStart - arcExtent, arcStart, false);
            }
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    drawTitan(ctx, isRunning, runBob, lean) {
        // --- Titan Body (Bulky, Red/Yellow Armor) ---
        ctx.save();
        ctx.scale(1.2, 1.2); // Bigger overall

        let bounce = runBob * 1.5;

        // Torso
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.moveTo(-15, -25 + bounce);
        ctx.lineTo(15, -25 + bounce);
        ctx.lineTo(10, 10 + bounce);
        ctx.lineTo(-10, 10 + bounce);
        ctx.closePath();
        ctx.fill();

        // Red/Yellow Armor Plating
        ctx.fillStyle = '#b00'; // Dark Red
        ctx.fillRect(-12, -22 + bounce, 10, 15);
        ctx.fillRect(2, -22 + bounce, 10, 15);

        ctx.fillStyle = '#fc0'; // Yellow/Gold
        ctx.beginPath();
        ctx.moveTo(-15, -25 + bounce);
        ctx.lineTo(-5, -10 + bounce);
        ctx.lineTo(-15, -10 + bounce);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(15, -25 + bounce);
        ctx.lineTo(5, -10 + bounce);
        ctx.lineTo(15, -10 + bounce);
        ctx.fill();

        // Head
        ctx.fillStyle = '#853e2e'; // Skin tone
        ctx.fillRect(-6, -35 + bounce, 12, 10);
        // Beard
        ctx.fillStyle = '#311';
        ctx.fillRect(-6, -28 + bounce, 12, 4);

        // Cyber Eye (Red Visor)
        ctx.fillStyle = '#f00';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#f00';
        ctx.fillRect(0, -32 + bounce, 7, 4);
        ctx.shadowBlur = 0;

        // --- Right Arm (Cannon) ---
        let armAngle = 0;
        if (!this.grounded) armAngle = -0.2;
        if (this.rangedCooldownTimer > this.rangedCooldown - 0.2) {
            armAngle -= 0.5; // Big recoil
            bounce -= 4;
        }

        ctx.save();
        ctx.translate(8, -18 + bounce);
        ctx.rotate(armAngle);
        // Shoulder pad
        ctx.fillStyle = '#b00';
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fc0';
        ctx.fillRect(-4, -6, 8, 4);

        // Arm
        ctx.fillStyle = '#222';
        ctx.fillRect(-4, 0, 8, 15);

        // Big Cannon
        ctx.fillStyle = '#444';
        ctx.fillRect(-6, 12, 25, 12);
        ctx.fillStyle = '#b00';
        ctx.fillRect(-2, 12, 15, 4);

        if (this.rangedCooldownTimer > this.rangedCooldown - 0.1) {
            ctx.fillStyle = '#ff0';
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#f50';
            ctx.beginPath(); ctx.arc(22, 18, 15, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
        }
        ctx.restore();

        // --- Left Arm (Power Fist) ---
        ctx.save();
        ctx.translate(-8, -18 + bounce);

        if (this.isAttackingMelee) {
            let swingProg = 1 - (this.meleeTimer / this.meleeDuration);
            // Heavy punch forward
            ctx.translate(swingProg * 25, -swingProg * 10);
            ctx.rotate(-Math.PI * 0.4);
        } else if (isRunning) {
            ctx.rotate(Math.PI * 0.2 + Math.sin(this.animTimer * 15) * 0.5);
        } else {
            ctx.rotate(Math.PI * 0.1);
        }

        // Shoulder pad
        ctx.fillStyle = '#b00';
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();

        // Arm
        ctx.fillStyle = '#222';
        ctx.fillRect(-4, 0, 8, 15);

        // Huge Fist
        ctx.fillStyle = '#fc0';
        ctx.fillRect(-8, 15, 16, 16);
        ctx.fillStyle = '#b00';
        ctx.fillRect(-4, 15, 8, 16);
        ctx.fillStyle = '#fff'; // Knuckles
        ctx.fillRect(-8, 31, 16, 4);

        ctx.restore();

        // --- Legs ---
        let legSwing = isRunning ? Math.sin(this.animTimer * 15) * 12 : 0; // Slower steps
        let legSpread = this.grounded ? 0 : 5;

        // Back Leg
        ctx.fillStyle = '#222';
        ctx.fillRect(-10, 8 + bounce, 8, 12);
        ctx.save();
        ctx.translate(-6, 20 + bounce);
        ctx.rotate(-legSwing * 0.05);
        ctx.fillStyle = '#b00';
        ctx.fillRect(-4, 0, 8, 15 + legSpread);
        ctx.fillStyle = '#f50';
        ctx.fillRect(-4, 12 + legSpread, 12, 6); // Big boot
        ctx.restore();

        // Front Leg
        ctx.fillStyle = '#333';
        ctx.fillRect(2, 8 + bounce, 8, 12);
        ctx.save();
        ctx.translate(6, 20 + bounce);
        ctx.rotate(legSwing * 0.05);
        ctx.fillStyle = '#b00';
        ctx.fillRect(-4, 0, 8, 15 + legSpread);
        ctx.fillStyle = '#f50';
        ctx.fillRect(-4, 12 + legSpread, 12, 6); // Big boot
        ctx.restore();

        ctx.restore();
    }

    drawViper(ctx, isRunning, runBob, lean) {
        // --- Viper Body (Slim, Red/White Jacket, Purple Boots) ---
        ctx.save();
        ctx.scale(0.9, 1.0); // Slightly slimmer

        let bounce = runBob;

        // Torso / White Dress
        ctx.fillStyle = '#eee';
        ctx.beginPath();
        ctx.moveTo(-8, -20 + bounce);
        ctx.lineTo(8, -20 + bounce);
        ctx.lineTo(10, 5 + bounce);
        ctx.lineTo(5, 12 + bounce);
        ctx.lineTo(-5, 12 + bounce);
        ctx.lineTo(-10, 5 + bounce);
        ctx.closePath();
        ctx.fill();

        // Red Jacket
        ctx.fillStyle = '#d22';
        ctx.beginPath();
        ctx.moveTo(-10, -22 + bounce);
        ctx.lineTo(-2, -10 + bounce);
        ctx.lineTo(-8, 5 + bounce);
        ctx.lineTo(-12, -10 + bounce);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(10, -22 + bounce);
        ctx.lineTo(2, -10 + bounce);
        ctx.lineTo(8, 5 + bounce);
        ctx.lineTo(12, -10 + bounce);
        ctx.fill();

        // Head
        ctx.fillStyle = '#a67b5b'; // Skin tone
        ctx.fillRect(-5, -30 + bounce, 10, 10);

        // Hair (Brown, high ponytail)
        ctx.fillStyle = '#310';
        ctx.fillRect(-6, -34 + bounce, 12, 6);
        // Ponytail physics
        let hairSwing = isRunning ? -Math.sin(this.animTimer * 20) * 15 : 0;
        ctx.save();
        ctx.translate(0, -32 + bounce);
        ctx.rotate(hairSwing * 0.05 - 0.5);
        ctx.fillRect(-12, -2, 12, 4);
        ctx.restore();

        // Glasses/Visor (Orange tint)
        ctx.fillStyle = 'rgba(255, 100, 0, 0.7)';
        ctx.fillRect(-4, -28 + bounce, 10, 3);

        // --- Right Arm (Pistol) ---
        let armAngle = 0;
        if (!this.grounded) armAngle = -0.4;
        if (this.rangedCooldownTimer > this.rangedCooldown - 0.1) {
            armAngle -= 0.3;
        }

        ctx.save();
        ctx.translate(6, -16 + bounce);
        ctx.rotate(armAngle);

        // Arm (Jacket sleeve)
        ctx.fillStyle = '#d22';
        ctx.fillRect(-3, 0, 6, 10);
        // Forearm (Skin)
        ctx.fillStyle = '#a67b5b';
        ctx.fillRect(-2, 10, 4, 6);

        // Pistol
        ctx.fillStyle = '#444';
        ctx.fillRect(-3, 16, 12, 4);
        ctx.fillRect(-3, 16, 4, 8);

        if (this.rangedCooldownTimer > this.rangedCooldown - 0.05) {
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#0ff';
            ctx.beginPath(); ctx.arc(10, 18, 5, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
        }
        ctx.restore();

        // --- Left Arm (Dagger) ---
        ctx.save();
        ctx.translate(-6, -16 + bounce);

        if (this.isAttackingMelee) {
            let swingProg = 1 - (this.meleeTimer / this.meleeDuration);
            // Fast double slash motion
            ctx.rotate(-Math.PI * 0.5 + Math.sin(swingProg * Math.PI * 4) * 2.0);
        } else if (isRunning) {
            ctx.rotate(Math.PI * 0.3 + Math.sin(this.animTimer * 20) * 0.4);
        } else {
            ctx.rotate(Math.PI * 0.1);
        }

        // Arm (Jacket sleeve)
        ctx.fillStyle = '#d22';
        ctx.fillRect(-3, 0, 6, 10);
        // Forearm (Skin)
        ctx.fillStyle = '#a67b5b';
        ctx.fillRect(-2, 10, 4, 6);

        // Dagger
        ctx.fillStyle = '#222';
        ctx.fillRect(-1, 15, 2, 6); // Hilt
        ctx.fillStyle = '#0ff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#0ff';
        ctx.beginPath();
        ctx.moveTo(-2, 21);
        ctx.lineTo(2, 21);
        ctx.lineTo(0, 35); // Blade
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.restore();

        // --- Legs (Purple Cyber Boots) ---
        let legSwing = isRunning ? Math.sin(this.animTimer * 20) * 20 : 0;
        let legSpread = this.grounded ? 0 : 10;

        // Back Leg
        ctx.fillStyle = '#a67b5b'; // Thigh
        ctx.fillRect(-6, 8 + bounce, 5, 10);
        ctx.save();
        ctx.translate(-4, 18 + bounce);
        ctx.rotate(-legSwing * 0.05);
        ctx.fillStyle = '#639'; // Purple boot
        ctx.fillRect(-3, 0, 6, 15 + legSpread);
        ctx.fillStyle = '#f50'; // Orange accent
        ctx.fillRect(-3, 12 + legSpread, 8, 4);
        ctx.restore();

        // Front Leg
        ctx.fillStyle = '#a67b5b'; // Thigh
        ctx.fillRect(1, 8 + bounce, 5, 10);
        ctx.save();
        ctx.translate(3, 18 + bounce);
        ctx.rotate(legSwing * 0.05);
        ctx.fillStyle = '#74a'; // Purple boot
        ctx.fillRect(-3, 0, 6, 15 + legSpread);
        ctx.fillStyle = '#f50'; // Orange accent
        ctx.fillRect(-3, 12 + legSpread, 8, 4);
        ctx.restore();

        ctx.restore();
    }

    drawNova(ctx, isRunning, runBob, lean) {
        // --- Nova Body (Blue pigtails, pink/blue suit) ---
        ctx.save();
        ctx.scale(0.85, 0.95);

        let bounce = runBob;

        // Torso / Suit
        ctx.fillStyle = '#228'; // Dark Blue suit base
        ctx.beginPath();
        ctx.moveTo(-10, -20 + bounce);
        ctx.lineTo(10, -20 + bounce);
        ctx.lineTo(8, 8 + bounce);
        ctx.lineTo(-8, 8 + bounce);
        ctx.closePath();
        ctx.fill();

        // Pink cyber accents
        ctx.fillStyle = '#f0f';
        ctx.fillRect(-6, -15 + bounce, 12, 4);
        ctx.fillRect(-8, 0 + bounce, 16, 3);

        // Head
        ctx.fillStyle = '#e5c298'; // Skin tone
        ctx.fillRect(-6, -30 + bounce, 12, 10);

        // Hair (Cyan pigtails)
        ctx.fillStyle = '#0ff';
        ctx.fillRect(-7, -32 + bounce, 14, 6); // Bangs

        let hairSwing = isRunning ? -Math.sin(this.animTimer * 20) * 10 : 0;

        // Left Pigtail
        ctx.save();
        ctx.translate(-7, -28 + bounce);
        ctx.rotate(-0.5 + hairSwing * 0.05);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(-8, -10); ctx.lineTo(-12, 2); ctx.fill();
        ctx.restore();

        // Right Pigtail
        ctx.save();
        ctx.translate(7, -28 + bounce);
        ctx.rotate(0.5 + hairSwing * 0.05);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(8, -10); ctx.lineTo(12, 2); ctx.fill();
        ctx.restore();

        // --- Right Arm (Plasma Rifle) ---
        let armAngle = 0;
        if (!this.grounded) armAngle = -0.3;
        if (this.rangedCooldownTimer > this.rangedCooldown - 0.1) {
            armAngle -= 0.1; // Fast, small recoil
            bounce -= 1;
        }

        ctx.save();
        ctx.translate(6, -16 + bounce);
        ctx.rotate(armAngle);

        // Arm
        ctx.fillStyle = '#228';
        ctx.fillRect(-3, 0, 6, 12);

        // Plasma Rifle
        ctx.fillStyle = '#fff';
        ctx.fillRect(-4, 12, 18, 5); // Main body
        ctx.fillStyle = '#f0f';
        ctx.fillRect(-2, 14, 10, 2); // Pink stripe
        ctx.fillStyle = '#0ff';
        ctx.fillRect(14, 13, 6, 3); // Muzzle

        if (this.rangedCooldownTimer > this.rangedCooldown - 0.05) {
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#f0f';
            ctx.beginPath(); ctx.arc(20, 14, 6, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
        }
        ctx.restore();

        // --- Left Arm (Energy Baton) ---
        ctx.save();
        ctx.translate(-6, -16 + bounce);

        if (this.isAttackingMelee) {
            let swingProg = 1 - (this.meleeTimer / this.meleeDuration);
            ctx.rotate(-Math.PI * 0.5 + swingProg * Math.PI * 2);
        } else if (isRunning) {
            ctx.rotate(Math.PI * 0.2 + Math.sin(this.animTimer * 20) * 0.4);
        } else {
            ctx.rotate(-Math.PI * 0.1);
        }

        // Arm
        ctx.fillStyle = '#228';
        ctx.fillRect(-3, 0, 6, 10);

        // Baton Handle
        ctx.fillStyle = '#333';
        ctx.fillRect(-2, 10, 4, 8);

        // Pink Energy Blade
        ctx.fillStyle = '#f0f';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#f0f';
        ctx.fillRect(-1, 18, 2, 20);
        ctx.shadowBlur = 0;

        ctx.restore();

        // --- Legs (Pink/Blue gradient look) ---
        let legSwing = isRunning ? Math.sin(this.animTimer * 20) * 15 : 0;
        let legSpread = this.grounded ? 0 : 8;

        // Back Leg
        ctx.save();
        ctx.translate(-4, 8 + bounce);
        ctx.rotate(-legSwing * 0.05);
        ctx.fillStyle = '#114';
        ctx.fillRect(-3, 0, 6, 12);
        ctx.fillStyle = '#f0f';
        ctx.fillRect(-3, 12, 6, 15 + legSpread); // Pink lower leg
        ctx.fillStyle = '#0ff';
        ctx.fillRect(-4, 25 + legSpread, 8, 4); // Cyan shoe
        ctx.restore();

        // Front Leg
        ctx.save();
        ctx.translate(4, 8 + bounce);
        ctx.rotate(legSwing * 0.05);
        ctx.fillStyle = '#228';
        ctx.fillRect(-3, 0, 6, 12);
        ctx.fillStyle = '#f0f';
        ctx.fillRect(-3, 12, 6, 15 + legSpread); // Pink lower leg
        ctx.fillStyle = '#0ff';
        ctx.fillRect(-4, 25 + legSpread, 8, 4); // Cyan shoe
        ctx.restore();

        ctx.restore();
    }

    drawOracle(ctx, isRunning, runBob, lean) {
        // --- Oracle Body (Tall, orange/grey coat, blue hologram orb) ---
        ctx.save();
        ctx.scale(0.85, 1.15); // Taller, slimmer

        let bounce = runBob * 0.5; // Glides smoothly

        // Torso / Suit Base
        ctx.fillStyle = '#222';
        ctx.fillRect(-8, -20 + bounce, 16, 25);

        // Long Grey Coat
        ctx.fillStyle = '#aaa';
        ctx.beginPath();
        ctx.moveTo(-10, -22 + bounce);
        ctx.lineTo(10, -22 + bounce);
        ctx.lineTo(12, 18 + bounce);
        ctx.lineTo(5, 25 + bounce); // Coat tails
        ctx.lineTo(-5, 25 + bounce);
        ctx.lineTo(-12, 18 + bounce);
        ctx.closePath();
        ctx.fill();

        // Orange accents (satchel/trim)
        ctx.strokeStyle = '#f80';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-10, -15 + bounce);
        ctx.lineTo(10, -5 + bounce); // Diagonal strap
        ctx.stroke();

        ctx.fillStyle = '#f80';
        ctx.fillRect(4, -5 + bounce, 8, 10); // Satchel

        // Head
        ctx.fillStyle = '#421'; // Darker skin tone
        ctx.fillRect(-5, -30 + bounce, 10, 10);

        // Cybernetics on face
        ctx.fillStyle = '#0ff';
        ctx.fillRect(2, -28 + bounce, 3, 6);

        // Hair (Short, dreads/messy top)
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(0, -30 + bounce, 6, Math.PI, 0); ctx.fill();
        ctx.fillRect(-6, -34 + bounce, 12, 4);

        // --- Right Arm (Hologram Orb) ---
        let armAngle = 0;
        if (!this.grounded) armAngle = -0.2;

        // Firing animation (thrusting orb forward)
        if (this.rangedCooldownTimer > this.rangedCooldown - 0.15) {
            armAngle -= 0.8;
            bounce -= 2;
        }

        ctx.save();
        ctx.translate(8, -16 + bounce);
        ctx.rotate(armAngle);

        // Arm
        ctx.fillStyle = '#aaa'; // Coat sleeve
        ctx.fillRect(-3, 0, 6, 12);
        ctx.fillStyle = '#222'; // Glove
        ctx.fillRect(-2, 12, 4, 4);

        // Blue Hologram Orb
        let orbPulse = (Math.sin(this.animTimer * 10) + 1) / 2; // 0 to 1
        ctx.fillStyle = '#0ff';
        ctx.shadowBlur = 10 + orbPulse * 15;
        ctx.shadowColor = '#0ff';
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(0, 22, 6 + orbPulse * 2, 0, Math.PI * 2);
        ctx.fill();

        // Hologram rings
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(0, 22, 10, 3, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;

        ctx.restore();

        // --- Left Arm (Shock Gauntlet/Tablet) ---
        ctx.save();
        ctx.translate(-8, -16 + bounce);

        if (this.isAttackingMelee) {
            let swingProg = 1 - (this.meleeTimer / this.meleeDuration);
            // Quick palm strike
            ctx.rotate(-Math.PI * 0.6);
            ctx.translate(swingProg * 15, 0);
        } else if (isRunning) {
            ctx.rotate(Math.PI * 0.1 + Math.sin(this.animTimer * 20) * 0.3);
        } else {
            ctx.rotate(Math.PI * 0.2); // Holding tablet pose
        }

        // Arm
        ctx.fillStyle = '#aaa'; // Coat sleeve
        ctx.fillRect(-3, 0, 6, 12);
        ctx.fillStyle = '#222'; // Gauntlet
        ctx.fillRect(-4, 12, 8, 8);

        // Glowing panel on gauntlet
        ctx.fillStyle = '#ff0';
        ctx.fillRect(-2, 14, 4, 4);

        ctx.restore();

        // --- Legs (Orange cyber pants) ---
        let legSwing = isRunning ? Math.sin(this.animTimer * 15) * 15 : 0;
        let legSpread = this.grounded ? 0 : 5;

        // Back Leg
        ctx.save();
        ctx.translate(-4, 18 + bounce);
        ctx.rotate(-legSwing * 0.05);
        ctx.fillStyle = '#f80'; // Orange pants
        ctx.fillRect(-3, 0, 6, 18);
        ctx.fillStyle = '#eee'; // White/Grey shoes
        ctx.fillRect(-4, 18 + legSpread, 8, 4);
        ctx.restore();

        // Front Leg
        ctx.save();
        ctx.translate(4, 18 + bounce);
        ctx.rotate(legSwing * 0.05);
        ctx.fillStyle = '#f80'; // Orange pants
        ctx.fillRect(-3, 0, 6, 18);
        ctx.fillStyle = '#eee'; // White/Grey shoes
        ctx.fillRect(-4, 18 + legSpread, 8, 4);
        ctx.restore();

        ctx.restore();
    }

    drawDefault(ctx, isRunning, runBob, lean) {
        // --- Core Cyborg Body ---

        // Torso
        ctx.fillStyle = '#222';
        ctx.strokeStyle = this.isDashing ? '#0ff' : '#444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, -20 + runBob);
        ctx.lineTo(10, -20 + runBob);
        ctx.lineTo(8, 5 + runBob);
        ctx.lineTo(-8, 5 + runBob);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cybernetic Spine (Neon Core)
        ctx.fillStyle = '#0ff';
        ctx.shadowBlur = this.isDashing ? 25 : 10;
        ctx.shadowColor = '#0ff';
        ctx.fillRect(-2, -15 + runBob, 4, 15);
        ctx.shadowBlur = 0;

        // --- Head/Helmet ---
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.moveTo(-8, -22 + runBob);
        ctx.lineTo(8, -22 + runBob);
        ctx.lineTo(6, -34 + runBob);
        ctx.lineTo(-6, -34 + runBob);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Visor (Glowing Eye)
        let blink = Math.sin(this.animTimer * 10) > 0.8 ? 0 : 1; // Random fast blink
        if (blink) {
            ctx.fillStyle = '#f0f';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#f0f';
            ctx.fillRect(0, -30 + runBob, 8, 4);
            ctx.shadowBlur = 0;
        }

        // --- Right Arm (Gun Arm) ---
        let armAngle = 0;
        if (!this.grounded) armAngle = -0.3;
        if (this.onWall) armAngle = -1.5;
        // Recoil animation
        if (this.rangedCooldownTimer > this.rangedCooldown - 0.1) {
            armAngle -= 0.6;
            runBob -= 2; // Full body recoil
        }

        ctx.save();
        ctx.translate(5, -12 + runBob);
        ctx.rotate(armAngle);

        // Shoulder
        this.drawShoulder(ctx);

        // Arm
        ctx.fillStyle = '#222';
        ctx.fillRect(-3, 0, 6, 15);

        // Gun
        ctx.fillStyle = '#111';
        ctx.fillRect(-4, 10, 18, 6);
        ctx.strokeStyle = '#0ff';
        ctx.strokeRect(-4, 10, 18, 6);

        // Muzzle Flash
        if (this.rangedCooldownTimer > this.rangedCooldown - 0.05) {
            ctx.fillStyle = '#fff';
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#0ff';
            ctx.beginPath();
            ctx.arc(16, 13, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
        ctx.restore();

        // --- Left Arm (Sword Arm) ---
        ctx.save();
        ctx.translate(-5, -12 + runBob);

        let swordGlow = (Math.sin(this.animTimer * 15) + 1) / 2; // 0 to 1 pulsing

        if (this.isAttackingMelee) {
            let swingProg = 1 - (this.meleeTimer / this.meleeDuration);
            // Dynamic 360 swooping attack
            ctx.rotate(-Math.PI * 0.5 + swingProg * Math.PI * 2.5);
            ctx.translate(swingProg * 10, 0); // Lunge forward slightly
        } else if (isRunning) {
            ctx.rotate(Math.PI * 0.2 + Math.sin(this.animTimer * 20) * 0.4);
        } else {
            ctx.rotate(-Math.PI * 0.1);
        }

        // Shoulder
        this.drawShoulder(ctx);

        // Arm
        ctx.fillStyle = '#222';
        ctx.fillRect(-3, 0, 6, 12);

        // The Giant Sword
        ctx.translate(0, 12); // Move to hand

        // Hilt
        ctx.fillStyle = '#111';
        ctx.fillRect(-2, -2, 4, 10);

        // Crossguard
        ctx.fillStyle = '#555';
        ctx.fillRect(-6, 8, 12, 4);

        // Glowing Blade
        ctx.fillStyle = '#0f0';
        ctx.shadowBlur = 15 + swordGlow * 15; // Pulsing blur
        ctx.shadowColor = '#0f0';

        ctx.beginPath();
        ctx.moveTo(-4, 12);
        ctx.lineTo(4, 12);
        ctx.lineTo(6, 45); // Thick blade
        ctx.lineTo(0, 60); // Sharp tip
        ctx.lineTo(-6, 45);
        ctx.closePath();
        ctx.fill();

        // Bright core of blade
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(-1, 12);
        ctx.lineTo(1, 12);
        ctx.lineTo(2, 44);
        ctx.lineTo(0, 56);
        ctx.lineTo(-2, 44);
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        // --- Legs ---
        let legSwing = isRunning ? Math.sin(this.animTimer * 20) * 15 : 0;
        let legSpread = this.grounded ? 0 : 10;
        if (this.onWall) { legSwing = 0; legSpread = 0; }

        // Back Leg
        ctx.fillStyle = '#111';
        ctx.fillRect(-6, 5 + runBob, 6, 10); // Thigh
        ctx.save();
        ctx.translate(-3, 15 + runBob);
        ctx.rotate(-legSwing * 0.05);
        ctx.fillRect(-2, 0, 4, 12 + legSpread); // Calf
        ctx.restore();

        // Front Leg
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 5 + runBob, 6, 10); // Thigh
        ctx.save();
        ctx.translate(3, 15 + runBob);
        ctx.rotate(legSwing * 0.05);
        ctx.fillRect(-2, 0, 4, 12 + legSpread); // Calf
        // Neon accent on front leg
        ctx.fillStyle = '#0ff';
        ctx.fillRect(-1, 2, 2, 8);
        ctx.restore();
    }

    drawShoulder(ctx) {
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
    }

    takeDamage(amount) {
        this.hp -= amount;
        healthBar.style.width = Math.max(0, (this.hp / this.maxHp) * 100) + '%';
        if (this.hp <= 0 && gameState.running) {
            gameState.running = false;
            let survivalTime = Math.floor((Date.now() - gameState.startTime) / 1000);
            saveHighscore(gameState.playerName, gameState.score, survivalTime);
            updateHighscoreUI();
            gameOverScreen.style.display = 'flex';
        }
    }
}

class Projectile {
    constructor(x, y, vx, vy, isPlayerOwned, width = 10, height = 4, piercing = false, color = null, damage = 25) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.width = width;
        this.height = height;
        this.isPlayerOwned = isPlayerOwned;
        this.life = 2.0; // seconds before disappearing
        this.color = color || (isPlayerOwned ? '#0ff' : '#f00');
        this.piercing = piercing;
        this.damage = damage;
        this.hitEnemies = [];
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;

        // Tail particles
        if (Math.random() < 0.3) {
            createParticles(this.x, this.y, 1, this.color);
        }
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;

        // Draw angled projectile
        ctx.save();
        let renderX = Math.round(this.x - camera.x) + Math.floor(camera.x);
        let renderY = Math.round(this.y - camera.y) + Math.floor(camera.y);
        ctx.translate(renderX, renderY);
        ctx.rotate(Math.atan2(this.vy, this.vx));
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
        ctx.restore();

        ctx.shadowBlur = 0;
    }
}

function checkMeleeHit(player) {
    let hitboxWidth = 140; // Full 360 width
    let hitboxHeight = 140;
    let damage = 50;
    let effectColor = '#0f0'; // Default sword color

    switch(player.characterType) {
        case 'Titan':
            hitboxWidth = 180;
            hitboxHeight = 180;
            damage = 100;
            effectColor = '#f50';
            break;
        case 'Nova':
            hitboxWidth = 100;
            hitboxHeight = 100;
            damage = 40;
            effectColor = '#f0f';
            break;
        case 'Oracle':
            hitboxWidth = 120;
            hitboxHeight = 120;
            damage = 60;
            effectColor = '#ff0';
            break;
        case 'Viper':
        default:
            hitboxWidth = 120;
            hitboxHeight = 120;
            damage = 40; // twin daggers hit multiple times or faster
            effectColor = '#0ff';
            break;
    }

    let hx = player.x + player.width/2 - hitboxWidth/2;
    let hy = player.y + player.height/2 - hitboxHeight/2;

    let hitbox = { x: hx, y: hy, width: hitboxWidth, height: hitboxHeight };

    // Check against enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        let enemy = enemies[i];
        if (AABB(hitbox, enemy)) {
            // Hit enemy
            createParticles(enemy.x + enemy.width/2, enemy.y + enemy.height/2, 20, effectColor);
            enemy.takeDamage(damage);
            // Stun effect for Oracle's shock gauntlet
            if (player.characterType === 'Oracle') {
                enemy.speed = Math.max(0, enemy.speed - 50); // Slow down enemy
            }
        }
    }
}

class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 35;
        this.height = 35;
        this.hp = 100;
        this.maxHp = 100;
        this.speed = 100;
        this.color = '#f00';
        this.animTimer = Math.random() * 10;

        // Firing logic
        this.fireCooldown = 2.0;
        this.fireTimer = Math.random() * 2.0;
    }

    update(dt) {
        // Move towards player
        let dx = player.x - this.x;
        let dy = player.y - this.y;
        let dist = Math.sqrt(dx*dx + dy*dy);

        if (dist > 200) { // Keep some distance
            this.x += (dx / dist) * this.speed * dt;
            this.y += (dy / dist) * this.speed * dt;
        } else if (dist < 150) { // Back away if too close
            this.x -= (dx / dist) * (this.speed * 0.5) * dt;
            this.y -= (dy / dist) * (this.speed * 0.5) * dt;
        }

        // Firing
        this.fireTimer -= dt;
        if (this.fireTimer <= 0 && dist < 400) {
            this.fireTimer = this.fireCooldown;

            // Shoot at player
            let px = player.x + player.width/2;
            let py = player.y + player.height/2;
            let ex = this.x + this.width/2;
            let ey = this.y + this.height/2;

            let angle = Math.atan2(py - ey, px - ex);
            let pSpeed = 400;

            projectiles.push(new Projectile(ex, ey, Math.cos(angle) * pSpeed, Math.sin(angle) * pSpeed, false));
        }
    }

    draw(ctx) {
        this.animTimer += gameState.deltaTime;

        ctx.save();
        // Hovering effect
        let hoverY = Math.sin(this.animTimer * 4) * 5;
        let renderX = Math.round(this.x - camera.x) + Math.floor(camera.x);
        let renderY = Math.round(this.y - camera.y) + Math.floor(camera.y);
        ctx.translate(Math.floor(renderX + this.width/2), Math.floor(renderY + this.height/2 + hoverY));

        // Face player
        if (player.x < this.x) {
            ctx.scale(-1, 1);
        }

        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;

        // Drone Core/Body
        ctx.fillStyle = '#222';
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(-15, -10);
        ctx.lineTo(10, -15);
        ctx.lineTo(15, 0);
        ctx.lineTo(5, 15);
        ctx.lineTo(-10, 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Thruster
        ctx.fillStyle = '#f00';
        ctx.beginPath();
        ctx.moveTo(-10, 10);
        ctx.lineTo(-5, 20 + Math.random() * 5);
        ctx.lineTo(5, 15);
        ctx.fill();

        // Eye/Sensor
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(5, -2, 4, 0, Math.PI * 2);
        ctx.fill();

        // Gun mount
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(20, 5);
        ctx.stroke();

        ctx.restore();
        ctx.shadowBlur = 0;

        // Draw Health Bar
        ctx.fillStyle = '#222';
        ctx.fillRect(this.x, this.y - 15, this.width, 4);
        ctx.fillStyle = '#f00';
        ctx.fillRect(this.x, this.y - 15, this.width * (this.hp / this.maxHp), 4);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x, this.y - 15, this.width, 4);
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) {
            // Die
            createParticles(this.x + this.width/2, this.y + this.height/2, 30, this.color);

            // Add score
            gameState.score += 100;
            scoreDisplay.innerText = gameState.score;

            // Remove from array (handled in main update loop)
            this.dead = true;
        }
    }
}


let enemySpawnTimer = 0;
const enemySpawnRate = 3.0; // seconds

function createParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 200,
            vy: (Math.random() - 0.5) * 200,
            life: 1.0, // seconds
            color: color
        });
    }
}

function createFirework(x, y) {
    const colors = ['#f00', '#0f0', '#00f', '#ff0', '#f0f', '#0ff', '#fff'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    for (let i = 0; i < 50; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 400,
            vy: (Math.random() - 0.5) * 400 - 100, // slight upward bias
            life: 1.5 + Math.random(), // 1.5 to 2.5 seconds
            color: color
        });
    }
}

function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function drawParticles(ctx) {
    for (let p of particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        let renderX = Math.round(p.x - camera.x) + Math.floor(camera.x);
        let renderY = Math.round(p.y - camera.y) + Math.floor(camera.y);
        ctx.fillRect(renderX, renderY, 3, 3);
        ctx.globalAlpha = 1.0;
    }
}

let platformGenerator = {
    lastX: 0,
    chunkWidth: 800
};

function initLevel() {
    platforms = [];
    platformGenerator.lastX = 0;

    const floorY = canvas.height - 50;

    // Initial safe zone
    platforms.push(new Platform(0, floorY, Math.max(800, canvas.width), 50));
    platforms.push(new Platform(0, 0, 50, floorY, true)); // Starting left wall

    // Generate next chunks
    generatePlatforms();
    generatePlatforms();
}

function generatePlatforms() {
    let startX = platformGenerator.lastX + platformGenerator.chunkWidth;
    let endX = startX + platformGenerator.chunkWidth;

    const floorY = canvas.height - 50;

    // Add floor gaps and varied heights
    let floorX = startX;
    while (floorX < endX) {
        // Significantly reduce gaps
        let hasGap = Math.random() > 0.9;
        let pWidth = hasGap ? 150 + Math.random() * 200 : 300 + Math.random() * 500;
        let pHeight = 50;

        if (!hasGap || floorX === startX) {
            platforms.push(new Platform(floorX, floorY, pWidth, pHeight));
        }

        let spawnedWall = false;

        // Sometimes spawn a wall obstacle for wall-running
        if (Math.random() > 0.6) {
            // Varying wall heights that are traversable
            let wallHeight = 150 + Math.random() * 150;
            // Position wall in middle of platform, ensuring enough space to jump on both sides
            let wallX = floorX + pWidth/2 - 25;
            platforms.push(new Platform(wallX, floorY - wallHeight, 50, wallHeight, true));
            spawnedWall = true;
        }

        floorX += pWidth + (hasGap ? 150 + Math.random() * 150 : 0); // Slightly wider gaps for better flow
    }

    // Floating platforms
    let floatAttempts = 0;
    let floatsCreated = 0;
    while (floatsCreated < 4 && floatAttempts < 20) {
        floatAttempts++;
        let fx = startX + Math.random() * (platformGenerator.chunkWidth - 100);
        // Base floating platforms relative to canvas height, so they don't clip off top or stay too low
        let maxFloatY = floorY - 150; // At least 150px above floor
        let minFloatY = 100; // At least 100px from top
        let fyRange = Math.max(10, maxFloatY - minFloatY);
        let fy = minFloatY + Math.random() * fyRange;
        let fw = 80 + Math.random() * 150;

        let valid = true;
        let newFloat = new Platform(fx, fy, fw, 20, false, true); // Set as one-way platform

        // Check if platform is directly above a wall obstacle, which would trap the player
        for (let p of platforms) {
            if (p.isWall) {
                // If horizontal bounds overlap
                if (newFloat.x < p.x + p.width && newFloat.x + newFloat.width > p.x) {
                    // And if float is directly above wall (with not enough clearance)
                    if (newFloat.y < p.y && newFloat.y > p.y - 150) {
                        valid = false;
                        break;
                    }
                }
            }
        }

        if (valid) {
            platforms.push(newFloat);
            floatsCreated++;
        }
    }

    platformGenerator.lastX = startX;
}

function initGame() {
    gameState.running = true;
    gameState.score = 0;

    // Resolution initialization
    let resSelect = document.getElementById('resolution-select');
    if (resSelect) {
        let resParts = resSelect.value.split('x');
        let rW = parseInt(resParts[0]);
        let rH = parseInt(resParts[1]);
        if (!isNaN(rW) && !isNaN(rH)) {
            canvas.width = rW;
            canvas.height = rH;

            // Update container and dashboard styles
            let container = document.getElementById('game-container');
            if (container) {
                container.style.width = rW + 'px';
                container.style.height = rH + 'px';
            }
            let dashboard = document.getElementById('side-dashboard');
            if (dashboard) {
                dashboard.style.height = rH + 'px';
            }
        }
    }

    // Character selection
    let charSelect = document.getElementById('character-select');
    if (charSelect) {
        gameState.characterType = charSelect.value;
    }

    // Highscore initialization
    let nameInput = document.getElementById('player-name-input');
    gameState.playerName = nameInput.value.trim() !== '' ? nameInput.value.trim().toUpperCase() : 'UNKNOWN';
    gameState.startTime = Date.now();
    gameState.fireworksTriggered = false;
    updateHighscoreUI(); // refresh topScore

    scoreDisplay.innerText = gameState.score;
    gameOverScreen.style.display = 'none';
    startScreen.style.display = 'none';
    uiLayer.style.display = 'flex';

    healthBar.style.width = '100%';
    energyBar.style.width = '100%';

    camera.x = 0;
    camera.y = 0;

    initLevel();
    player = new Player(100, canvas.height - 200, gameState.characterType);
    camera.offset = canvas.width * 0.25; // 25% of screen width

    particles = [];
    projectiles = [];
    enemies = [];
    enemySpawnTimer = 2.0;

    // Spawn initial enemy ahead
    enemies.push(new Enemy(600, canvas.height - 300));

    gameState.lastTime = performance.now();
    if (animFrameId) {
        cancelAnimationFrame(animFrameId);
    }
    animFrameId = requestAnimationFrame(gameLoop);
}

function update(deltaTime) {
    if (!gameState.running) return;

    player.update(deltaTime);

    // Update camera to follow player horizontally
    let targetX = player.x - camera.offset;
    // Allow moving camera in both directions
    camera.x += (targetX - camera.x) * 0.1; // Smooth following

    // Optional: prevent camera from going before start
    if (camera.x < 0) camera.x = 0;

    // Fireworks trigger when beating top score
    if (gameState.topScore > 0 && gameState.score > gameState.topScore && !gameState.fireworksTriggered) {
        gameState.fireworksTriggered = true;
        // Spawn a burst of fireworks across the screen
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                let fwX = camera.x + 100 + Math.random() * (canvas.width - 200);
                let fwY = 100 + Math.random() * 200;
                createFirework(fwX, fwY);
            }, i * 300); // cascade effect
        }
    }

    // Procedural generation logic
    if (camera.x + canvas.width > platformGenerator.lastX) {
        generatePlatforms();
    }

    // Clean up old platforms behind camera
    for (let i = platforms.length - 1; i >= 0; i--) {
        if (platforms[i].x + platforms[i].width < camera.x - 3000) {
            platforms.splice(i, 1);
        }
    }

    updateParticles(deltaTime);

    // Spawn enemies
    enemySpawnTimer -= deltaTime;
    if (enemySpawnTimer <= 0) {
        enemySpawnTimer = enemySpawnRate;
        if (enemies.length < 5) { // Max enemies on screen
            let ex = camera.x + canvas.width + Math.random() * 200;
            let ey = Math.random() * 300 + 50;
            enemies.push(new Enemy(ex, ey)); // Drone
        }
    }

    // Update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        let enemy = enemies[i];
        enemy.update(deltaTime);

        // Check collision with player
        if (enemy instanceof Enemy && AABB(player, enemy)) {
            if (player.isDashing) {
                // Dash attack: lightning strike through enemies
                enemy.takeDamage(100);

                // Lightning visual effect
                createParticles(enemy.x + enemy.width/2, enemy.y + enemy.height/2, 20, '#0ff'); // Cyan flash

                // Optional: Give player some invincibility frames or energy back on dash kill
            } else {
                player.takeDamage(5); // Collision damage
                // Push player back slightly
                let dx = player.x - enemy.x;
                player.vx = dx > 0 ? 200 : -200;
            }
        }

        if (enemy.dead) {
            enemies.splice(i, 1);
        }
    }

    // Update projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        p.update(deltaTime);

        // Remove projectiles far off screen
        if (p.x < camera.x - 100 || p.x > camera.x + canvas.width + 100) {
             projectiles.splice(i, 1);
             continue;
        }

        let removed = false;

        // Check collision with platforms
        for (let plat of platforms) {
            if (AABB(p, plat)) {
                createParticles(p.x, p.y, 5, p.color);
                projectiles.splice(i, 1);
                removed = true;
                break;
            }
        }

        if (removed) continue;

        // Check collision with enemies (if player owned)
        if (p.isPlayerOwned) {
            for (let j = enemies.length - 1; j >= 0; j--) {
                let enemy = enemies[j];
                if (AABB(p, enemy)) {
                    if (!p.hitEnemies.includes(enemy)) {
                        createParticles(enemy.x + enemy.width/2, enemy.y + enemy.height/2, 10, p.color);
                        enemy.takeDamage(p.damage);
                        p.hitEnemies.push(enemy);
                    }
                    if (!p.piercing) {
                        projectiles.splice(i, 1);
                        removed = true;
                        break;
                    }
                }
            }
        } else {
            // Enemy projectile hits player or sword block
            let blockHitbox = {
                x: player.x + player.width/2 - 70,
                y: player.y + player.height/2 - 70,
                width: 140,
                height: 140
            };

            if (player.isAttackingMelee && AABB(p, blockHitbox)) {
                // Projectile blocked by sword
                createParticles(p.x, p.y, 10, '#0f0'); // Sword color sparks
                projectiles.splice(i, 1);
                removed = true;
            } else if (AABB(p, player) && !player.isDashing) { // Phase dash grants invincibility
                createParticles(player.x + player.width/2, player.y + player.height/2, 10, p.color);
                player.takeDamage(10);
                projectiles.splice(i, 1);
                removed = true;
            }
        }

        if (removed) continue;

        if (p.life <= 0) {
            projectiles.splice(i, 1);
        }
    }
}

function draw(ctx) {
    // Clear screen
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background grid (cyberpunk style) with parallax/camera offset
    ctx.strokeStyle = '#112';
    ctx.lineWidth = 1;
    let offsetX = Math.floor(camera.x) % 50;

    ctx.beginPath();
    for(let i = -offsetX; i < canvas.width; i += 50) {
        ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height);
    }
    for(let i = 0; i < canvas.height; i += 50) {
        ctx.moveTo(0, i); ctx.lineTo(canvas.width, i);
    }
    ctx.stroke();

    // Apply camera transform for world objects
    ctx.save();
    ctx.translate(-Math.floor(camera.x), -Math.floor(camera.y));

    // Draw platforms
    platforms.forEach(p => p.draw(ctx));

    enemies.forEach(e => e.draw(ctx));
    drawParticles(ctx);
    projectiles.forEach(p => p.draw(ctx));
    if (player) player.draw(ctx);

    ctx.restore();
}

function gameLoop(timestamp) {
    // Only schedule the next frame if the game is running,
    // to prevent runaway/multiple concurrent loops.
    if (!gameState.running) return;

    animFrameId = requestAnimationFrame(gameLoop);

    gameState.deltaTime = (timestamp - gameState.lastTime) / 1000;
    gameState.lastTime = timestamp;

    // Cap delta time to prevent huge jumps when tab is inactive
    if (gameState.deltaTime > 0.1) gameState.deltaTime = 0.1;

    update(gameState.deltaTime);
    draw(ctx);
}

restartBtn.addEventListener('click', initGame);
startBtn.addEventListener('click', initGame);

// Initialize game state but wait for user to start
gameState.running = false;
gameState.lastTime = performance.now();
