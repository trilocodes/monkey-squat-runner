// Elements
const video = document.getElementById('video');
const poseCanvas = document.getElementById('pose-canvas');
const poseCtx = poseCanvas.getContext('2d');
const obstacleCanvas = document.getElementById('obstacle-canvas');
const obstacleCtx = obstacleCanvas.getContext('2d');

// State
let gameState = 'CALIBRATION'; // CALIBRATION, COUNTDOWN, RUNNING
let pose = null;
let camera = null;
let bodyInFrame = false;
let armRaisedDetected = false;
let squatCount = 0; // Total score
let obstaclesDodged = 0; // Number of obstacles successfully dodged
let bananasCollected = 0; // Number of bananas collected
let isSquatting = false; // Current squat state for collision detection
let lives = 3; // Player lives

// Calibration for squat detection
let standingHipHeight = null; // Baseline hip height when standing
let calibrationFrames = []; // Store first 30 frames for calibration
const CALIBRATION_FRAMES_NEEDED = 30;

// Body detection smoothing
let bodyInFrameCount = 0;
const BODY_DETECTION_THRESHOLD = 5; // Need 5 consecutive frames

// Arm raise detection smoothing
let armRaiseCount = 0;
const ARM_RAISE_THRESHOLD = 8; // Need 8 consecutive frames to prevent false triggers

// Obstacle state
let obstacles = [];
let lastObstacleTime = 0;
const OBSTACLE_SPEED = 8; // Faster movement (was 5)
const OBSTACLE_GAP = 8000; // Longer gap - 8 seconds (was 5.2)
const OBSTACLE_WIDTH = 240; // Longer obstacle (was 150) - keeps squat time same at 0.5s
const OBSTACLE_HEIGHT = 80;
const OBSTACLE_Y_POSITION = 450; // Same height as character head

