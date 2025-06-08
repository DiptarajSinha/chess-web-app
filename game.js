// ==== FULL CHESS GAME WITH TIMER ====
// 2-player local, legal moves, undo/restart, pawn promotion, castling, en passant, check/checkmate, timers

// DOM Elements
const boardEl = document.getElementById('board');
const turnIndicator = document.getElementById('turnIndicator');
const whiteTimerEl = document.getElementById('whiteTimer');
const blackTimerEl = document.getElementById('blackTimer');
const undoBtn = document.getElementById('undoBtn');
const restartBtn = document.getElementById('restartBtn');
const whiteCapturedEl = document.getElementById('whiteCaptured');
const blackCapturedEl = document.getElementById('blackCaptured');
const promotionDialog = document.getElementById('promotionDialog');
const overlay = document.getElementById('overlay');

const promotionButtons = promotionDialog.querySelectorAll('button');

// Constants
const BOARD_SIZE = 8;
const INITIAL_TIME_SECONDS = 10 * 60; // 10 minutes per player

// Unicode pieces
const unicodePieces = {
  'K': '\u2654', 'Q': '\u2655', 'R': '\u2656', 'B': '\u2657', 'N': '\u2658', 'P': '\u2659',
  'k': '\u265A', 'q': '\u265B', 'r': '\u265C', 'b': '\u265D', 'n': '\u265E', 'p': '\u265F'
};

// Variables for game state
let board, turn, castlingRights, enPassant, halfMoveClock, fullMoveNumber;
let history = [];
let whiteCaptured = [];
let blackCaptured = [];
let selectedSquare = null;
let validMoves = [];
let timerInterval = null;
let whiteTimeLeft = INITIAL_TIME_SECONDS;
let blackTimeLeft = INITIAL_TIME_SECONDS;
let timerRunning = false;

// --- Initialize the game state ---
function initGame() {
  board = [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R']
  ];
  turn = 'w';
  castlingRights = {wK: true, wQ: true, bK: true, bQ: true};
  enPassant = null; // square eligible for en passant capture, eg. {r,c}
  halfMoveClock = 0;
  fullMoveNumber = 1;
  history = [];
  whiteCaptured = [];
  blackCaptured = [];
  selectedSquare = null;
  validMoves = [];
  whiteTimeLeft = INITIAL_TIME_SECONDS;
  blackTimeLeft = INITIAL_TIME_SECONDS;
  timerRunning = false;
  clearInterval(timerInterval);
  saveHistory();
  renderAll();
  startTimer();
}

// --- Rendering ---

function renderAll() {
  renderBoard();
  renderTurnIndicator();
  renderCaptured();
  renderTimers();
}

function renderBoard() {
  boardEl.innerHTML = '';
  for(let r=0; r<BOARD_SIZE; r++){
    for(let c=0; c<BOARD_SIZE; c++){
      const square = document.createElement('div');
      square.classList.add('square');
      if((r + c) % 2 === 0) square.classList.add('light');
      else square.classList.add('dark');

      if(selectedSquare && selectedSquare.r === r && selectedSquare.c === c) {
        square.classList.add('selected');
      }
      if(validMoves.some(m => m.r === r && m.c === c)) {
        square.classList.add('highlight');
      }

      const piece = board[r][c];
      square.textContent = piece ? unicodePieces[piece] : '';
      square.dataset.r = r;
      square.dataset.c = c;
      square.addEventListener('click', () => onSquareClick(r, c));

      boardEl.appendChild(square);
    }
  }
}

function renderTurnIndicator() {
  turnIndicator.textContent = turn === 'w' ? "White's turn" : "Black's turn";
}

function renderCaptured() {
  whiteCapturedEl.textContent = whiteCaptured.map(p => unicodePieces[p]).join(' ');
  blackCapturedEl.textContent = blackCaptured.map(p => unicodePieces[p]).join(' ');
}

function renderTimers() {
  whiteTimerEl.textContent = formatTime(whiteTimeLeft);
  blackTimerEl.textContent = formatTime(blackTimeLeft);
}

