const gridSize = 18;
const tickMs = 150;
const bestScoreKey = "snake-hunts-mouse-best";

const board = document.getElementById("board");
const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("best-score");
const statusEl = document.getElementById("status");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const pauseButton = document.getElementById("pause-button");
const restartButton = document.getElementById("restart-button");
const newGameButton = document.getElementById("new-game-button");
const padButtons = document.querySelectorAll(".pad-button");
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
let paused = false;
let gameOver = false;
let tickTimer;
let touchStartX = 0;
let touchStartY = 0;

bestScoreEl.textContent = bestScore;

function createBoard() {
  const cells = [];
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

function render() {
  for (const cell of cells) {
    cell.className = "cell";
  }

  snake.forEach((segment, index) => {
    const className = index === 0 ? "cell snake snake-head" : "cell snake";
    cells[cellIndex(segment)].className = className;
  });

  if (mouse) {
    cells[cellIndex(mouse)].classList.add("mouse");
  }
  scoreEl.textContent = score;
  bestScoreEl.textContent = bestScore;
}

function updateBestScore() {
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem(bestScoreKey, String(bestScore));
  }
}

function showOverlay(title, text) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function resetGame() {
  snake = [
    { x: 8, y: 9 },
    { x: 7, y: 9 },
    { x: 6, y: 9 },
  ];
  direction = { x: 1, y: 0 };
  queuedDirection = direction;
  mouse = randomEmptyCell();
  score = 0;
  paused = false;
  gameOver = false;
  pauseButton.textContent = "Pause";
  hideOverlay();
  setStatus("Hunt started");
  render();
}

function isReverse(next) {
  return direction.x + next.x === 0 && direction.y + next.y === 0;
}

function setDirection(next) {
  if (gameOver) {
    return;
  }
  if (isReverse(next)) {
    return;
  }
  queuedDirection = next;
}

function endGame(reason) {
  gameOver = true;
  paused = false;
  updateBestScore();
  render();
  setStatus("Run ended");
  showOverlay("The mouse escaped", reason);
  pauseButton.textContent = "Pause";
}

function step() {
  if (paused || gameOver) {
    return;
  }

  direction = queuedDirection;
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
    mouse = randomEmptyCell();
    setStatus("Mouse caught");
    if (!mouse) {
      gameOver = true;
      paused = false;
      render();
      setStatus("Matrix cleared");
      showOverlay("Every mouse is caught", "You filled the whole grid and won the hunt.");
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
  pauseButton.addEventListener("click", togglePause);
  restartButton.addEventListener("click", resetGame);
  newGameButton.addEventListener("click", resetGame);
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

function startLoop() {
  clearInterval(tickTimer);
  tickTimer = window.setInterval(step, tickMs);
}

setupEvents();
resetGame();
startLoop();