// Canvas Setup
function resizeCanvas() {
    poseCanvas.width = window.innerWidth;
    poseCanvas.height = window.innerHeight;
    obstacleCanvas.width = window.innerWidth;
    obstacleCanvas.height = window.innerHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ==================== POSE DETECTION ====================

/**
 * Check if entire body is visible in frame - with smoothing
 */
function checkBodyInFrame(landmarks) {
    if (!landmarks || landmarks.length < 33) {
        bodyInFrameCount = 0;
        return false;
    }
    
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    
    // More lenient - only need shoulders, hips, and knees (not ankles)
    // Reduced visibility threshold to 0.4 (was 0.5)
    const bodyPartsVisible = leftShoulder.visibility > 0.4 && 
                              rightShoulder.visibility > 0.4 &&
                              leftHip.visibility > 0.4 && 
                              rightHip.visibility > 0.4 &&
                              leftKnee.visibility > 0.4 && 
                              rightKnee.visibility > 0.4;
    
    // Frame smoothing - need consecutive frames
    if (bodyPartsVisible) {
        bodyInFrameCount++;
    } else {
        bodyInFrameCount = Math.max(0, bodyInFrameCount - 2); // Decay slower
    }
    
    // Return true only after threshold consecutive frames
    return bodyInFrameCount >= BODY_DETECTION_THRESHOLD;
}

/**
 * Detect raised arm gesture - wrist above shoulder level - with smoothing
 */
function detectRaisedArm(landmarks) {
    if (!landmarks || landmarks.length < 33) {
        armRaiseCount = 0;
        return false;
    }
    
    const leftWrist = landmarks[15];
    const leftShoulder = landmarks[11];
    const rightWrist = landmarks[16];
    const rightShoulder = landmarks[12];
    
    // More lenient visibility threshold
    const leftArmRaised = leftWrist.visibility > 0.5 && 
                          leftShoulder.visibility > 0.5 && 
                          leftWrist.y < leftShoulder.y - 0.05; // 5% margin
    
    const rightArmRaised = rightWrist.visibility > 0.5 && 
                           rightShoulder.visibility > 0.5 && 
                           rightWrist.y < rightShoulder.y - 0.05; // 5% margin
    
    const armRaised = leftArmRaised || rightArmRaised;
    
    // Frame smoothing - need consecutive frames
    if (armRaised) {
        armRaiseCount++;
    } else {
        armRaiseCount = Math.max(0, armRaiseCount - 1);
    }
    
    // Return true only after threshold consecutive frames
    return armRaiseCount >= ARM_RAISE_THRESHOLD;
}

/**
 * Detect squat position - uses baseline comparison
 */
function detectSquat(landmarks) {
    if (!landmarks || landmarks.length < 33) return false;
    
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    
    // Check visibility
    if (leftHip.visibility < 0.5 || rightHip.visibility < 0.5 || 
        leftKnee.visibility < 0.5 || rightKnee.visibility < 0.5) {
        return false;
    }
    
    const currentHipY = (leftHip.y + rightHip.y) / 2;
    
    // If we don't have a baseline yet, we're not squatting
    if (standingHipHeight === null) {
        return false;
    }
    
    // Squat detected when hips drop by 15% or more from standing position
    const hipDrop = currentHipY - standingHipHeight;
    const isSquatting = hipDrop > 0.15; // Hip moved DOWN (y increases)
    
    return isSquatting;
}

/**
 * Calibrate standing position - called during first 30 frames of gameplay
 */
function calibrateStandingPosition(landmarks) {
    if (!landmarks || landmarks.length < 33) return;
    
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    
    if (leftHip.visibility > 0.5 && rightHip.visibility > 0.5) {
        const hipY = (leftHip.y + rightHip.y) / 2;
        calibrationFrames.push(hipY);
        
        // After collecting enough frames, calculate baseline
        if (calibrationFrames.length === CALIBRATION_FRAMES_NEEDED) {
            // Use median of collected values to avoid outliers
            calibrationFrames.sort((a, b) => a - b);
            standingHipHeight = calibrationFrames[Math.floor(CALIBRATION_FRAMES_NEEDED / 2)];
            console.log('Standing baseline calibrated:', standingHipHeight);
        }
    }
}

// ==================== SKELETON DRAWING ====================

/**
 * Spawn a new obstacle from the right side
 */
function spawnObstacle() {
    obstacles.push({
        type: 'obstacle',
        x: obstacleCanvas.width,
        y: obstacleCanvas.height - OBSTACLE_Y_POSITION,
        width: OBSTACLE_WIDTH,
        height: OBSTACLE_HEIGHT
    });
}

/**
 * Spawn a banana collectible
 */
function spawnBanana() {
    obstacles.push({
        type: 'banana',
        x: obstacleCanvas.width,
        y: obstacleCanvas.height - OBSTACLE_Y_POSITION - 20, // Slightly higher than obstacles
        width: 60,
        height: 60
    });
}

/**
 * Update obstacles - move them and remove off-screen ones
 */
function updateObstacles() {
    const now = Date.now();
    
    // Spawn new obstacle if enough time has passed
    if (now - lastObstacleTime > OBSTACLE_GAP) {
        spawnObstacle();
        lastObstacleTime = now;
        
        // Spawn banana exactly in middle of gap (4 seconds after obstacle)
        setTimeout(() => {
            if (gameState === 'RUNNING') {
                spawnBanana();
            }
        }, 4000);
    }
    
    // Move obstacles and bananas
    obstacles.forEach(obs => {
        obs.x -= OBSTACLE_SPEED;
        
        // Only check collisions when game is RUNNING (not during COUNTDOWN)
        if (gameState === 'RUNNING') {
            // Check collision with player - adjust position based on screen size
            // Mobile: 18%, Tablet: 25%, Desktop: 30%
            const isMobile = window.innerWidth <= 768;
            const isTablet = window.innerWidth > 768 && window.innerWidth <= 1024;
            let playerPosition = 0.3; // Desktop default
            if (isMobile) playerPosition = 0.18;
            else if (isTablet) playerPosition = 0.25;
            
            const playerCenterX = obstacleCanvas.width * playerPosition;
            const objectAtPlayer = obs.x < playerCenterX && obs.x + obs.width > playerCenterX;
            
            if (objectAtPlayer && !obs.checked) {
                obs.checked = true; // Only check once per object
                
                if (obs.type === 'obstacle') {
                    // If player is NOT squatting, turn obstacle red (collision)
                    if (!isSquatting) {
                        obs.hit = true;
                        loseLife(); // Reduce a heart
                    } else {
                        // Successfully dodged - turn green and increment obstacle count
                        obs.dodged = true;
                        obstaclesDodged++;
                        squatCount = obstaclesDodged + (bananasCollected * 2); // Total score
                        document.getElementById('obstacle-count').textContent = obstaclesDodged;
                        document.getElementById('squat-count').textContent = squatCount;
                        
                        // Show comic book effect only
                        showComicEffect();
                    }
                } else if (obs.type === 'banana') {
                    // Banana - collect if standing (not squatting)
                    if (!isSquatting) {
                        obs.collected = true;
                        bananasCollected++;
                        squatCount = obstaclesDodged + (bananasCollected * 2); // Total score
                        document.getElementById('banana-count').textContent = bananasCollected;
                        document.getElementById('squat-count').textContent = squatCount;
                    } else {
                        // Missed banana (was squatting when it passed)
                        obs.missed = true;
                    }
                }
            }
        }
    });
    
    // Remove obstacles that are 100px past the left edge
    obstacles = obstacles.filter(obs => obs.x > -100);
}

/**
 * Show comic book style effect on successful squat
 */
function showComicEffect() {
    // Use the same motivational messages but with comic book styling
    const messages = [
        "Nice dodge! 💪",
        "Perfect squat! 🔥",
        "You got this! ⚡",
        "Crushing it! 🌟",
        "Keep going! 💯",
        "Awesome! 🎯",
        "Beast mode! 🦾",
        "On fire! 🚀",
        "Smooth! ✨",
        "Nailed it! 👏"
    ];
    
    const colors = [
        "#FFD700", // Gold
        "#FF6B35", // Orange-red
        "#FF4444", // Red
        "#00D4FF", // Cyan
        "#FF69B4", // Pink
        "#9D4EDD", // Purple
        "#00FF88", // Green
        "#FFA500"  // Orange
    ];
    
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const randomRotation = -15 + Math.random() * 30; // -15 to +15 degrees
    
    // Create comic effect element
    const comicEl = document.createElement('div');
    comicEl.className = 'comic-effect';
    comicEl.textContent = randomMessage;
    comicEl.style.color = randomColor;
    comicEl.style.setProperty('--rotation', randomRotation + 'deg');
    
    // Random position (middle-right area where obstacles are)
    const randomTop = 30 + Math.random() * 40; // 30-70% from top
    const randomLeft = 40 + Math.random() * 30; // 40-70% from left
    comicEl.style.top = randomTop + '%';
    comicEl.style.left = randomLeft + '%';
    
    document.getElementById('game-container').appendChild(comicEl);
    
    // Remove after animation
    setTimeout(() => {
        comicEl.remove();
    }, 1000);
}

/**
 * Lose a life and update hearts display
 */
function loseLife() {
    if (lives <= 0) return; // Already dead
    
    lives--;
    
    // Update heart display
    if (lives === 2) {
        document.getElementById('heart3').classList.add('lost');
    } else if (lives === 1) {
        document.getElementById('heart2').classList.add('lost');
    } else if (lives === 0) {
        document.getElementById('heart1').classList.add('lost');
        // Game over!
        gameOver();
    }
}

/**
 * Show game over popup and wait for restart
 */
function gameOver() {
    gameState = 'GAME_OVER';
    
    // Stop spawning obstacles
    obstacles = [];
    
    // Hide monkey character
    document.getElementById('player').classList.add('hidden');
    
    // Show game over popup with stats
    const popup = document.getElementById('game-over-popup');
    document.getElementById('final-score').textContent = squatCount;
    document.getElementById('final-obstacles').textContent = obstaclesDodged;
    document.getElementById('final-bananas').textContent = bananasCollected;
    popup.classList.add('show');
    
    // Restart button handler
    const restartBtn = document.getElementById('restart-btn');
    const handleRestart = () => {
        popup.classList.remove('show');
        
        // Reset game state
        gameState = 'CALIBRATION';
        lives = 3;
        squatCount = 0;
        obstaclesDodged = 0;
        bananasCollected = 0;
        obstacles = [];
        wasSquatting = false;
        isSquatting = false;
        squatFrameCount = 0;
        standFrameCount = 0;
        
        // Reset UI
        document.getElementById('squat-count').textContent = '0';
        document.getElementById('obstacle-count').textContent = '0';
        document.getElementById('banana-count').textContent = '0';
        document.getElementById('heart1').classList.remove('lost');
        document.getElementById('heart2').classList.remove('lost');
        document.getElementById('heart3').classList.remove('lost');
        document.getElementById('message-center').style.display = 'block';
        document.getElementById('player').classList.add('hidden');
        
        // Clear obstacle canvas
        obstacleCtx.clearRect(0, 0, obstacleCanvas.width, obstacleCanvas.height);
        
        restartBtn.removeEventListener('click', handleRestart);
    };
    
    restartBtn.addEventListener('click', handleRestart);
}

/**
 * Initialize game and show how-to-play
 */
function initGame() {
    // Show how-to-play modal on load
    const howToPlay = document.getElementById('how-to-play');
    const playerCharacter = document.getElementById('player');
    
    howToPlay.classList.remove('hidden');
    playerCharacter.classList.add('hidden'); // Hide monkey during tutorial
    
    // Start button click handler
    const startBtn = document.getElementById('start-game-btn');
    startBtn.addEventListener('click', () => {
        howToPlay.classList.add('hidden');
        // Start camera and pose detection
        init();
    });
}

/**
 * Render obstacles on canvas
 */
function renderObstacles() {
    obstacleCtx.clearRect(0, 0, obstacleCanvas.width, obstacleCanvas.height);
    
    obstacles.forEach(obs => {
        if (obs.type === 'obstacle') {
            // Draw "💻WORK💻" text obstacle
            const textX = obs.x + obs.width / 2;
            const textY = obs.y + obs.height / 2;
            
            // Choose color based on state
            let textColor, shadowColor, gradientStart, gradientEnd;
            if (obs.hit) {
                // Red - collision
                textColor = '#ff4444';
                shadowColor = 'rgba(255, 68, 68, 0.8)';
                gradientStart = '#ff6666';
                gradientEnd = '#cc0000';
            } else if (obs.dodged) {
                // Green - successfully dodged
                textColor = '#00ff88';
                shadowColor = 'rgba(0, 255, 136, 0.8)';
                gradientStart = '#00ff88';
                gradientEnd = '#00cc66';
            } else {
                // Active obstacle - BRIGHT YELLOW/ORANGE comic book style
                textColor = '#FFD700'; // Bright gold/yellow
                shadowColor = 'rgba(255, 140, 0, 0.9)'; // Orange shadow
                gradientStart = '#FFD700';
                gradientEnd = '#FFA500';
            }
            
            // Draw cartoonish text with shadow
            obstacleCtx.shadowColor = shadowColor;
            obstacleCtx.shadowBlur = 25;
            obstacleCtx.shadowOffsetX = 4;
            obstacleCtx.shadowOffsetY = 4;
            
            // Main text - responsive size based on screen width
            const isMobile = window.innerWidth <= 768;
            const fontSize = isMobile ? 36 : 52; // Smaller on mobile
            const strokeWidth = isMobile ? 3 : 5; // Thinner stroke on mobile
            
            obstacleCtx.fillStyle = textColor;
            obstacleCtx.font = `bold ${fontSize}px Impact, "Arial Black", sans-serif`;
            obstacleCtx.textAlign = 'center';
            obstacleCtx.textBaseline = 'middle';
            
            // Add thick black stroke for comic effect
            obstacleCtx.strokeStyle = '#000000';
            obstacleCtx.lineWidth = strokeWidth;
            obstacleCtx.strokeText('💻WORK💻', textX, textY);
            
            // Fill with gradient for more pop
            const gradient = obstacleCtx.createLinearGradient(textX, textY - 30, textX, textY + 30);
            gradient.addColorStop(0, gradientStart);
            gradient.addColorStop(1, gradientEnd);
            obstacleCtx.fillStyle = gradient;
            obstacleCtx.fillText('💻WORK💻', textX, textY);
            
            // Reset shadows
            obstacleCtx.shadowBlur = 0;
            obstacleCtx.shadowOffsetX = 0;
            obstacleCtx.shadowOffsetY = 0;
            
        } else if (obs.type === 'banana' && !obs.collected) {
            // Draw banana emoji with glow
            obstacleCtx.font = '60px Arial';
            obstacleCtx.shadowColor = 'rgba(255, 235, 59, 0.6)';
            obstacleCtx.shadowBlur = 20;
            obstacleCtx.fillText('🍌', obs.x, obs.y + 50);
        }
    });
    
    // Reset shadow
    obstacleCtx.shadowColor = 'transparent';
    obstacleCtx.shadowBlur = 0;
    obstacleCtx.shadowOffsetY = 0;
}

// ==================== SKELETON DRAWING ====================

/**
 * Draw body skeleton (arms, legs, torso) in PiP area
 */
function drawSkeleton(landmarks) {
    poseCtx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
    
    // Only draw skeleton in the PiP area (bottom-right)
    if (landmarks && landmarks.length >= 33) {
        // PiP video position: bottom-right corner
        const isMobile = window.innerWidth <= 768;
        const pipWidth = isMobile ? 100 : 200;
        const pipHeight = isMobile ? 75 : 150;
        const pipX = poseCanvas.width - pipWidth - (isMobile ? 8 : 20);
        const pipY = poseCanvas.height - pipHeight - (isMobile ? 8 : 20);
        
        // Set line style once
        poseCtx.strokeStyle = '#00d4ff';
        poseCtx.lineWidth = isMobile ? 1 : 2;
        poseCtx.lineCap = 'round';
        
        // Draw all connections in one path for better performance
        poseCtx.beginPath();
        
        const bodyConnections = [
            [11, 12], [11, 23], [12, 24], [23, 24], // Torso
            [11, 13], [13, 15], [12, 14], [14, 16], // Arms
            [23, 25], [25, 27], [24, 26], [26, 28]  // Legs
        ];
        
        bodyConnections.forEach(([start, end]) => {
            const startPoint = landmarks[start];
            const endPoint = landmarks[end];
            
            if (startPoint && endPoint && 
                startPoint.visibility > 0.5 && endPoint.visibility > 0.5) {
                poseCtx.moveTo(pipX + startPoint.x * pipWidth, pipY + startPoint.y * pipHeight);
                poseCtx.lineTo(pipX + endPoint.x * pipWidth, pipY + endPoint.y * pipHeight);
            }
        });
        
        poseCtx.stroke();
        
        // Skip drawing joints on mobile for better performance
        if (!isMobile) {
            poseCtx.fillStyle = '#ffffff';
            [11, 12, 23, 24, 25, 26].forEach(idx => { // Only major joints
                const landmark = landmarks[idx];
                if (landmark && landmark.visibility > 0.5) {
                    poseCtx.beginPath();
                    poseCtx.arc(pipX + landmark.x * pipWidth, pipY + landmark.y * pipHeight, 3, 0, 2 * Math.PI);
                    poseCtx.fill();
                }
            });
        }
    }
}

// ==================== MEDIAPIPE CALLBACKS ====================

function onPoseResults(results) {
    if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks;
        
        drawSkeleton(landmarks);
        
        if (gameState === 'CALIBRATION') {
            bodyInFrame = checkBodyInFrame(landmarks);
            
            if (bodyInFrame) {
                armRaisedDetected = detectRaisedArm(landmarks);
                if (armRaisedDetected) {
                    startSimulation();
                }
            }
            
            updateCalibrationUI();
            
        } else if (gameState === 'COUNTDOWN') {
            // During countdown: show obstacles but no collision detection
            // Calibrate standing position
            if (calibrationFrames.length < CALIBRATION_FRAMES_NEEDED) {
                calibrateStandingPosition(landmarks);
            }
            
            // Update and render obstacles (no collision yet)
            updateObstacles();
            renderObstacles();
            
        } else if (gameState === 'RUNNING') {
            // Calibrate standing position during first 30 frames
            if (calibrationFrames.length < CALIBRATION_FRAMES_NEEDED) {
                calibrateStandingPosition(landmarks);
            }
            
            // Detect squat (only after calibration is done)
            const squatDetected = detectSquat(landmarks);
            
            // Update state immediately - no smoothing needed
            isSquatting = squatDetected;
            
            // Update visual
            updatePlayerVisual(isSquatting);
            
            // DEBUG: Show squat detection status
            const bigMsg = document.getElementById('big-message');
            const leftHip = landmarks[23];
            const rightHip = landmarks[24];
            const currentHipY = (leftHip.y + rightHip.y) / 2;
            const drop = standingHipHeight ? ((currentHipY - standingHipHeight) * 100).toFixed(0) : 0;
            
            if (isSquatting) {
                bigMsg.textContent = `🔵 SQUATTING (${drop}%)`;
                bigMsg.style.color = '#00ff88';
            } else {
                bigMsg.textContent = `⚪ STANDING (${drop}%)`;
                bigMsg.style.color = '#ffffff';
            }
            bigMsg.style.fontSize = '20px';
            bigMsg.style.display = 'block';
            
            // Update and render obstacles
            updateObstacles();
            renderObstacles();
        }
    }
}

