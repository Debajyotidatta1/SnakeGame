const gridSize = 28;
const baseTickMs = 180;
const speedStep = 7;
const minimumTickMs = 95;
const bestScoreKey = "snake-hunts-mouse-best";
const leaderboardKey = "snake-hunts-mouse-leaderboard";
const soundMutedKey = "snake-hunts-mouse-muted";

const board = document.getElementById("board");
const snakeLayer = document.getElementById("snake-layer");
const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("best-score");
const statusEl = document.getElementById("status");
const levelEl = document.getElementById("level");
const speedEl = document.getElementById("speed");
const overlay = document.getElementById("overlay");
const overlayKicker = document.getElementById("overlay-kicker");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const overlayStats = document.getElementById("overlay-stats");
const startButton = document.getElementById("start-button");
const pauseButton = document.getElementById("pause-button");
const restartButton = document.getElementById("restart-button");
const newGameButton = document.getElementById("new-game-button");
const muteButton = document.getElementById("mute-button");
const padButtons = document.querySelectorAll(".pad-button");
const leaderboardList = document.getElementById("leaderboard-list");
const directionMap = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

let snake;
let direction;
let queuedDirection;
let mouse;
let score;
let bestScore = Number(localStorage.getItem(bestScoreKey) || 0);
let leaderboard = loadLeaderboard();
let soundMuted = localStorage.getItem(soundMutedKey) === "true";
let paused = false;
let gameOver = false;
let currentTickMs = baseTickMs;
let touchStartX = 0;
let touchStartY = 0;
let audioContext;
let previousSnake = [];
let pendingDirections = [];
let animationFrameId;
let lastFrameTime = 0;
let accumulatedMs = 0;
let boardMetrics = { cellSize: 0, gap: 0, stride: 0 };
let pendingBestScoreSave = false;
let lastMouseIndex = null;

bestScoreEl.textContent = bestScore;
updateMuteButton();

function createBoard() {
  const cells = [];
  board.style.setProperty("--grid-size", String(gridSize));
  for (let i = 0; i < gridSize * gridSize; i += 1) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.setAttribute("role", "gridcell");
    board.appendChild(cell);
    cells.push(cell);
  }
  return cells;
}

const cells = createBoard();

function updateBoardMetrics() {
  const style = window.getComputedStyle(board);
  const gap = Number.parseFloat(style.columnGap || style.gap || "0");
  const boardWidth = board.clientWidth;
  const cellSize = (boardWidth - gap * (gridSize - 1)) / gridSize;
  boardMetrics = {
    cellSize,
    gap,
    stride: cellSize + gap,
  };
}

updateBoardMetrics();

function cloneSnakeState(state) {
  return state.map((segment) => ({ ...segment }));
}

function cellIndex(position) {
  return position.y * gridSize + position.x;
}

function positionsMatch(a, b) {
  return a.x === b.x && a.y === b.y;
}

