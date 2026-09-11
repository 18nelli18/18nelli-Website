const GRID_SIZE = 90;
let grid = new Map();
let cellElements = [];
let intervalId = null;
let isRunning = false;
let selectedShip = null;
let previewCells = [];
let isMouseDown = false;
document.body.addEventListener('mousedown', () => { isMouseDown = true; });
document.body.addEventListener('mouseup',   () => { isMouseDown = false; });

const ships = {
  theAnts: [
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 1],
  ],
  lwss: [
    [0, 1, 0, 0, 1],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 0],
  ],
  hwss: [
    [0, 0, 1, 1, 0, 0, 0],
    [1, 0, 0, 0, 0, 1, 0],
    [0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [0, 1, 1, 1, 1, 1, 1],
  ],
};

function createGrid() {
  const gridContainer = document.getElementById("grid-container");
  for (let row = 0; row < GRID_SIZE; row++) {
    cellElements[row] = [];
    for (let col = 0; col < GRID_SIZE; col++) {
      const cell = document.createElement("div");
      const cellValue = grid.get(`${row}:${col}`) || 0;

      if (cellValue === 1) {
        cell.classList.add("cell-full");
      } else {
        cell.classList.add("cell-empty");
      }
      cell.addEventListener("mouseover", function () {
        clearPreview();
        if (selectedShip) {
          previewShip(row, col, selectedShip);
        } else {
          previewSimple(row, col);
        }
      
        if (isMouseDown) {
          // while dragging, actually place:
          if (selectedShip) {
            placeShip(row, col, selectedShip);
          } else {
            // simple draw: turn on the cell
            grid.set(`${row}:${col}`, 1);
            cell.classList.add("cell-full");
            cell.classList.remove("cell-empty");
          }
        }
      });
      

      cell.addEventListener("click", function () {
        if (selectedShip) {
          placeShip(row, col, selectedShip);
        } else {
          if (grid.get(`${row}:${col}`) === 1) {
            grid.set(`${row}:${col}`, 0);
            cell.classList.remove("cell-full");
            cell.classList.add("cell-empty");
          } else {
            grid.set(`${row}:${col}`, 1);
            cell.classList.remove("cell-empty");
            cell.classList.add("cell-full");
          }
        }
      });

      cellElements[row][col] = cell;
      gridContainer.appendChild(cell);
    }
  }
}

function placeShip(row, col, ship) {
  const shipRows = ship.length;
  const shipCols = ship[0].length;

  for (let i = 0; i < shipRows; i++) {
    for (let j = 0; j < shipCols; j++) {
      const newRow = row - (shipRows - 1 - i);
      const newCol = col - (shipCols - 1 - j);
      if (
        newRow >= 0 &&
        newCol >= 0 &&
        newRow < GRID_SIZE &&
        newCol < GRID_SIZE
      ) {
        grid.set(`${newRow}:${newCol}`, ship[i][j]);
      }
    }
  }

  updateGrid();
}

function updateGrid() {
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const cellValue = grid.get(`${row}:${col}`) || 0;

      if (cellValue === 1) {
        cellElements[row][col].classList.add("cell-full");
        cellElements[row][col].classList.remove("cell-empty");
      } else {
        cellElements[row][col].classList.add("cell-empty");
        cellElements[row][col].classList.remove("cell-full");
      }
    }
  }
}

function update() {
  let newGrid = new Map();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const cellValue = grid.get(`${row}:${col}`) || 0;
      const livingNeighbors = getLivingNeighbors(row, col);

      if (cellValue === 1) {
        if (livingNeighbors === 2 || livingNeighbors === 3) {
          newGrid.set(`${row}:${col}`, 1);
        } else {
          newGrid.set(`${row}:${col}`, 0);
        }
      } else {
        if (livingNeighbors === 3) {
          newGrid.set(`${row}:${col}`, 1);
        } else {
          newGrid.set(`${row}:${col}`, 0);
        }
      }
    }
  }

  grid = newGrid;
  updateGrid();
}

function getLivingNeighbors(row, col) {
  let neighbors = 0;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      if (i === 0 && j === 0) continue;
      const neighbor = grid.get(`${row + i}:${col + j}`) || 0;
      neighbors += neighbor;
    }
  }
  return neighbors;
}

function startSimulation() {
  if (!isRunning) {
    intervalId = setInterval(update, 100);
    isRunning = true;
  }
}

function pauseSimulation() {
  clearInterval(intervalId);
  isRunning = false;
}

function nextFrame() {
  update();
}

function previewSimple(row, col) {
  const cell = cellElements[row][col];
  if (grid.get(`${row}:${col}`) === 1) {
    cell.classList.add("cell-preview", "cell-empty");
    cell.classList.remove("cell-full");
  } else {
    cell.classList.add("cell-preview", "cell-full");
    cell.classList.remove("cell-empty");
  }
  previewCells.push({ row, col });
}

function previewShip(row, col, ship) {
  const shipRows = ship.length;
  const shipCols = ship[0].length;

  for (let i = 0; i < shipRows; i++) {
    for (let j = 0; j < shipCols; j++) {
      const newRow = row - (shipRows - 1 - i);
      const newCol = col - (shipCols - 1 - j);
      if (
        newRow >= 0 &&
        newCol >= 0 &&
        newRow < GRID_SIZE &&
        newCol < GRID_SIZE
      ) {
        const cell = cellElements[newRow][newCol];
        if (ship[i][j] === 1) {
          cell.classList.add("cell-preview", "cell-full");
          cell.classList.remove("cell-empty");
        } else {
          cell.classList.add("cell-preview", "cell-empty");
          cell.classList.remove("cell-full");
        }
        previewCells.push({ row: newRow, col: newCol });
      }
    }
  }
}

function clearPreview() {
  previewCells.forEach(({ row, col }) => {
    const cell = cellElements[row][col];
    cell.classList.remove("cell-preview");
    if (grid.get(`${row}:${col}`) === 1) {
      cell.classList.add("cell-full");
      cell.classList.remove("cell-empty");
    } else {
      cell.classList.add("cell-empty");
      cell.classList.remove("cell-full");
    }
  });
  previewCells = [];
}

document.getElementById("simple-btn").addEventListener("click", () => {
  selectedShip = null;
});
document.getElementById("the-ants-btn").addEventListener("click", () => {
  selectedShip = ships.theAnts;
});
document.getElementById("lwss-btn").addEventListener("click", () => {
  selectedShip = ships.lwss;
});
document.getElementById("hwss-btn").addEventListener("click", () => {
  selectedShip = ships.hwss;
});

document.getElementById("start-btn").addEventListener("click", startSimulation);
document.getElementById("pause-btn").addEventListener("click", pauseSimulation);
document.getElementById("next-frame-btn").addEventListener("click", nextFrame);

createGrid();

document.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    if (isRunning) {
      pauseSimulation();
    } else {
      startSimulation();
    }
  }
});
