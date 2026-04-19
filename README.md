# 🐵 Monkey Squat Runner - Interactive Fitness Game

An engaging motion-controlled fitness game that uses your webcam and AI pose detection to make squatting fun!

## 🎮 Game Features

### Core Gameplay
- **Motion Detection**: Real-time squat detection using MediaPipe Pose AI
- **Hand Skeleton Visualization**: See your hand movements with cyan skeleton overlay
- **Monkey Character**: Adorable animated monkey that mirrors your squats
- **Obstacle Dodging**: White bars approach - squat to dodge them!
- **Banana Collection**: Stand up to collect bananas for bonus points
- **Lives System**: 3 hearts - lose them all and it's game over
- **Score Tracking**: Earn points by dodging (+1) and collecting bananas (+2)

### Visual Features
- **How to Play Tutorial**: Interactive popup with 3 animated instruction boxes
- **Smooth Animations**: Monkey squatting, standing, and banana floating animations
- **Glow Effects**: Obstacles glow green (success) or red (fail)
- **Cartoonish Design**: Fun, colorful monkey with eyes, hands, and belly
- **Professional UI**: Large, visible score counter and hearts on left side
- **Game Over Screen**: 2-second popup showing final score before reset

### Technical Features
- **Robust Squat Detection**: 
  - 4-condition validation system
  - Frame smoothing (3 consecutive frames required)
  - Prevents false positives from leaning or partial movements
  
- **Responsive Timing**:
  - 150px obstacle width (~0.5 second hold)
  - 5.2 second rest between obstacles
  - Bananas spawn 2.5 seconds after each obstacle

## 🎯 How to Play

### Setup
1. Open `index.html` in a modern web browser (Chrome/Edge recommended)
2. Allow camera access when prompted
3. Position yourself so your entire body is visible in frame
4. Read the "How to Play" tutorial
5. Click "START GAME!"

### Controls
1. **Start Game**: Raise your arm above shoulder level
2. **Dodge Obstacles**: Squat down when white bars approach your head
3. **Collect Bananas**: Stand up when bananas float by
4. **Survive**: Keep your 3 hearts by dodging all obstacles

### Scoring
- Dodge white obstacle: **+1 point** (obstacle turns green)
- Collect banana: **+2 points** (banana disappears)
- Get hit by obstacle: **-1 heart** (obstacle turns red)
- Lose all 3 hearts: **Game Over**

## 🛠️ Technical Requirements

### Browser Compatibility
- Chrome 90+ (recommended)
- Edge 90+
- Firefox 88+
- Safari 14+

### Hardware
- Webcam (720p or better recommended)
- Modern CPU (for real-time AI processing)
- Minimum 4GB RAM

## 📁 File Structure

```
squat-jump-runner/
├── index.html          # Main HTML structure
├── styles.css          # All styling and animations
├── game.js            # Game logic and AI detection
└── README.md          # This file
```

## 🎨 Customization

### Difficulty (game.js)
```javascript
OBSTACLE_SPEED = 5;      // Increase for harder
OBSTACLE_GAP = 5200;     // Decrease for more frequent
OBSTACLE_WIDTH = 150;    # Increase for longer hold
```

## 🐛 Troubleshooting

**Camera Not Working**: Check browser permissions
**Squat Not Detecting**: Ensure full body visible, squat deeper
**Character Squatting Alone**: Stand fully upright, better lighting
**Game Laggy**: Close other tabs, use Chrome

## 🎉 Enjoy!

Get fit, have fun, beat your high score! 🐵🍌💪