// Elements
const video = document.getElementById('video');
const poseCanvas = document.getElementById('pose-canvas');
const poseCtx = poseCanvas.getContext('2d');
const obstacleCanvas = document.getElementById('obstacle-canvas');
const obstacleCtx = obstacleCanvas.getContext('2d');

// State
let gameState = 'CALIBRATION'; // CALIBRATION, RUNNING
let pose = null;
let camera = null;
let bodyInFrame = false;
let armRaisedDetected = false;
let squatCount = 0; // Total score
let obstaclesDodged = 0; // Number of obstacles successfully dodged
let bananasCollected = 0; // Number of bananas collected
let wasSquatting = false;
let isSquatting = false; // Current squat state for collision detection
let lives = 3; // Player lives
let squatFrameCount = 0; // Counter for consecutive squat frames
let standFrameCount = 0; // Counter for consecutive standing frames
const SQUAT_FRAME_THRESHOLD = 1; // Instant squat detection!
const STAND_FRAME_THRESHOLD = 1; // Instant stand detection!

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
 * Check if entire body is visible in frame
 */
function checkBodyInFrame(landmarks) {
    if (!landmarks || landmarks.length < 33) return false;
    
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    
    const allVisible = leftShoulder.visibility > 0.5 && 
                       rightShoulder.visibility > 0.5 &&
                       leftHip.visibility > 0.5 && 
                       rightHip.visibility > 0.5 &&
                       leftAnkle.visibility > 0.5 && 
                       rightAnkle.visibility > 0.5;
    
    return allVisible;
}

/**
 * Detect raised arm gesture - wrist above shoulder level
 */
function detectRaisedArm(landmarks) {
    if (!landmarks || landmarks.length < 33) return false;
    
    const leftWrist = landmarks[15];
    const leftShoulder = landmarks[11];
    const rightWrist = landmarks[16];
    const rightShoulder = landmarks[12];
    
    const leftArmRaised = leftWrist.visibility > 0.6 && 
                          leftShoulder.visibility > 0.6 && 
                          leftWrist.y < leftShoulder.y;
    
    const rightArmRaised = rightWrist.visibility > 0.6 && 
                           rightShoulder.visibility > 0.6 && 
                           rightWrist.y < rightShoulder.y;
    
    return leftArmRaised || rightArmRaised;
}

/**
 * Detect squat position
 */
function detectSquat(landmarks) {
    if (!landmarks || landmarks.length < 33) return false;
    
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const leftKnee = landmarks[25];
    const rightHip = landmarks[24];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    
    // MUCH MORE LENIENT visibility check
    if (leftHip.visibility < 0.3 || rightHip.visibility < 0.3 || 
        leftKnee.visibility < 0.3 || rightKnee.visibility < 0.3) {
        return false;
    }
    
    const hipY = (leftHip.y + rightHip.y) / 2;
    const kneeY = (leftKnee.y + rightKnee.y) / 2;
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    
    const hipKneeDistance = Math.abs(hipY - kneeY);
    const shoulderHipDistance = Math.abs(shoulderY - hipY);
    
    // SIMPLE squat detection: hip close to knee
    const isSquatting = hipKneeDistance < 0.25; // Very lenient!
    
    return isSquatting;
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
        
        // Check collision with player (when obstacle/banana is at player position)
        const playerCenterX = obstacleCanvas.width / 2;
        const objectAtPlayer = obs.x < playerCenterX && obs.x + obs.width > playerCenterX;
        
        if (objectAtPlayer && !obs.checked) {
            obs.checked = true; // Only check once per object
            
            if (obs.type === 'obstacle') {
                // If player is NOT squatting, turn obstacle red (collision)
                if (!wasSquatting && !isCurrentlySquatting()) {
                    obs.hit = true;
                    loseLife(); // Reduce a heart
                } else {
                    // Successfully dodged - turn green and increment obstacle count
                    obs.dodged = true;
                    obstaclesDodged++;
                    squatCount = obstaclesDodged + (bananasCollected * 2); // Total score
                    document.getElementById('obstacle-count').textContent = obstaclesDodged;
                    document.getElementById('squat-count').textContent = squatCount;
                    
                    // Show instant validation - green flash + motivational text
                    showValidation();
                }
            } else if (obs.type === 'banana') {
                // Banana - collect if standing
                if (!isSquatting && !wasSquatting) {
                    obs.collected = true;
                    bananasCollected++;
                    squatCount = obstaclesDodged + (bananasCollected * 2); // Total score
                    document.getElementById('banana-count').textContent = bananasCollected;
                    document.getElementById('squat-count').textContent = squatCount;
                }
            }
        }
    });
    
    // Remove obstacles that are 100px past the left edge
    obstacles = obstacles.filter(obs => obs.x > -100);
}

