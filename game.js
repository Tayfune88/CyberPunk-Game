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
let gameState = {
    running: false,
    score: 0,
    lastTime: 0,
    gravity: 0.8,
    friction: 0.8,
    deltaTime: 0,
    gameTime: 0,
    bossSpawned: false
};

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
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 50;
        this.color = '#0ff';

        // Physics
        this.vx = 0;
        this.vy = 0;
        this.speed = 300; // pixels per second
        this.jumpForce = -500;
        this.gravity = 1500;

        // State
        this.grounded = false;
        this.facingRight = true;
        this.hp = 100;
        this.maxHp = 100;
        this.energy = 100;
        this.maxEnergy = 100;
        this.animTimer = 0;

        // Abilities
        this.canDash = true;
        this.dashCooldown = 1.5;
        this.dashTimer = 0;
        this.isDashing = false;
        this.dashSpeed = 1000;
        this.dashDuration = 0.15;
        this.dashActiveTimer = 0;

        // Combat
        this.isAttackingMelee = false;
        this.meleeTimer = 0;
        this.meleeDuration = 0.3; // Slower, heavier swing
        this.meleeCooldown = 0.5;
        this.meleeCooldownTimer = 0;

        this.rangedCooldown = 0.5;
        this.rangedCooldownTimer = 0;

        // Wall running
        this.onWall = false;
        this.wallNormalX = 0; // -1 for right wall, 1 for left wall
        this.wallSlideSpeed = 100;
        this.wallJumpForceX = 400;
        this.wallJumpForceY = -450;
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
                this.vy = 0; // Stop vertical movement after dash
            } else {
                // Dash Movement
                this.vx = this.facingRight ? this.dashSpeed : -this.dashSpeed;
                this.vy = 0; // No gravity during dash

                // Lightning trail effect
                let px = this.x + this.width/2 + (Math.random() - 0.5) * 30;
                let py = this.y + this.height/2 + (Math.random() - 0.5) * 40;

                particles.push({
                    x: px,
                    y: py,
                    vx: 0,
                    vy: 0,
                    life: 0.2,
                    color: '#fff' // White hot lightning core
                });
                particles.push({
                    x: px,
                    y: py,
                    vx: 0,
                    vy: 0,
                    life: 0.3,
                    color: '#0ff' // Cyan outer glow
                });
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
                    keys.up = false; // Prevent holding jump
                } else if (this.onWall) {
                    // Wall Jump
                    this.vy = this.wallJumpForceY;
                    this.vx = this.wallNormalX * this.wallJumpForceX;
                    this.onWall = false;
                    this.grounded = false;
                    keys.up = false;
                }
            }

            // Dash Initiation
            if (keys.shift && this.canDash) {
                this.isDashing = true;
                this.canDash = false;
                this.dashTimer = this.dashCooldown;
                this.dashActiveTimer = this.dashDuration;
                keys.shift = false; // Prevent holding dash

                // Spawn dash particles
                createParticles(this.x + this.width/2, this.y + this.height/2, 10, '#0ff');
            }

            // Melee Attack (Spacebar)
            if (keys.space && this.meleeCooldownTimer <= 0 && !this.isDashing) {
                this.isAttackingMelee = true;
                this.meleeTimer = this.meleeDuration;
                this.meleeCooldownTimer = this.meleeCooldown;
                keys.space = false; // Prevent holding

                // Melee logic handled in update() or enemies update()
                checkMeleeHit(this);
            }

            // Ranged Attack (Left Click)
            if (mouse.leftClick && this.rangedCooldownTimer <= 0 && !this.isDashing) {
                this.rangedCooldownTimer = this.rangedCooldown;
                mouse.leftClick = false; // Prevent holding

                // Calculate direction towards mouse
                const originX = this.x + this.width/2;
                const originY = this.y + this.height/2;

                // Adjust mouse coordinates with camera
                const worldMouseX = mouse.x + camera.x;
                const worldMouseY = mouse.y;

                const angle = Math.atan2(worldMouseY - originY, worldMouseX - originX);
                const speed = 800;

                projectiles.push(new Projectile(originX, originY, Math.cos(angle) * speed, Math.sin(angle) * speed, true));
            }
        }

        // Animation
        this.animTimer += dt;

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
                        }
                    } else {
                        this.y = p.y - this.height;
                        this.grounded = true;
                        this.vy = 0;
                        this.onWall = false; // Reset wall run if grounded
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
        ctx.translate(this.x + this.width/2, this.y + this.height/2);

        if (!this.facingRight) {
            ctx.scale(-1, 1);
        }

        let isRunning = this.grounded && Math.abs(this.vx) > 10;
        let runBob = isRunning ? Math.sin(this.animTimer * 20) * 4 : 0;
        let lean = isRunning ? (this.vx > 0 ? 0.15 : -0.15) : 0;
        if (!this.facingRight && lean !== 0) lean = -lean;

        ctx.rotate(lean);

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

        ctx.restore(); // Restore global player transform

        // --- Melee Hitbox Effect (Swoosh) ---
        if (this.isAttackingMelee && !this.isDashing) {
            ctx.fillStyle = 'rgba(0, 255, 0, 0.4)';
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#0f0';

            let hx = this.x + this.width/2;
            let hy = this.y + this.height/2;
            let radius = 70;
            let swingProg = 1 - (this.meleeTimer / this.meleeDuration);

            ctx.beginPath();
            if (this.facingRight) {
                ctx.arc(hx, hy, radius, -Math.PI/2, -Math.PI/2 + swingProg * Math.PI * 2.5, false);
                ctx.arc(hx, hy, radius - 20, -Math.PI/2 + swingProg * Math.PI * 2.5, -Math.PI/2, true);
            } else {
                ctx.arc(hx, hy, radius, -Math.PI/2, -Math.PI/2 - swingProg * Math.PI * 2.5, true);
                ctx.arc(hx, hy, radius - 20, -Math.PI/2 - swingProg * Math.PI * 2.5, -Math.PI/2, false);
            }
            ctx.fill();
            ctx.shadowBlur = 0;
        }
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
        if (this.hp <= 0) {
            gameState.running = false;
            gameOverScreen.style.display = 'flex';
        }
    }
}

