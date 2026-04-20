// Game State
let gameState = {
    screen: 'title',
    speed: 'slow',
    speedIntervals: {
        slow: 4000,
        medium: 3000,
        fast: 2000
    },
    lives: 3,
    workDodged: 0,
    bananasEaten: 0,
    isSquatting: false,
    gameRunning: false,
    obstacles: [],
    bodyDetected: false,
    detectionFrameCount: 0,
    lastObstacleType: null,
    countdownStarted: false  // Prevent multiple countdown triggers
};

// GLOBAL CONTROL - Only ONE spawn interval can exist
let SPAWN_INTERVAL_ID = null;

// MediaPipe Setup
let pose;
let camera;
let poseResults = null;

// DOM Elements
const screens = {
    title: document.getElementById('title-screen'),
    setup: document.getElementById('setup-screen'),
    ready: document.getElementById('ready-screen'),
    countdown: document.getElementById('countdown-screen'),
    game: document.getElementById('game-screen'),
    gameover: document.getElementById('gameover-screen')
};

const video = document.getElementById('video');
const poseCanvas = document.getElementById('pose-canvas');
const poseCtx = poseCanvas.getContext('2d');
const monkey = document.getElementById('monkey');
const obstaclesContainer = document.getElementById('obstacles-container');
const feedback = document.getElementById('feedback');
const poseStatus = document.getElementById('pose-status');

// Initialize
function init() {
    setupEventListeners();
    initMediaPipe();
}

// Event Listeners
function setupEventListeners() {
    // Speed selection
    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            gameState.speed = this.dataset.speed;
        });
    });

    // Start button
    document.getElementById('start-btn').addEventListener('click', () => {
        switchScreen('setup');
    });

    // Restart button
    document.getElementById('restart-btn').addEventListener('click', () => {
        resetGame();
        switchScreen('title');
    });
}

// Screen Management
function switchScreen(screenName) {
    // Hide ALL screens first
    Object.values(screens).forEach(screen => {
        if (screen) {
            screen.classList.remove('active');
            screen.style.display = 'none';
            screen.style.visibility = 'hidden';
            screen.style.opacity = '0';
        }
    });
    
    // Show only the target screen
    if (screens[screenName]) {
        screens[screenName].classList.add('active');
        screens[screenName].style.display = 'flex';
        screens[screenName].style.visibility = 'visible';
        screens[screenName].style.opacity = '1';
    }
    
    gameState.screen = screenName;
    console.log(`Switched to screen: ${screenName}`);
}

// MediaPipe Initialization
async function initMediaPipe() {
    console.log('Initializing MediaPipe...');
    
    // Detect mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTablet = /(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(navigator.userAgent);
    
    pose = new Pose({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        }
    });

    // Optimize settings based on device
    pose.setOptions({
        modelComplexity: isMobile ? 0 : 1, // Use lighter model on mobile
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: isMobile ? 0.6 : 0.5,
        minTrackingConfidence: isMobile ? 0.6 : 0.5
    });

    pose.onResults(onPoseResults);

    try {
        console.log('Requesting camera access...');
        
        // Request camera with mobile-optimized constraints
        const constraints = {
            video: {
                width: isMobile ? { ideal: 640 } : { ideal: 1280 },
                height: isMobile ? { ideal: 480 } : { ideal: 720 },
                facingMode: 'user',
                frameRate: isMobile ? { ideal: 15, max: 24 } : { ideal: 30 }
            }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        console.log('Camera access granted!');
        video.srcObject = stream;
        
        video.onloadedmetadata = () => {
            console.log('Video metadata loaded');
            poseCanvas.width = video.videoWidth;
            poseCanvas.height = video.videoHeight;
            
            console.log(`Canvas size: ${poseCanvas.width}x${poseCanvas.height}`);
            
            camera = new Camera(video, {
                onFrame: async () => {
                    await pose.send({ image: video });
                },
                width: isMobile ? 640 : 1280,
                height: isMobile ? 480 : 720
            });
            
            camera.start();
            console.log('Camera started!');
        };
    } catch (error) {
        console.error('Camera access error:', error);
        alert('Please allow camera access to play the game! Make sure you\'re using HTTPS or localhost.');
    }
}

