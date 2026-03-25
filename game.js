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
    deltaTime: 0
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
    shift: false
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
    constructor(x, y, width, height, isWall = false) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.isWall = isWall;
    }

    draw(ctx) {
        ctx.fillStyle = '#223';
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Neon edge
        ctx.strokeStyle = this.isWall ? '#f0f' : '#0ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);

        ctx.shadowBlur = 10;
        ctx.shadowColor = this.isWall ? '#f0f' : '#0ff';
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
        this.dashTimer = 0;
        this.isDashing = false;
        this.dashSpeed = 1000;
        this.dashDuration = 0.15;
        this.dashActiveTimer = 0;

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

            // Melee Attack (Left Click)
            if (mouse.leftClick && this.meleeCooldownTimer <= 0 && !this.isDashing) {
                this.isAttackingMelee = true;
                this.meleeTimer = this.meleeDuration;
                this.meleeCooldownTimer = this.meleeCooldown;
                mouse.leftClick = false; // Prevent holding

                // Melee logic handled in update() or enemies update()
                checkMeleeHit(this);
            }

            // Ranged Attack (Right Click)
            if (mouse.rightClick && this.rangedCooldownTimer <= 0 && !this.isDashing) {
                this.rangedCooldownTimer = this.rangedCooldown;
                mouse.rightClick = false; // Prevent holding

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
            if (AABB(this, p)) {
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
        this.y += dy;
        for (let p of platforms) {
            if (AABB(this, p)) {
                if (dy > 0) { // Falling
                    this.y = p.y - this.height;
                    this.grounded = true;
                    this.vy = 0;
                    this.onWall = false; // Reset wall run if grounded
                } else if (dy < 0) { // Jumping into ceiling
                    this.y = p.y + p.height;
                    this.vy = 0;
                }
            }
        }

        // Screen bounds
        if (this.y > canvas.height) {
            this.takeDamage(100); // Fall off screen
        }
        // Left bound relative to camera
        if (this.x < camera.x) {
            this.x = camera.x;
            this.vx = 0;
        }
        // Right bound prevents player from moving out of right view
        if (this.x > camera.x + canvas.width - this.width) {
            this.x = camera.x + canvas.width - this.width;
            this.vx = 0;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x + this.width/2, this.y + this.height/2);

        if (!this.facingRight) {
            ctx.scale(-1, 1);
        }

        ctx.shadowBlur = this.isDashing ? 20 : 10;
        ctx.shadowColor = this.isDashing ? '#fff' : this.color;

        // --- Draw Cyborg Warrior ---
        let runBob = this.grounded && Math.abs(this.vx) > 10 ? Math.sin(this.animTimer * 20) * 3 : 0;

        // Torso
        ctx.fillStyle = '#111';
        ctx.strokeStyle = this.isDashing ? '#fff' : this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, -15 + runBob);
        ctx.lineTo(10, -15 + runBob);
        ctx.lineTo(8, 5 + runBob);
        ctx.lineTo(-8, 5 + runBob);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Head/Helmet
        ctx.beginPath();
        ctx.arc(0, -22 + runBob, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Visor (Neon Eye)
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 15;
        ctx.fillRect(2, -24 + runBob, 6, 3);
        ctx.shadowBlur = this.isDashing ? 20 : 10;

        // Gun Arm (Front/Right) - Heavy Magnum
        let armAngle = 0;
        // Aiming slightly based on mouse, but default to forward
        if (!this.grounded) armAngle = -0.5;
        if (this.onWall) armAngle = -1.5;

        // Add recoil if recently fired
        if (this.rangedCooldownTimer > this.rangedCooldown - 0.1) {
            armAngle -= 0.5; // Kick upward
        }

        ctx.save();
        ctx.translate(5, -10 + runBob);
        ctx.rotate(armAngle);

        // Upper arm
        ctx.fillStyle = '#222';
        ctx.fillRect(0, -3, 8, 6);

        // Magnum Barrel
        ctx.fillStyle = '#111';
        ctx.fillRect(8, -4, 12, 5);

        // Magnum Underbarrel/Laser sight
        ctx.fillStyle = '#333';
        ctx.fillRect(10, 1, 8, 3);

        // Neon details
        ctx.strokeStyle = '#f0f'; // Railgun accent
        ctx.lineWidth = 1;
        ctx.strokeRect(8, -4, 12, 5);

        // Muzzle flash / glowing tip
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#f0f';
        ctx.fillStyle = '#f0f';
        ctx.fillRect(20, -3, 2, 3);
        ctx.shadowBlur = 0;

        ctx.restore();

        // Sword Arm (Back/Left) - Big Cyber Sword
        ctx.save();
        ctx.translate(-5, -10 + runBob);

        if (this.isAttackingMelee) {
            let swingProg = 1 - (this.meleeTimer / this.meleeDuration);
            // Heavy downward slam arc: starts high behind, ends low in front
            ctx.rotate(-Math.PI * 0.8 + swingProg * Math.PI * 1.5);
        } else if (Math.abs(this.vx) > 10 && this.grounded) {
            // Dragging/running pose
            ctx.rotate(Math.PI * 0.2 + Math.sin(this.animTimer * 20) * 0.2);
        } else {
            // Idle resting pose on shoulder
            ctx.rotate(-Math.PI * 0.4);
        }

        // Arm holding sword
        ctx.fillStyle = '#222';
        ctx.fillRect(0, -3, 15, 6);

        // Cyber Sword Handle
        ctx.fillStyle = '#111';
        ctx.fillRect(15, -4, 10, 8);

        // Cyber Sword Crossguard
        ctx.fillStyle = '#444';
        ctx.fillRect(23, -8, 4, 16);

        // Giant Neon Blade
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#0f0'; // Neon Green for contrast
        ctx.fillStyle = '#0f0';
        ctx.beginPath();
        ctx.moveTo(27, -4); // Bottom edge
        ctx.lineTo(65, -6); // Tip bottom
        ctx.lineTo(70, -2); // Tip point
        ctx.lineTo(60, 4);  // Tip top
        ctx.lineTo(27, 2);  // Top edge
        ctx.closePath();
        ctx.fill();

        // Inner bright core of the blade
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(28, -2);
        ctx.lineTo(64, -3);
        ctx.lineTo(66, -1);
        ctx.lineTo(58, 1);
        ctx.lineTo(28, 0);
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        // Legs
        let legSwing = this.grounded && Math.abs(this.vx) > 10 ? Math.sin(this.animTimer * 20) * 10 : 0;
        let legSpread = this.grounded ? 0 : 5;
        if (this.onWall) { legSwing = 0; legSpread = 0; }

        ctx.strokeStyle = this.isDashing ? '#fff' : this.color;
        // Back leg
        ctx.beginPath(); ctx.moveTo(-4, 5 + runBob); ctx.lineTo(-4 - legSwing - legSpread, 25); ctx.stroke();
        // Front leg
        ctx.beginPath(); ctx.moveTo(4, 5 + runBob); ctx.lineTo(4 + legSwing + legSpread, 25); ctx.stroke();

        ctx.restore(); // Restore facing right transform
        ctx.shadowBlur = 0;

        // Draw Heavy Melee Hitbox swoosh
        if (this.isAttackingMelee && !this.isDashing) {
            ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#0f0';

            let hitboxWidth = 70; // Larger hitbox for big sword
            let hitboxHeight = 80;
            let hx = this.facingRight ? this.x + this.width : this.x - hitboxWidth;
            let hy = this.y + this.height/2 - hitboxHeight/2;

            // Big crescent slash
            ctx.beginPath();
            ctx.moveTo(this.facingRight ? this.x + this.width/2 : this.x + this.width/2, this.y - 20);

            if(this.facingRight) {
                ctx.bezierCurveTo(hx + hitboxWidth + 20, hy - 30, hx + hitboxWidth + 20, hy + hitboxHeight + 30, this.x + this.width/2, this.y + this.height + 20);
                ctx.bezierCurveTo(hx + hitboxWidth, hy + hitboxHeight, hx + hitboxWidth, hy, this.x + this.width/2, this.y);
            } else {
                ctx.bezierCurveTo(hx - 20, hy - 30, hx - 20, hy + hitboxHeight + 30, this.x + this.width/2, this.y + this.height + 20);
                ctx.bezierCurveTo(hx, hy + hitboxHeight, hx, hy, this.x + this.width/2, this.y);
            }

            ctx.fill();

            ctx.strokeStyle = '#0f0';
            ctx.lineWidth = 4;
            ctx.stroke();

            ctx.shadowBlur = 0;
        }
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
    let hitboxWidth = 70; // Match new visual size
    let hitboxHeight = 80;
    let hx = player.facingRight ? player.x + player.width : player.x - hitboxWidth;
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
        let hasGap = Math.random() > 0.7;
        let pWidth = hasGap ? 150 + Math.random() * 200 : 300 + Math.random() * 300;
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
        let fy = 150 + Math.random() * 200;
        let fw = 80 + Math.random() * 100;

        let valid = true;
        let newFloat = new Platform(fx, fy, fw, 20);

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
    enemies.push(new Enemy(600, 100));

    gameState.lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function update(deltaTime) {
    if (!gameState.running) return;

    player.update(deltaTime);

    // Update camera to follow player horizontally
    let targetX = player.x - camera.offset;
    // Only move camera forward
    if (targetX > camera.x) {
        camera.x = targetX;
    }

    // Procedural generation logic
    if (camera.x + canvas.width > platformGenerator.lastX) {
        generatePlatforms();
    }

    // Clean up old platforms behind camera
    for (let i = platforms.length - 1; i >= 0; i--) {
        if (platforms[i].x + platforms[i].width < camera.x - 200) {
            platforms.splice(i, 1);
        }
    }

    updateParticles(deltaTime);

    // Spawn enemies
    enemySpawnTimer -= deltaTime;
    if (enemySpawnTimer <= 0) {
        enemySpawnTimer = enemySpawnRate;
        if (enemies.length < 5) { // Max enemies on screen
            // Spawn random position ahead of camera
            let ex = camera.x + canvas.width + Math.random() * 200;
            let ey = Math.random() * 300 + 50;
            enemies.push(new Enemy(ex, ey));
        }
    }

    // Update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        let enemy = enemies[i];
        enemy.update(deltaTime);

        // Check collision with player
        if (AABB(player, enemy) && !player.isDashing) {
            player.takeDamage(5); // Collision damage
            // Push player back slightly
            let dx = player.x - enemy.x;
            player.vx = dx > 0 ? 200 : -200;
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
            // Enemy projectile hits player
            if (AABB(p, player) && !player.isDashing) { // Phase dash grants invincibility
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

    for(let i = -offsetX; i < canvas.width; i += 50) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for(let i = 0; i < canvas.height; i += 50) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

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
    if (!gameState.running) return;

    gameState.deltaTime = (timestamp - gameState.lastTime) / 1000;
    gameState.lastTime = timestamp;

    // Cap delta time to prevent huge jumps when tab is inactive
    if (gameState.deltaTime > 0.1) gameState.deltaTime = 0.1;

    update(gameState.deltaTime);
    draw(ctx);

    requestAnimationFrame(gameLoop);
}

restartBtn.addEventListener('click', initGame);
startBtn.addEventListener('click', initGame);

// Start game loop but don't init game yet
gameState.running = false;
gameState.lastTime = performance.now();
requestAnimationFrame(gameLoop);