function randomEmptyCell() {
  if (snake.length >= gridSize * gridSize) {
    return null;
  }

  while (true) {
    const candidate = {
      x: Math.floor(Math.random() * gridSize),
      y: Math.floor(Math.random() * gridSize),
    };
    if (!snake.some((segment) => positionsMatch(segment, candidate))) {
      return candidate;
    }
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

function currentLevel() {
  return Math.floor(score / 5) + 1;
}

function currentSpeedLabel() {
  const speedPercent = Math.round((baseTickMs / currentTickMs) * 100);
  return `${speedPercent}%`;
}

function render() {
  if (lastMouseIndex !== null && cells[lastMouseIndex]) {
    cells[lastMouseIndex].classList.remove("mouse");
  }
  if (mouse) {
    lastMouseIndex = cellIndex(mouse);
    cells[lastMouseIndex].classList.add("mouse");
  } else {
    lastMouseIndex = null;
  }
  scoreEl.textContent = score;
  bestScoreEl.textContent = bestScore;
  levelEl.textContent = currentLevel();
  speedEl.textContent = currentSpeedLabel();
}

function syncSnakePieces() {
  while (snakeLayer.children.length < snake.length) {
    const piece = document.createElement("div");
    piece.className = "snake-piece";
    snakeLayer.appendChild(piece);
  }

  while (snakeLayer.children.length > snake.length) {
    snakeLayer.lastElementChild.remove();
  }
}

function persistBestScoreSoon() {
  if (pendingBestScoreSave) {
    return;
  }

  pendingBestScoreSave = true;
  const save = () => {
    pendingBestScoreSave = false;
    localStorage.setItem(bestScoreKey, String(bestScore));
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(save, { timeout: 300 });
    return;
  }

  window.setTimeout(save, 0);
}

function renderSnake(progress = 1) {
  if (!snake || snake.length === 0) {
    snakeLayer.innerHTML = "";
    return;
  }

  syncSnakePieces();
  const { cellSize, stride } = boardMetrics;

  snake.forEach((segment, index) => {
    const piece = snakeLayer.children[index];
    const fromSegment = previousSnake[index] || previousSnake[index - 1] || segment;
    const interpolatedX = fromSegment.x + (segment.x - fromSegment.x) * progress;
    const interpolatedY = fromSegment.y + (segment.y - fromSegment.y) * progress;
    const size = index === 0 ? cellSize * 0.96 : cellSize * 0.9;
    const offset = (cellSize - size) / 2;

    piece.className = index === 0 ? "snake-piece head" : "snake-piece";
    piece.style.width = `${size}px`;
    piece.style.height = `${size}px`;
    piece.style.transform = `translate(${interpolatedX * stride + offset}px, ${interpolatedY * stride + offset}px)`;
  });
}

function updateBestScore() {
  if (score > bestScore) {
    bestScore = score;
    persistBestScoreSoon();
  }
}

function loadLeaderboard() {
  try {
    const parsed = JSON.parse(localStorage.getItem(leaderboardKey) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveLeaderboard() {
  localStorage.setItem(leaderboardKey, JSON.stringify(leaderboard.slice(0, 5)));
}

function renderLeaderboard() {
  leaderboardList.innerHTML = "";

  if (leaderboard.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No runs yet. Start the hunt and set the first high score.";
    leaderboardList.appendChild(empty);
    return;
  }

  leaderboard.forEach((entry, index) => {
    const item = document.createElement("li");
    const title = document.createElement("span");
    const meta = document.createElement("span");
    title.textContent = `${index + 1}. ${entry.score} mice`;
    meta.textContent = `Level ${entry.level} • ${entry.date}`;
    meta.className = "entry-meta";
    item.append(title, meta);
    leaderboardList.appendChild(item);
  });
}

function recordLeaderboardEntry() {
  const entry = {
    score,
    level: currentLevel(),
    date: new Date().toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    }),
  };

  leaderboard.push(entry);
  leaderboard.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.level - a.level;
  });
  leaderboard = leaderboard.slice(0, 5);
  saveLeaderboard();
  renderLeaderboard();
}

function showOverlay(kicker, title, text, stats = "") {
  overlayKicker.textContent = kicker;
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayStats.textContent = stats;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function setSpeedForScore() {
  const level = currentLevel();
  currentTickMs = Math.max(minimumTickMs, baseTickMs - (level - 1) * speedStep);
}

function formatRunStats() {
  return `Score ${score} • Level ${currentLevel()} • Best ${bestScore}`;
}

function resetRun() {
  const center = Math.floor(gridSize / 2);
  snake = [
    { x: center, y: center },
    { x: center - 1, y: center },
    { x: center - 2, y: center },
  ];
  direction = { x: 1, y: 0 };
  queuedDirection = direction;
  pendingDirections = [];
  mouse = randomEmptyCell();
  score = 0;
  paused = false;
  gameOver = false;
  currentTickMs = baseTickMs;
  accumulatedMs = 0;
  previousSnake = cloneSnakeState(snake);
  pauseButton.textContent = "Pause";
  setStatus("Hunt started");
  render();
  renderSnake(1);
}

function resetGame() {
  resetRun();
  hideOverlay();
  setSpeedForScore();
}

function openStartScreen() {
  resetRun();
  paused = true;
  pauseButton.textContent = "Resume";
  setStatus("Waiting to start");
  startButton.classList.remove("hidden");
  restartButton.classList.add("hidden");
  showOverlay(
    "Matrix Hunt",
    "Ready to hunt?",
    "Catch mice, survive longer, and every five points the grid gets faster.",
    bestScore ? `Best score ${bestScore} • Top level ${leaderboard[0]?.level || 1}` : "Swipe on mobile or use WASD on desktop."
  );
}

function startGame() {
  resetGame();
  startButton.classList.add("hidden");
  restartButton.classList.add("hidden");
  setStatus("Hunting...");
  playToneSoon(440, 0.04, "square");
}

function isReverse(next) {
  return direction.x + next.x === 0 && direction.y + next.y === 0;
}

function setDirection(next) {
  if (gameOver) {
    return;
  }
  const referenceDirection = pendingDirections[pendingDirections.length - 1] || queuedDirection;
  if (referenceDirection.x + next.x === 0 && referenceDirection.y + next.y === 0) {
    return;
  }
  if (referenceDirection.x === next.x && referenceDirection.y === next.y) {
    return;
  }
  if (pendingDirections.length < 2) {
    pendingDirections.push(next);
  }
  queuedDirection = next;
}

function endGame(reason) {
  gameOver = true;
  paused = false;
  updateBestScore();
  recordLeaderboardEntry();
  render();
  setStatus("Run ended");
  startButton.classList.add("hidden");
  restartButton.classList.remove("hidden");
  showOverlay("Run ended", "The mouse escaped", reason, formatRunStats());
  pauseButton.textContent = "Pause";
  playToneSoon(155, 0.18, "sawtooth");
}

function step() {
  if (paused || gameOver) {
    return;
  }

  previousSnake = cloneSnakeState(snake);

  const nextDirection = pendingDirections.shift();
  if (nextDirection && !isReverse(nextDirection)) {
    direction = nextDirection;
  }
  queuedDirection = direction;
  const head = snake[0];
  const nextHead = { x: head.x + direction.x, y: head.y + direction.y };

  const hitWall =
    nextHead.x < 0 ||
    nextHead.x >= gridSize ||
    nextHead.y < 0 ||
    nextHead.y >= gridSize;

  const hitSelf = snake.some((segment, index) => {
    if (index === snake.length - 1) {
      return false;
    }
    return positionsMatch(segment, nextHead);
  });

  if (hitWall || hitSelf) {
    const reason = hitWall
      ? "You hit the edge of the matrix. Restart and try a new route."
      : "Your snake crossed its own trail. Restart and hunt smarter.";
    endGame(reason);
    return;
  }

  snake.unshift(nextHead);

  if (positionsMatch(nextHead, mouse)) {
    score += 1;
    updateBestScore();
    setSpeedForScore();
    mouse = randomEmptyCell();
    setStatus("Mouse caught");
    playToneSoon(620, 0.05, "triangle");
    if (!mouse) {
      gameOver = true;
      paused = false;
      recordLeaderboardEntry();
      render();
      setStatus("Matrix cleared");
      startButton.classList.add("hidden");
      restartButton.classList.remove("hidden");
      showOverlay("Perfect run", "Every mouse is caught", "You filled the whole grid and won the hunt.", formatRunStats());
      playToneSoon(880, 0.12, "triangle");
      return;
    }
  } else {
    snake.pop();
    setStatus("Hunting...");
  }

  render();
}

function togglePause() {
  if (gameOver) {
    return;
  }
  paused = !paused;
  pauseButton.textContent = paused ? "Resume" : "Pause";
  setStatus(paused ? "Paused" : "Hunting...");
}

function ensureAudioContext() {
  if (audioContext || soundMuted) {
    return audioContext;
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    return null;
  }

  audioContext = new AudioCtx();
  return audioContext;
}

function playTone(frequency, duration, type) {
  if (soundMuted) {
    return;
  }

  const context = ensureAudioContext();
  if (!context) {
    return;
  }

  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gainNode.gain.setValueAtTime(0.0001, now);
  gainNode.gain.exponentialRampToValueAtTime(0.04, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playToneSoon(frequency, duration, type) {
  window.setTimeout(() => {
    playTone(frequency, duration, type);
  }, 0);
}

function updateMuteButton() {
  muteButton.textContent = soundMuted ? "Sound Off" : "Sound On";
}

function toggleSound() {
  soundMuted = !soundMuted;
  localStorage.setItem(soundMutedKey, String(soundMuted));
  updateMuteButton();
  if (!soundMuted) {
    playToneSoon(520, 0.05, "triangle");
  }
}

function handleKeydown(event) {
  const keyMap = {
    ArrowUp: directionMap.up,
    w: directionMap.up,
    W: directionMap.up,
    ArrowDown: directionMap.down,
    s: directionMap.down,
    S: directionMap.down,
    ArrowLeft: directionMap.left,
    a: directionMap.left,
    A: directionMap.left,
    ArrowRight: directionMap.right,
    d: directionMap.right,
    D: directionMap.right,
  };

  const next = keyMap[event.key];
  if (next) {
    event.preventDefault();
    setDirection(next);
    return;
  }

  if (event.key === " ") {
    event.preventDefault();
    togglePause();
  }
}

function handleTouchStart(event) {
  const touch = event.touches[0];
  if (!touch) {
    return;
  }
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}

function handleTouchMove(event) {
  event.preventDefault();
}

function handleTouchEnd(event) {
  const touch = event.changedTouches[0];
  if (!touch) {
    return;
  }

  const deltaX = touch.clientX - touchStartX;
  const deltaY = touch.clientY - touchStartY;
  const threshold = 18;

  if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) {
    return;
  }

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    setDirection(deltaX > 0 ? directionMap.right : directionMap.left);
    return;
  }

  setDirection(deltaY > 0 ? directionMap.down : directionMap.up);
}

function setupEvents() {
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("resize", updateBoardMetrics);
  pauseButton.addEventListener("click", togglePause);
  restartButton.addEventListener("click", resetGame);
  newGameButton.addEventListener("click", resetGame);
  startButton.addEventListener("click", startGame);
  muteButton.addEventListener("click", toggleSound);
  board.addEventListener("touchstart", handleTouchStart, { passive: true });
  board.addEventListener("touchmove", handleTouchMove, { passive: false });
  board.addEventListener("touchend", handleTouchEnd);

  padButtons.forEach((button) => {
    const handlePress = (event) => {
      event.preventDefault();
      const { direction: dir } = button.dataset;
      setDirection(directionMap[dir]);
    };

    button.addEventListener("click", handlePress);
    button.addEventListener("pointerdown", handlePress);
  });
}

function animationLoop(timestamp) {
  if (!lastFrameTime) {
    lastFrameTime = timestamp;
  }

  let delta = timestamp - lastFrameTime;
  lastFrameTime = timestamp;
  delta = Math.min(delta, 34);

  if (!paused && !gameOver) {
    accumulatedMs += delta;
    while (accumulatedMs >= currentTickMs) {
      accumulatedMs -= currentTickMs;
      step();
    }
  }

  const progress = paused || gameOver ? 1 : Math.min(accumulatedMs / currentTickMs, 1);
  renderSnake(progress);
  animationFrameId = window.requestAnimationFrame(animationLoop);
}

function startLoop() {
  if (animationFrameId) {
    window.cancelAnimationFrame(animationFrameId);
  }
  lastFrameTime = 0;
  animationFrameId = window.requestAnimationFrame(animationLoop);
}

renderLeaderboard();
setupEvents();
openStartScreen();
startLoop();