// Pose Detection Results
function onPoseResults(results) {
    poseResults = results;
    
    // Clear canvas
    poseCtx.save();
    poseCtx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
    
    if (results.poseLandmarks) {
        // Draw skeleton manually
        drawSkeleton(results.poseLandmarks);
        
        // Track body detection
        if (gameState.screen === 'setup' && !gameState.bodyDetected) {
            gameState.detectionFrameCount++;
            
            // After 10 frames of consistent detection, consider body detected
            if (gameState.detectionFrameCount > 10) {
                gameState.bodyDetected = true;
                document.getElementById('detection-status').innerHTML = 
                    '<span style="color: #90EE90;">✓ Body Detected!</span>';
                
                // Wait a moment then switch to ready screen
                setTimeout(() => {
                    switchScreen('ready');
                }, 1000);
            } else {
                document.getElementById('detection-status').innerHTML = 
                    `<span>⏳ Detecting... (${Math.floor(gameState.detectionFrameCount / 10 * 100)}%)</span>`;
            }
        }
    } else {
        // Reset detection if pose lost
        if (gameState.screen === 'setup') {
            gameState.detectionFrameCount = Math.max(0, gameState.detectionFrameCount - 1);
        }
    }
    
    poseCtx.restore();
    
    // Check pose state
    if (results.poseLandmarks) {
        checkSquat(results.poseLandmarks);
        
        if (gameState.screen === 'ready') {
            checkHandRaise(results.poseLandmarks);
        }
    }
}

// Draw skeleton manually
function drawSkeleton(landmarks) {
    const width = poseCanvas.width;
    const height = poseCanvas.height;
    
    // Define pose connections
    const connections = [
        [11, 12], // Shoulders
        [11, 13], [13, 15], // Left arm
        [12, 14], [14, 16], // Right arm
        [11, 23], [12, 24], // Torso
        [23, 24], // Hips
        [23, 25], [25, 27], [27, 29], [27, 31], // Left leg
        [24, 26], [26, 28], [28, 30], [28, 32], // Right leg
        [0, 1], [1, 2], [2, 3], [3, 7], // Face left
        [0, 4], [4, 5], [5, 6], [6, 8], // Face right
    ];
    
    // Draw connections (lines)
    poseCtx.strokeStyle = '#90EE90';
    poseCtx.lineWidth = 4;
    
    connections.forEach(([start, end]) => {
        if (landmarks[start] && landmarks[end]) {
            poseCtx.beginPath();
            poseCtx.moveTo(landmarks[start].x * width, landmarks[start].y * height);
            poseCtx.lineTo(landmarks[end].x * width, landmarks[end].y * height);
            poseCtx.stroke();
        }
    });
    
    // Draw landmarks (circles)
    poseCtx.fillStyle = '#FFD700';
    landmarks.forEach((landmark) => {
        poseCtx.beginPath();
        poseCtx.arc(landmark.x * width, landmark.y * height, 6, 0, 2 * Math.PI);
        poseCtx.fill();
    });
}

// Check if player is squatting
function checkSquat(landmarks) {
    if (!landmarks) return;
    
    const leftHip = landmarks[23];
    const leftKnee = landmarks[25];
    const leftAnkle = landmarks[27];
    const rightHip = landmarks[24];
    const rightKnee = landmarks[26];
    const rightAnkle = landmarks[28];
    
    // Calculate average hip and knee heights
    const hipY = (leftHip.y + rightHip.y) / 2;
    const kneeY = (leftKnee.y + rightKnee.y) / 2;
    
    // Determine if squatting based on hip-knee distance
    const hipKneeDistance = Math.abs(hipY - kneeY);
    const wasSquatting = gameState.isSquatting;
    
    // Threshold for squatting (smaller distance = squatting)
    gameState.isSquatting = hipKneeDistance < 0.15;
    
    // Update visual feedback
    if (gameState.screen === 'game') {
        if (gameState.isSquatting) {
            monkey.classList.add('squatting');
            poseStatus.textContent = 'Squatting';
            poseStatus.style.background = 'rgba(255, 215, 0, 0.9)';
            poseStatus.style.borderColor = '#FFD700';
            poseStatus.style.color = '#000';
        } else {
            monkey.classList.remove('squatting');
            poseStatus.textContent = 'Standing';
            poseStatus.style.background = 'rgba(26, 77, 46, 0.9)';
            poseStatus.style.borderColor = '#228B22';
            poseStatus.style.color = '#98FB98';
        }
    }
}

// Check if hand is raised above shoulder
function checkHandRaise(landmarks) {
    if (!landmarks) return;
    
    // Prevent multiple triggers
    if (gameState.countdownStarted) return;
    
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    
    const leftHandRaised = leftWrist.y < leftShoulder.y;
    const rightHandRaised = rightWrist.y < rightShoulder.y;
    
    if (leftHandRaised || rightHandRaised) {
        gameState.countdownStarted = true;
        console.log('Hand raised - starting countdown (ONCE)');
        document.getElementById('hand-status').innerHTML = '<span style="color: #90EE90;">✓ Hand Raised! Starting...</span>';
        setTimeout(() => {
            startCountdown();
        }, 500);
    }
}