// ==================== UI UPDATES ====================

function updateCalibrationUI() {
    const bigMsg = document.getElementById('big-message');
    const subMsg = document.getElementById('sub-message');
    const player = document.getElementById('player');
    
    if (bodyInFrame) {
        // Body detected - show monkey
        player.classList.remove('hidden');
        player.classList.add('slide-in');
        
        bigMsg.innerHTML = '💬';
        bigMsg.style.fontSize = '0px';
        subMsg.innerHTML = `
            <div class="speech-bubble">
                Hi! I'm <strong>Coco</strong>. 🐵<br>
                Raise your arm to start!
            </div>
        `;
    } else {
        // Body not in frame
        player.classList.add('hidden');
        player.classList.remove('slide-in');
        bigMsg.style.fontSize = '32px';
        bigMsg.textContent = 'Fit your body in the frame';
        subMsg.innerHTML = 'Shoulders, hips, and knees visible';
    }
}

function startSimulation() {
    // Change to COUNTDOWN state first
    gameState = 'COUNTDOWN';
    
    const messageCenter = document.getElementById('message-center');
    const bigMsg = document.getElementById('big-message');
    const subMsg = document.getElementById('sub-message');
    
    // Start obstacles spawning immediately
    lastObstacleTime = Date.now() - (OBSTACLE_GAP - 3000); // First obstacle spawns in 3 seconds
    
    // Reset calibration
    calibrationFrames = [];
    standingHipHeight = null;
    
    let count = 3;
    subMsg.innerHTML = '';
    
    const countdownInterval = setInterval(() => {
        if (count > 0) {
            bigMsg.textContent = count;
            bigMsg.style.fontSize = '120px';
            bigMsg.style.color = '#FFD700';
            bigMsg.style.textShadow = '0 0 40px #FFD700, 0 0 80px #FFA500, 0 4px 8px rgba(0,0,0,0.5)';
            count--;
        } else {
            clearInterval(countdownInterval);
            bigMsg.textContent = 'GO!';
            bigMsg.style.color = '#00ff88';
            bigMsg.style.textShadow = '0 0 40px #00ff88, 0 0 80px #00d4aa, 0 4px 8px rgba(0,0,0,0.5)';
            
            setTimeout(() => {
                gameState = 'RUNNING';
                messageCenter.style.display = 'none';
            }, 500);
        }
    }, 1000);
}