/**
 * Show instant validation flash with motivational message
 */
const motivationalMessages = [
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

function showValidation() {
    // Create or get validation overlay
    let validationOverlay = document.getElementById('validation-overlay');
    if (!validationOverlay) {
        validationOverlay = document.createElement('div');
        validationOverlay.id = 'validation-overlay';
        validationOverlay.className = 'validation-overlay';
        document.getElementById('game-container').appendChild(validationOverlay);
    }
    
    // Random motivational message
    const message = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
    validationOverlay.textContent = message;
    
    // Trigger animation
    validationOverlay.classList.remove('show');
    void validationOverlay.offsetWidth; // Force reflow
    validationOverlay.classList.add('show');
    
    // Remove after animation
    setTimeout(() => {
        validationOverlay.classList.remove('show');
    }, 800);
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
        // Don't show monkey yet - wait for body detection in calibration
        // The updateCalibrationUI function will show it when body is detected
    });
}

/**
 * Check if player is currently squatting
 */
function isCurrentlySquatting() {
    return wasSquatting;
}

/**
 * Render obstacles on canvas
 */
function renderObstacles() {
    obstacleCtx.clearRect(0, 0, obstacleCanvas.width, obstacleCanvas.height);
    
    obstacles.forEach(obs => {
        if (obs.type === 'obstacle') {
            // Draw laptop obstacle
            const laptopWidth = obs.width;
            const laptopHeight = obs.height;
            
            // Choose color based on state
            let laptopColor, screenColor, screenGlow;
            if (obs.hit) {
                // Red - collision
                laptopColor = '#ff4444';
                screenColor = '#cc0000';
                screenGlow = false;
                obstacleCtx.shadowColor = 'rgba(255, 68, 68, 0.6)';
                obstacleCtx.shadowBlur = 20;
            } else if (obs.dodged) {
                // Green - successfully dodged
                laptopColor = '#00ff88';
                screenColor = '#00d4aa';
                screenGlow = false;
                obstacleCtx.shadowColor = 'rgba(0, 255, 136, 0.6)';
                obstacleCtx.shadowBlur = 20;
            } else {
                // Gray/Silver - active laptop
                laptopColor = '#9ca3af';
                screenColor = '#4b5563';
                screenGlow = true;
                obstacleCtx.shadowColor = 'rgba(156, 163, 175, 0.5)';
                obstacleCtx.shadowBlur = 15;
            }
            
            // Laptop base (keyboard part) - bottom
            obstacleCtx.fillStyle = laptopColor;
            obstacleCtx.fillRect(obs.x, obs.y, laptopWidth, laptopHeight);
            
            // Laptop screen - top part
            obstacleCtx.fillStyle = screenColor;
            obstacleCtx.fillRect(obs.x + 10, obs.y - 60, laptopWidth - 20, 55);
            
            // Screen glow (blue light) if active
            if (screenGlow) {
                obstacleCtx.fillStyle = '#60a5fa';
                obstacleCtx.fillRect(obs.x + 15, obs.y - 55, laptopWidth - 30, 45);
            }
            
            // Laptop brand logo/icon (center of screen)
            obstacleCtx.shadowBlur = 0;
            obstacleCtx.fillStyle = '#ffffff';
            obstacleCtx.font = 'bold 18px Arial';
            obstacleCtx.textAlign = 'center';
            obstacleCtx.fillText('💼', obs.x + laptopWidth / 2, obs.y - 25);
            
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
 * Draw body skeleton (arms, legs, torso)
 */
function drawSkeleton(landmarks) {
    poseCtx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
    
    // Draw body skeleton (arms, legs, torso)
    if (landmarks && landmarks.length >= 33) {
        // Body connections
        const bodyConnections = [
            // Torso
            [11, 12], // Shoulders
            [11, 23], // Left shoulder to hip
            [12, 24], // Right shoulder to hip
            [23, 24], // Hips
            // Left arm
            [11, 13], // Left shoulder to elbow
            [13, 15], // Left elbow to wrist
            // Right arm
            [12, 14], // Right shoulder to elbow
            [14, 16], // Right elbow to wrist
            // Left leg
            [23, 25], // Left hip to knee
            [25, 27], // Left knee to ankle
            // Right leg
            [24, 26], // Right hip to knee
            [26, 28], // Right knee to ankle
        ];
        
        // Draw body connections
        poseCtx.strokeStyle = '#00d4ff';
        poseCtx.lineWidth = 3;
        poseCtx.lineCap = 'round';
        
        bodyConnections.forEach(([start, end]) => {
            const startPoint = landmarks[start];
            const endPoint = landmarks[end];
            
            if (startPoint && endPoint && 
                startPoint.visibility > 0.5 && endPoint.visibility > 0.5) {
                poseCtx.beginPath();
                poseCtx.moveTo(startPoint.x * poseCanvas.width, startPoint.y * poseCanvas.height);
                poseCtx.lineTo(endPoint.x * poseCanvas.width, endPoint.y * poseCanvas.height);
                poseCtx.stroke();
            }
        });
        
        // Draw body joints
        [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach(idx => {
            const landmark = landmarks[idx];
            if (landmark && landmark.visibility > 0.5) {
                const x = landmark.x * poseCanvas.width;
                const y = landmark.y * poseCanvas.height;
                
                poseCtx.fillStyle = '#ffffff';
                poseCtx.beginPath();
                poseCtx.arc(x, y, 8, 0, 2 * Math.PI);
                poseCtx.fill();
                
                poseCtx.strokeStyle = '#00d4ff';
                poseCtx.lineWidth = 2;
                poseCtx.stroke();
            }
        });
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
            
        } else if (gameState === 'RUNNING') {
            const squatDetected = detectSquat(landmarks);
            
            // DEBUG: Show squat detection status on screen
            const bigMsg = document.getElementById('big-message');
            if (squatDetected) {
                bigMsg.textContent = '🔵 SQUAT DETECTED';
                bigMsg.style.color = '#00ff88';
            } else {
                bigMsg.textContent = '⚪ STANDING';
                bigMsg.style.color = '#ffffff';
            }
            bigMsg.style.fontSize = '24px';
            bigMsg.style.display = 'block';
            
            // Frame smoothing: require consecutive frames to confirm state change
            if (squatDetected) {
                squatFrameCount++;
                standFrameCount = 0;
                
                // Only update to squatting if we have enough consecutive frames
                if (squatFrameCount >= SQUAT_FRAME_THRESHOLD) {
                    updatePlayerVisual(true);
                }
            } else {
                standFrameCount++;
                squatFrameCount = 0;
                
                // Only update to standing if we have enough consecutive frames
                if (standFrameCount >= STAND_FRAME_THRESHOLD) {
                    updatePlayerVisual(false);
                }
            }
            
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
        // Body detected - show monkey with animation and speech bubble
        player.classList.remove('hidden');
        player.classList.add('slide-in');
        
        // Show Coco's introduction
        bigMsg.innerHTML = '💬';
        bigMsg.style.fontSize = '0px'; // Hide text, show speech bubble instead
        subMsg.innerHTML = `
            <div class="speech-bubble">
                Hi! I'm <strong>Coco</strong>. 🐵<br>
                Raise your arm to start the game!
            </div>
        `;
    } else {
        // Body not in frame - hide monkey and show fit instruction
        player.classList.add('hidden');
        player.classList.remove('slide-in');
        bigMsg.style.fontSize = '32px';
        bigMsg.textContent = 'Fit your entire body in the frame';
        subMsg.innerHTML = 'Make sure shoulders, hips, and feet are visible';
    }
}

function startSimulation() {
    gameState = 'RUNNING';
    document.getElementById('message-center').style.display = 'none';
    lastObstacleTime = Date.now(); // Start obstacle timer
}

function updatePlayerVisual(squatting) {
    const player = document.getElementById('player');
    const body = document.querySelector('.player-body');
    const shorts = document.getElementById('shorts');
    
    if (squatting) {
        // Squat: half height + hide shorts
        player.style.height = '135px';
        player.style.bottom = '60px';
        body.style.height = '100px';
        shorts.style.opacity = '0';
        isSquatting = true;
        wasSquatting = true;
    } else {
        // Standing: normal height + show shorts
        player.style.height = '270px';
        player.style.bottom = '120px';
        body.style.height = '200px';
        shorts.style.opacity = '1';
        isSquatting = false;
        
        // Don't count here - only count when obstacle is cleared
        if (wasSquatting) {
            wasSquatting = false;
        }
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

// Initialize everything
initGame();
init();