// Countdown before game starts
function startCountdown() {
    switchScreen('countdown');
    let count = 3;
    const countdownNumber = document.getElementById('countdown-number');
    
    const countInterval = setInterval(() => {
        countdownNumber.textContent = count;
        
        count--;
        
        if (count < 0) {
            clearInterval(countInterval);
            startGame();
        }
    }, 1000);
}

// Start the game
function startGame() {
    console.log('=== STARTING GAME ===');
    
    // CRITICAL: Clear ANY existing interval globally
    if (SPAWN_INTERVAL_ID !== null) {
        console.log('⚠️⚠️⚠️ KILLING EXISTING INTERVAL!');
        clearInterval(SPAWN_INTERVAL_ID);
        SPAWN_INTERVAL_ID = null;
    }
    
    switchScreen('game');
    gameState.gameRunning = true;
    gameState.lives = 3;
    gameState.workDodged = 0;
    gameState.bananasEaten = 0;
    gameState.lastObstacleType = 'banana';
    
    updateScore();
    updateLives();
    
    // Get interval based on speed
    const interval = gameState.speedIntervals[gameState.speed];
    console.log(`Interval set to: ${interval}ms (${gameState.speed} mode)`);
    
    // Spawn first obstacle after 1 second
    setTimeout(() => {
        if (gameState.gameRunning) {
            console.log('→ Spawning FIRST obstacle');
            spawnObstacle();
            
            // Start the repeating interval
            console.log(`→ Starting SINGLE interval (every ${interval}ms)`);
            SPAWN_INTERVAL_ID = setInterval(() => {
                if (gameState.gameRunning) {
                    spawnObstacle();
                } else {
                    console.log('Game stopped, clearing interval');
                    clearInterval(SPAWN_INTERVAL_ID);
                    SPAWN_INTERVAL_ID = null;
                }
            }, interval);
            console.log(`Interval ID: ${SPAWN_INTERVAL_ID}`);
        }
    }, 1000);
}

// Spawn obstacles - SIMPLE VERSION WITH STRICT CONTROL
function spawnObstacle() {
    if (!gameState.gameRunning) {
        console.log('BLOCKED: Game not running');
        return;
    }
    
    // Simple alternation
    const isWork = gameState.lastObstacleType !== 'work';
    gameState.lastObstacleType = isWork ? 'work' : 'banana';
    
    const obstacle = document.createElement('div');
    obstacle.className = 'obstacle ' + (isWork ? 'work' : 'banana');
    
    if (isWork) {
        obstacle.textContent = '💻WORK💻';
    } else {
        obstacle.textContent = '🍌';
    }
    
    // Position higher - above the head
    obstacle.style.bottom = '59%';
    obstacle.style.right = '-200px';
    
    const obstacleSpeed = gameState.speed === 'fast' ? 3 : 
                         gameState.speed === 'medium' ? 4 : 5;
    obstacle.style.animationDuration = `${obstacleSpeed}s`;
    
    obstaclesContainer.appendChild(obstacle);
    
    const obstacleData = {
        element: obstacle,
        type: isWork ? 'work' : 'banana',
        checked: false
    };
    
    gameState.obstacles.push(obstacleData);
    
    console.log(`✓ Spawned ${obstacleData.type} - Total active: ${gameState.obstacles.length}`);
    
    // Check collision and cleanup
    const checkInterval = setInterval(() => {
        if (!obstacle.parentElement) {
            clearInterval(checkInterval);
            return;
        }
        
        const obstacleRect = obstacle.getBoundingClientRect();
        const monkeyRect = monkey.getBoundingClientRect();
        
        // Check collision
        if (obstacleRect.right >= monkeyRect.left && 
            obstacleRect.left <= monkeyRect.right &&
            !obstacleData.checked) {
            obstacleData.checked = true;
            handleCollision(obstacleData);
        }
        
        // Remove if off screen
        if (obstacleRect.right < 0) {
            clearInterval(checkInterval);
            obstacle.remove();
            gameState.obstacles = gameState.obstacles.filter(o => o !== obstacleData);
            console.log(`✗ Removed obstacle - Remaining: ${gameState.obstacles.length}`);
        }
    }, 50);
}