function updatePlayerVisual(squatting) {
    const player = document.getElementById('player');
    const body = document.querySelector('.player-body');
    const shorts = document.getElementById('shorts');
    
    if (squatting) {
        // Squat: half height + hide shorts (updated for new smaller size)
        player.style.height = '105px'; // Half of 210px
        player.style.bottom = '60px';
        body.style.height = '78px'; // Half of 155px
        shorts.style.opacity = '0';
    } else {
        // Standing: normal height + show shorts (updated for new size)
        player.style.height = '210px'; // New desktop size
        player.style.bottom = '120px';
        body.style.height = '155px'; // New desktop size
        shorts.style.opacity = '1';
    }
}

// ==================== CAMERA SETUP ====================

async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' }
    });
    video.srcObject = stream;
    return new Promise(resolve => {
        video.onloadedmetadata = () => resolve(video);
    });
}

async function init() {
    // Prevent multiple initializations
    if (camera) {
        console.log('Camera already initialized');
        return;
    }
    
    await setupCamera();
    
    pose = new Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });
    
    pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    
    pose.onResults(onPoseResults);
    
    camera = new Camera(video, {
        onFrame: async () => {
            await pose.send({ image: video });
        },
        width: 1280,
        height: 720
    });
    
    camera.start();
}

// Initialize game UI (but don't start camera yet)
initGame();