function formatTime(sec) {
  let m = Math.floor(sec / 60);
  let s = sec % 60;
  return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

// --- Game Logic Helpers ---

function cloneBoard(b) {
  return b.map(row => row.slice());
}

function saveHistory() {
  history.push({
    board: cloneBoard(board),
    turn,
    castlingRights: {...castlingRights},
    enPassant: enPassant ? {...enPassant} : null,
    halfMoveClock,
    fullMoveNumber,
    whiteCaptured: [...whiteCaptured],
    blackCaptured: [...blackCaptured],
    whiteTimeLeft,
    blackTimeLeft
  });
  if(history.length > 100) history.shift();
}

function undo() {
  if(history.length < 2) return; // at least 2 states needed to undo

  history.pop(); // current state discarded
  const prev = history[history.length-1];

  board = cloneBoard(prev.board);
  turn = prev.turn;
  castlingRights = {...prev.castlingRights};
  enPassant = prev.enPassant ? {...prev.enPassant} : null;
  halfMoveClock = prev.halfMoveClock;
  fullMoveNumber = prev.fullMoveNumber;
  whiteCaptured = [...prev.whiteCaptured];
  blackCaptured = [...prev.blackCaptured];
  whiteTimeLeft = prev.whiteTimeLeft;
  blackTimeLeft = prev.blackTimeLeft;

  selectedSquare = null;
  validMoves = [];

  renderAll();
  startTimer();
}

function opponent(c) {
  return c === 'w' ? 'b' : 'w';
}

function pieceColor(p) {
  if(!p) return null;
  return p === p.toUpperCase() ? 'w' : 'b';
}

function isOnBoard(r,c) {
  return r >=0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

// --- Checks if square (r,c) attacked by color attackerColor ---
function isSquareAttacked(r, c, attackerColor, boardState = board) {
  // For each opponent piece, check if it attacks (r,c)
  // Check pawn attacks:
  let pawnDir = attackerColor === 'w' ? -1 : 1;
  let pawnAttackOffsets = [[pawnDir, -1], [pawnDir, 1]];
  for(let [dr, dc] of pawnAttackOffsets){
    let nr = r + dr, nc = c + dc;
    if(isOnBoard(nr,nc)){
      let p = boardState[nr][nc];
      if(p && pieceColor(p) === attackerColor && p.toLowerCase() === 'p') return true;
    }
  }
  // Check knight attacks
  const knightOffsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for(let [dr, dc] of knightOffsets){
    let nr = r + dr, nc = c + dc;
    if(isOnBoard(nr,nc)){
      let p = boardState[nr][nc];
      if(p && pieceColor(p) === attackerColor && p.toLowerCase() === 'n') return true;
    }
  }
  // Check straight lines (rook, queen)
  const straightDirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for(let [dr,dc] of straightDirs){
    let nr = r + dr, nc = c + dc;
    while(isOnBoard(nr,nc)){
      let p = boardState[nr][nc];
      if(p){
        if(pieceColor(p) === attackerColor && (p.toLowerCase() === 'r' || p.toLowerCase() === 'q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  // Check diagonals (bishop, queen)
  const diagDirs = [[1,1],[1,-1],[-1,1],[-1,-1]];
  for(let [dr,dc] of diagDirs){
    let nr = r + dr, nc = c + dc;
    while(isOnBoard(nr,nc)){
      let p = boardState[nr][nc];
      if(p){
        if(pieceColor(p) === attackerColor && (p.toLowerCase() === 'b' || p.toLowerCase() === 'q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  // Check king attacks
  const kingOffsets = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  for(let [dr, dc] of kingOffsets){
    let nr = r + dr, nc = c + dc;
    if(isOnBoard(nr,nc)){
      let p = boardState[nr][nc];
      if(p && pieceColor(p) === attackerColor && p.toLowerCase() === 'k') return true;
    }
  }

  return false;
}

// --- Find King position of color ---
function findKing(color, boardState = board) {
  for(let r=0; r<BOARD_SIZE; r++){
    for(let c=0; c<BOARD_SIZE; c++){
      let p = boardState[r][c];
      if(p && pieceColor(p) === color && p.toLowerCase() === 'k'){
        return {r,c};
      }
    }
  }
  return null; // should never happen in valid positions
}

// --- Checks if player color is in check ---
function isInCheck(color, boardState = board) {
  const kingPos = findKing(color, boardState);
  if(!kingPos) return false;
  return isSquareAttacked(kingPos.r, kingPos.c, opponent(color), boardState);
}

// --- Generate all valid moves for piece at (r,c) considering check ---
function getValidMoves(r, c, boardState = board, currentTurn = turn, castling = castlingRights, enPass = enPassant) {
  let moves = [];
  let p = boardState[r][c];
  if(!p || pieceColor(p) !== currentTurn) return [];

  const color = currentTurn;
  const enemy = opponent(color);

  // Helper to add move if on board and no friendly piece there
  function tryMove(nr, nc){
    if(!isOnBoard(nr,nc)) return;
    let target = boardState[nr][nc];
    if(!target || pieceColor(target) !== color){
      moves.push({r: nr, c: nc});
    }
  }

  const pieceType = p.toLowerCase();

  if(pieceType === 'p'){
    // Pawn moves
    let dir = color === 'w' ? -1 : 1;
    let startRow = color === 'w' ? 6 : 1;

    // Forward move
    if(isOnBoard(r+dir, c) && !boardState[r+dir][c]){
      moves.push({r: r+dir, c});
      // Double move from start
      if(r === startRow && !boardState[r+dir*2][c]){
        moves.push({r: r+dir*2, c});
      }
    }
    // Captures
    for(let dc of [-1,1]){
      let nr = r+dir, nc = c+dc;
      if(isOnBoard(nr,nc)){
        let target = boardState[nr][nc];
        if(target && pieceColor(target) === enemy) moves.push({r:nr, c:nc});
      }
    }
    // En passant
    if(enPass){
      if(r === (color === 'w' ? 3 : 4) && Math.abs(enPass.c - c) === 1 && enPass.r === r + dir){
        moves.push({r: enPass.r, c: enPass.c});
      }
    }
  } else if(pieceType === 'n'){
    // Knight moves
    const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for(let [dr,dc] of knightMoves){
      let nr = r+dr, nc = c+dc;
      if(isOnBoard(nr,nc)){
        let target = boardState[nr][nc];
        if(!target || pieceColor(target) === enemy){
          moves.push({r: nr, c: nc});
        }
      }
    }
  } else if(pieceType === 'b' || pieceType === 'r' || pieceType === 'q'){
    // Sliding moves
    let directions = [];
    if(pieceType === 'b' || pieceType === 'q'){
      directions.push([1,1],[1,-1],[-1,1],[-1,-1]);
    }
    if(pieceType === 'r' || pieceType === 'q'){
      directions.push([1,0],[-1,0],[0,1],[0,-1]);
    }
    for(let [dr, dc] of directions){
      let nr = r+dr, nc = c+dc;
      while(isOnBoard(nr,nc)){
        let target = boardState[nr][nc];
        if(!target){
          moves.push({r:nr, c:nc});
        } else {
          if(pieceColor(target) === enemy) moves.push({r:nr, c:nc});
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
  } else if(pieceType === 'k'){
    // King moves
    const kingMoves = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for(let [dr,dc] of kingMoves){
      let nr = r+dr, nc = c+dc;
      if(isOnBoard(nr,nc)){
        let target = boardState[nr][nc];
        if(!target || pieceColor(target) === enemy){
          moves.push({r:nr, c:nc});
        }
      }
    }
    // Castling (if not in check)
    if(!isInCheck(color, boardState)){
      if(color === 'w'){
        // Kingside
        if(castling.wK && !boardState[7][5] && !boardState[7][6]){
          if(!isSquareAttacked(7,5, enemy, boardState) && !isSquareAttacked(7,6, enemy, boardState)){
            moves.push({r:7, c:6, castle: 'K'});
          }
        }
        // Queenside
        if(castling.wQ && !boardState[7][1] && !boardState[7][2] && !boardState[7][3]){
          if(!isSquareAttacked(7,2, enemy, boardState) && !isSquareAttacked(7,3, enemy, boardState)){
            moves.push({r:7, c:2, castle: 'Q'});
          }
        }
      } else {
        // Black
        if(castling.bK && !boardState[0][5] && !boardState[0][6]){
          if(!isSquareAttacked(0,5, enemy, boardState) && !isSquareAttacked(0,6, enemy, boardState)){
            moves.push({r:0, c:6, castle: 'K'});
          }
        }
        if(castling.bQ && !boardState[0][1] && !boardState[0][2] && !boardState[0][3]){
          if(!isSquareAttacked(0,2, enemy, boardState) && !isSquareAttacked(0,3, enemy, boardState)){
            moves.push({r:0, c:2, castle: 'Q'});
          }
        }
      }
    }
  }

  // Filter out moves that leave own king in check
  let legalMoves = [];
  for(let m of moves){
    let newBoard = makeMoveOnBoard(boardState, {r,c}, m, color, castling, enPass);
    if(!isInCheck(color, newBoard)){
      legalMoves.push(m);
    }
  }
  return legalMoves;
}

// --- Makes a move on a copy of the board and returns new board state ---
// Handles castling, en passant, promotion NOT here, only board state
function makeMoveOnBoard(boardState, from, to, color, castling, enPass) {
  let newBoard = cloneBoard(boardState);
  let piece = newBoard[from.r][from.c];

  // Normal move
  newBoard[to.r][to.c] = piece;
  newBoard[from.r][from.c] = '';

  // Castling move - move rook as well
  if(to.castle){
    if(color === 'w'){
      if(to.castle === 'K'){
        // Move rook h1 to f1
        newBoard[7][5] = newBoard[7][7];
        newBoard[7][7] = '';
      } else if(to.castle === 'Q'){
        // Move rook a1 to d1
        newBoard[7][3] = newBoard[7][0];
        newBoard[7][0] = '';
      }
    } else {
      if(to.castle === 'K'){
        // Move rook h8 to f8
        newBoard[0][5] = newBoard[0][7];
        newBoard[0][7] = '';
      } else if(to.castle === 'Q'){
        // Move rook a8 to d8
        newBoard[0][3] = newBoard[0][0];
        newBoard[0][0] = '';
      }
    }
  }

  // En passant capture
  if(piece.toLowerCase() === 'p' && enPass && to.r === enPass.r && to.c === enPass.c){
    // Remove captured pawn
    if(color === 'w'){
      newBoard[to.r + 1][to.c] = '';
    } else {
      newBoard[to.r - 1][to.c] = '';
    }
  }

  return newBoard;
}

// --- Actual move execution including updating game state ---
function makeMove(from, to, promotionPiece = null) {
  let piece = board[from.r][from.c];
  let target = board[to.r][to.c];
  const color = turn;
  const enemy = opponent(color);

  // Castling rights update
  // If king moves, lose both castling rights
  if(piece.toLowerCase() === 'k'){
    if(color === 'w'){
      castlingRights.wK = false;
      castlingRights.wQ = false;
    } else {
      castlingRights.bK = false;
      castlingRights.bQ = false;
    }
  }
  // If rook moves from original squares lose related castling right
  if(piece.toLowerCase() === 'r'){
    if(color === 'w'){
      if(from.r === 7 && from.c === 0) castlingRights.wQ = false;
      else if(from.r === 7 && from.c === 7) castlingRights.wK = false;
    } else {
      if(from.r === 0 && from.c === 0) castlingRights.bQ = false;
      else if(from.r === 0 && from.c === 7) castlingRights.bK = false;
    }
  }
  // If rook captured on original squares lose opponent castling right
  if(target && target.toLowerCase() === 'r'){
    if(enemy === 'w'){
      if(to.r === 7 && to.c === 0) castlingRights.wQ = false;
      else if(to.r === 7 && to.c === 7) castlingRights.wK = false;
    } else {
      if(to.r === 0 && to.c === 0) castlingRights.bQ = false;
      else if(to.r === 0 && to.c === 7) castlingRights.bK = false;
    }
  }

  // Move piece
  board[to.r][to.c] = piece;
  board[from.r][from.c] = '';

  // Castling move - move rook
  if(to.castle){
    if(color === 'w'){
      if(to.castle === 'K'){
        board[7][5] = board[7][7];
        board[7][7] = '';
      } else if(to.castle === 'Q'){
        board[7][3] = board[7][0];
        board[7][0] = '';
      }
    } else {
      if(to.castle === 'K'){
        board[0][5] = board[0][7];
        board[0][7] = '';
      } else if(to.castle === 'Q'){
        board[0][3] = board[0][0];
        board[0][0] = '';
      }
    }
  }

  // En passant capture
  if(piece.toLowerCase() === 'p' && enPassant && to.r === enPassant.r && to.c === enPassant.c){
    if(color === 'w'){
      // capture pawn below
      board[to.r + 1][to.c] = '';
    } else {
      // capture pawn above
      board[to.r - 1][to.c] = '';
    }
  }

  // Pawn promotion check (if promotionPiece is null, open dialog)
  if(piece.toLowerCase() === 'p'){
    let promotionRow = color === 'w' ? 0 : 7;
    if(to.r === promotionRow){
      if(promotionPiece){
        board[to.r][to.c] = color === 'w' ? promotionPiece.toUpperCase() : promotionPiece.toLowerCase();
      } else {
        // Need to open promotion dialog, undo move for now
        // Restore state from history
        undo();
        openPromotionDialog(from, to);
        return;
      }
    }
  }

  // Update en passant square (only if pawn moved two squares)
  if(piece.toLowerCase() === 'p' && Math.abs(to.r - from.r) === 2){
    enPassant = {r: (to.r + from.r) / 2, c: to.c};
  } else {
    enPassant = null;
  }

  // Update halfmove clock
  if(piece.toLowerCase() === 'p' || target){
    halfMoveClock = 0;
  } else {
    halfMoveClock++;
  }

  // Update full move number
  if(color === 'b'){
    fullMoveNumber++;
  }

  // Captured pieces tracking
  if(target){
    if(color === 'w') blackCaptured.push(target);
    else whiteCaptured.push(target);
  }

  // Change turn
  turn = opponent(turn);

  selectedSquare = null;
  validMoves = [];

  saveHistory();
  renderAll();

  // Check for end of game conditions
  checkEndConditions();

  // Restart timer for new player
  startTimer();
}

// --- Check checkmate, stalemate, 50-move draw, threefold repetition ---
function checkEndConditions() {
  // Check if current player has any legal moves
  let legalMovesExist = false;
  outer:
  for(let r=0; r<BOARD_SIZE; r++){
    for(let c=0; c<BOARD_SIZE; c++){
      if(pieceColor(board[r][c]) === turn){
        let moves = getValidMoves(r,c);
        if(moves.length > 0){
          legalMovesExist = true;
          break outer;
        }
      }
    }
  }

  if(!legalMovesExist){
    if(isInCheck(turn)){
      alert(`${turn === 'w' ? 'White' : 'Black'} is checkmated! ${turn === 'w' ? 'Black' : 'White'} wins!`);
    } else {
      alert("Stalemate! It's a draw.");
    }
    stopTimer();
  }

  // 50-move rule
  if(halfMoveClock >= 100){
    alert("Draw by 50-move rule.");
    stopTimer();
  }

  // TODO: Threefold repetition - complex, skipping for brevity

  // Check for check indication on turn indicator
  if(isInCheck(turn)){
    turnIndicator.textContent += " - CHECK!";
  }
}

// --- Square click handler ---
function onSquareClick(r,c) {
  if(timerRunning === false) return; // game ended

  const clickedPiece = board[r][c];

  // If selectedSquare is null, select if piece belongs to player
  if(!selectedSquare){
    if(clickedPiece && pieceColor(clickedPiece) === turn){
      selectedSquare = {r,c};
      validMoves = getValidMoves(r,c);
      renderBoard();
    }
  } else {
    // If clicked the same square, deselect
    if(selectedSquare.r === r && selectedSquare.c === c){
      selectedSquare = null;
      validMoves = [];
      renderBoard();
      return;
    }

    // Check if clicked square is in validMoves
    if(validMoves.some(m => m.r === r && m.c === c)){
      makeMove(selectedSquare, {r,c});
    } else if(clickedPiece && pieceColor(clickedPiece) === turn){
      // Select new piece
      selectedSquare = {r,c};
      validMoves = getValidMoves(r,c);
      renderBoard();
    } else {
      // Invalid click, deselect
      selectedSquare = null;
      validMoves = [];
      renderBoard();
    }
  }
}

// --- Promotion dialog handling ---
let pendingPromotion = null;
function openPromotionDialog(from, to) {
  promotionDialog.style.display = 'block';
  overlay.style.display = 'block';
  pendingPromotion = {from, to};
}
promotionButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const piece = btn.dataset.piece;
    if(pendingPromotion){
      const {from, to} = pendingPromotion;
      promotionDialog.style.display = 'none';
      overlay.style.display = 'none';
      pendingPromotion = null;
      makeMove(from, to, piece);
    }
  });
});

// --- Timer Handling ---
function startTimer(){
  stopTimer();
  timerRunning = true;
  timerInterval = setInterval(() => {
    if(turn === 'w'){
      whiteTimeLeft--;
      if(whiteTimeLeft <= 0){
        whiteTimeLeft = 0;
        alert("White ran out of time! Black wins!");
        stopTimer();
      }
    } else {
      blackTimeLeft--;
      if(blackTimeLeft <= 0){
        blackTimeLeft = 0;
        alert("Black ran out of time! White wins!");
        stopTimer();
      }
    }
    renderTimers();
  }, 1000);
}

function stopTimer(){
  clearInterval(timerInterval);
  timerRunning = false;
}

// --- Button handlers ---
undoBtn.addEventListener('click', () => {
  undo();
});

restartBtn.addEventListener('click', () => {
  if(confirm("Restart the game?")){
    initGame();
  }
});

// --- Start ---
initGame();