// Handle collision/interaction
function handleCollision(obstacleData) {
    const isSquatting = gameState.isSquatting;
    const isWork = obstacleData.type === 'work';
    
    if (isWork) {
        if (isSquatting) {
            // Successfully dodged work
            gameState.workDodged++;
            showFeedback('WORK DODGED! 💪', 'success');
            updateScore();
        } else {
            // Hit by work
            gameState.lives--;
            showFeedback('HIT BY WORK! 😵', 'danger');
            updateLives();
            
            if (gameState.lives <= 0) {
                gameOver();
            }
        }
    } else {
        // Banana
        if (!isSquatting) {
            // Successfully grabbed banana
            gameState.bananasEaten++;
            showFeedback('BANANA! 🍌😋', 'success');
            updateScore();
        } else {
            // Missed banana
            showFeedback('MISSED BANANA! 😢', 'danger');
        }
    }
}

// Show feedback message
function showFeedback(message, type) {
    feedback.textContent = message;
    feedback.className = 'feedback show ' + type;
    
    setTimeout(() => {
        feedback.classList.remove('show');
    }, 1000);
}

// Update score display
function updateScore() {
    document.getElementById('work-dodged').textContent = gameState.workDodged;
    document.getElementById('bananas-eaten').textContent = gameState.bananasEaten;
}

// Update lives display
function updateLives() {
    const hearts = document.querySelectorAll('.heart');
    hearts.forEach((heart, index) => {
        if (index >= gameState.lives) {
            heart.classList.add('lost');
        } else {
            heart.classList.remove('lost');
        }
    });
}

// Game Over
function gameOver() {
    console.log('=== GAME OVER ===');
    gameState.gameRunning = false;
    
    // Clear spawn interval
    if (SPAWN_INTERVAL_ID !== null) {
        console.log('Clearing spawn interval');
        clearInterval(SPAWN_INTERVAL_ID);
        SPAWN_INTERVAL_ID = null;
    }
    
    // Clear all obstacles
    console.log(`Clearing ${gameState.obstacles.length} obstacles`);
    gameState.obstacles.forEach(o => o.element.remove());
    gameState.obstacles = [];
    
    // Show game over screen
    document.getElementById('final-work').textContent = gameState.workDodged;
    document.getElementById('final-bananas').textContent = gameState.bananasEaten;
    document.getElementById('total-score').textContent = gameState.workDodged + gameState.bananasEaten;
    
    setTimeout(() => {
        switchScreen('gameover');
    }, 1500);
}

// Reset game
function resetGame() {
    console.log('=== RESETTING GAME ===');
    gameState.lives = 3;
    gameState.workDodged = 0;
    gameState.bananasEaten = 0;
    gameState.isSquatting = false;
    gameState.gameRunning = false;
    gameState.bodyDetected = false;
    gameState.detectionFrameCount = 0;
    gameState.lastObstacleType = null;
    gameState.countdownStarted = false;  // Reset flag
    
    // Clear spawn interval
    if (SPAWN_INTERVAL_ID !== null) {
        console.log('Clearing spawn interval on reset');
        clearInterval(SPAWN_INTERVAL_ID);
        SPAWN_INTERVAL_ID = null;
    }
    
    // Clear all obstacles
    console.log(`Clearing ${gameState.obstacles.length} obstacles on reset`);
    gameState.obstacles.forEach(o => o.element.remove());
    gameState.obstacles = [];
    
    updateScore();
    updateLives();
    
    document.getElementById('detection-status').innerHTML = '<span>⏳ Detecting your body...</span>';
    document.getElementById('hand-status').innerHTML = '<span>🙋 RAISE YOUR HAND ABOVE SHOULDER TO START</span>';
}

// Initialize game when page loads
window.addEventListener('load', () => {
    console.log('🎮 Game loaded - Initializing screens');
    
    // Ensure only title screen is visible
    Object.values(screens).forEach(screen => {
        if (screen) {
            screen.classList.remove('active');
            screen.style.display = 'none';
            screen.style.visibility = 'hidden';
            screen.style.opacity = '0';
        }
    });
    
    // Show only title screen
    if (screens.title) {
        screens.title.classList.add('active');
        screens.title.style.display = 'flex';
        screens.title.style.visibility = 'visible';
        screens.title.style.opacity = '1';
    }
    
    // Nuclear option: Clear any potential zombie intervals
    const highestId = setInterval(() => {}, 0);
    for (let i = 0; i < highestId; i++) {
        clearInterval(i);
    }
    clearInterval(highestId);
    
    SPAWN_INTERVAL_ID = null;
    
    console.log('✓ Screens initialized, intervals cleared');
    init();
});