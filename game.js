<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <title>Monkey Squat Runner - Fitness Game</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🍌</text></svg>">
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div id="game-container">
        <video id="video" autoplay playsinline></video>
        <canvas id="pose-canvas"></canvas>
        <canvas id="obstacle-canvas"></canvas>
        
        <div class="ui-overlay">
            <div class="stats-container">
                <div class="lives-container">
                    <span class="heart" id="heart1">❤️</span>
                    <span class="heart" id="heart2">❤️</span>
                    <span class="heart" id="heart3">❤️</span>
                </div>
                
                <div class="squat-counter">
                    <div class="counter-label">Score</div>
                    <div class="counter-value" id="squat-count">0</div>
                    <div class="sub-counters">
                        <div class="sub-counter">
                            <span>⬇️</span>
                            <span class="sub-counter-value" id="obstacle-count">0</span>
                        </div>
                        <div class="sub-counter">
                            <span>🍌</span>
                            <span class="sub-counter-value" id="banana-count">0</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="obstacles-counter">
                <div class="counter-label">Obstacles</div>
                <div class="counter-value" id="obstacle-count-hidden">0</div>
            </div>
            
            <div class="bananas-counter">
                <div class="counter-label">Bananas</div>
                <div class="counter-value" id="banana-count-hidden">0</div>
            </div>
            
            <div class="message-center" id="message-center">
                <div class="big-message" id="big-message">Fit your entire body in the frame</div>
                <div class="sub-message" id="sub-message">Then raise your arm to start</div>
            </div>
            
            <div class="game-over-popup" id="game-over-popup">
                <div class="game-over-container">
                    <div class="game-over-title">Game Over!</div>
                    <div class="work-killed-message">You were killed by WORK! 💼💻</div>
                    <div class="game-over-stats">
                        <div class="final-score-display" id="final-score">0</div>
                        <div class="final-breakdown">
                            <div class="breakdown-item">
                                <span>⬇️</span>
                                <span id="final-obstacles">0</span>
                            </div>
                            <div class="breakdown-item">
                                <span>🍌</span>
                                <span id="final-bananas">0</span>
                            </div>
                        </div>
                    </div>
                    <button class="restart-button" id="restart-btn">PLAY AGAIN!</button>
                </div>
            </div>
            
            <div class="how-to-play-modal" id="how-to-play">
                <div class="how-to-play-container">
                    <div class="how-to-play-title">How to Play</div>
                    
                    <div class="instruction-boxes">
                        <div class="instruction-box">
                            <div class="instruction-icon">
                                <div class="demo-monkey squat-demo">
                                    <div class="demo-head"></div>
                                    <div class="demo-body"></div>
                                </div>
                                <div class="demo-laptop"></div>
                            </div>
                            <div class="instruction-title">Squat to Dodge!</div>
                            <div class="instruction-text">Flying laptops = work stress! Squat down to dodge 💼</div>
                        </div>
                        
                        <div class="instruction-box">
                            <div class="instruction-icon">
                                <div class="demo-monkey stand-demo">
                                    <div class="demo-head"></div>
                                    <div class="demo-body"></div>
                                </div>
                                <div class="demo-banana">🍌</div>
                            </div>
                            <div class="instruction-title">Collect Bananas!</div>
                            <div class="instruction-text">Stand up to grab bananas for bonus points</div>
                        </div>
                        
                        <div class="instruction-box">
                            <div class="instruction-icon">
                                <div class="demo-score">
                                    <div class="demo-hearts">❤️❤️❤️</div>
                                    <div class="demo-number">25</div>
                                </div>
                            </div>
                            <div class="instruction-title">Score High!</div>
                            <div class="instruction-text">Dodge obstacles (+1) and collect bananas (+2)</div>
                        </div>
                    </div>
                    
                    <button class="start-button" id="start-game-btn">START GAME!</button>
                </div>
            </div>
        </div>

        <div class="player-character" id="player">
            <div class="player-head">
                <div class="monkey-eyes">👀</div>
                <div class="monkey-face"></div>
            </div>
            <div class="player-body">
                <div class="monkey-hand-left">🤚</div>
                <div class="monkey-hand-right">🤚</div>
            </div>
            <div class="player-shorts" id="shorts">
                <div class="short-left"></div>
                <div class="short-right"></div>
            </div>
        </div>
    </div>

    <!-- MediaPipe Dependencies -->
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"></script>
    
    <!-- Game Script -->
    <script src="game.js"></script>
</body>
</html>