class Projectile {
    constructor(x, y, vx, vy, isPlayerOwned) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.width = 10;
        this.height = 4;
        this.isPlayerOwned = isPlayerOwned;
        this.life = 2.0; // seconds before disappearing
        this.color = isPlayerOwned ? '#0ff' : '#f00';
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
        ctx.translate(this.x, this.y);
        ctx.rotate(Math.atan2(this.vy, this.vx));
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
        ctx.restore();

        ctx.shadowBlur = 0;
    }
}

function checkMeleeHit(player) {
    let hitboxWidth = 140; // Full 360 width
    let hitboxHeight = 140;
    let hx = player.x + player.width/2 - hitboxWidth/2;
    let hy = player.y + player.height/2 - hitboxHeight/2;

    let hitbox = { x: hx, y: hy, width: hitboxWidth, height: hitboxHeight };

    // Check against enemies (will implement enemies in next step)
    for (let i = enemies.length - 1; i >= 0; i--) {
        let enemy = enemies[i];
        if (AABB(hitbox, enemy)) {
            // Hit enemy
            createParticles(enemy.x + enemy.width/2, enemy.y + enemy.height/2, 20, '#f50');
            enemy.takeDamage(50);
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
        ctx.translate(this.x + this.width/2, this.y + this.height/2 + hoverY);

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



class BossEnemy extends Enemy {
    constructor(x, y) {
        super(x, y);
        this.width = 100;
        this.height = 100;
        this.hp = 1000;
        this.maxHp = 1000;
        this.speed = 50;
        this.color = '#f0f'; // Purple boss
        this.fireCooldown = 1.0;
        this.fireTimer = 1.0;
    }

    draw(ctx) {
        this.animTimer += gameState.deltaTime;

        ctx.save();
        let hoverY = Math.sin(this.animTimer * 2) * 10;
        ctx.translate(this.x + this.width/2, this.y + this.height/2 + hoverY);

        if (player.x < this.x) {
            ctx.scale(-1, 1);
        }

        ctx.shadowBlur = 30;
        ctx.shadowColor = this.color;

        // Big Boss Body
        ctx.fillStyle = '#111';
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 4;

        ctx.beginPath();
        ctx.moveTo(-40, -30);
        ctx.lineTo(30, -40);
        ctx.lineTo(40, 0);
        ctx.lineTo(20, 40);
        ctx.lineTo(-30, 30);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Thruster
        ctx.fillStyle = '#f0f';
        ctx.beginPath();
        ctx.moveTo(-20, 30);
        ctx.lineTo(-10, 50 + Math.random() * 20);
        ctx.lineTo(10, 40);
        ctx.fill();

        // Eye/Sensor
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(15, -10, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        ctx.shadowBlur = 0;

        // Draw Health Bar
        ctx.fillStyle = '#222';
        ctx.fillRect(this.x, this.y - 20, this.width, 8);
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y - 20, this.width * (this.hp / this.maxHp), 8);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y - 20, this.width, 8);
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) {
            createParticles(this.x + this.width/2, this.y + this.height/2, 100, this.color);
            gameState.score += 5000;
            scoreDisplay.innerText = gameState.score;
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
        ctx.fillRect(p.x, p.y, 3, 3);
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

    // Initial safe zone
    platforms.push(new Platform(0, 550, 800, 50));
    platforms.push(new Platform(0, 0, 50, 550, true)); // Starting left wall

    // Generate next chunks
    generatePlatforms();
    generatePlatforms();
}

function generatePlatforms() {
    let startX = platformGenerator.lastX + platformGenerator.chunkWidth;
    let endX = startX + platformGenerator.chunkWidth;

    // Add floor gaps and varied heights
    let floorX = startX;
    while (floorX < endX) {
        // Significantly reduce gaps
        let hasGap = Math.random() > 0.9;
        let pWidth = hasGap ? 150 + Math.random() * 200 : 300 + Math.random() * 500;
        let pHeight = 50;

        if (!hasGap || floorX === startX) {
            platforms.push(new Platform(floorX, 550, pWidth, pHeight));
        }

        let spawnedWall = false;

        // Sometimes spawn a wall obstacle for wall-running
        if (Math.random() > 0.6) {
            // Varying wall heights that are traversable
            let wallHeight = 150 + Math.random() * 150;
            // Position wall in middle of platform, ensuring enough space to jump on both sides
            let wallX = floorX + pWidth/2 - 25;
            platforms.push(new Platform(wallX, 550 - wallHeight, 50, wallHeight, true));
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
        let fy = 200 + Math.random() * 150;
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
    gameState.gameTime = 0;
    gameState.bossSpawned = false;
    scoreDisplay.innerText = gameState.score;
    gameOverScreen.style.display = 'none';
    startScreen.style.display = 'none';
    uiLayer.style.display = 'flex';

    healthBar.style.width = '100%';
    energyBar.style.width = '100%';

    camera.x = 0;
    camera.y = 0;

    initLevel();
    player = new Player(100, 400);
    particles = [];
    projectiles = [];
    enemies = [];
    enemySpawnTimer = 2.0;

    // Spawn initial enemy ahead
    enemies.push(new Enemy(600, 300));

    gameState.lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function update(deltaTime) {
    if (!gameState.running) return;

    gameState.gameTime += deltaTime;
    if (gameState.gameTime >= 15 && !gameState.bossSpawned) {
        let bx = camera.x + canvas.width + 100;
        let by = 150;
        enemies.push(new BossEnemy(bx, by));
        gameState.bossSpawned = true;
    }

    player.update(deltaTime);

    // Update camera to follow player horizontally
    let targetX = player.x - camera.offset;
    // Allow moving camera in both directions
    camera.x += (targetX - camera.x) * 0.1; // Smooth following

    // Optional: prevent camera from going before start
    if (camera.x < 0) camera.x = 0;

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
        if (enemies.length < 15) { // Max enemies on screen
            let spawnCount = Math.floor(Math.random() * 3) + 1; // 1 to 3 enemies
            for (let i = 0; i < spawnCount; i++) {
                if (enemies.length >= 15) break;
                let ex = camera.x + canvas.width + Math.random() * 400; // Spread them out a bit
                let ey = Math.random() * 300 + 50;
                enemies.push(new Enemy(ex, ey)); // Drone
            }
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
                    createParticles(enemy.x + enemy.width/2, enemy.y + enemy.height/2, 10, p.color);
                    enemy.takeDamage(25);
                    projectiles.splice(i, 1);
                    removed = true;
                    break;
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
    let offsetX = camera.x % 50;

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
    ctx.translate(-camera.x, -camera.y);

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

    requestAnimationFrame(gameLoop);

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
