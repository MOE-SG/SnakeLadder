document.addEventListener('DOMContentLoaded', () => {
    const BOARD_ROWS = 9;
    const BOARD_COLS = 6;
    const TOTAL_SQUARES = BOARD_ROWS * BOARD_COLS;
    const NUM_PLAYERS = 20;
    const ADMIN_PASSWORD = "admin"; // Client-side password (as requested)

    const boardElement = document.getElementById('game-board');
    const rollDiceBtn = document.getElementById('roll-dice-btn');
    const diceFaceElement = document.getElementById('dice-face');
    const playerListElement = document.getElementById('player-list');
    const messageArea = document.getElementById('message-area');
    const resetGameBtn = document.getElementById('reset-game-btn');
    const saveGameBtn = document.getElementById('save-game-btn');
    const loadGameBtn = document.getElementById('load-game-btn');
    const adminPanelBtn = document.getElementById('admin-panel-btn');
    const adminModal = document.getElementById('admin-modal');
    const adminLoginBtn = document.getElementById('admin-login-btn');
    const adminApplyBtn = document.getElementById('admin-apply-btn');
    const adminPasswordInput = document.getElementById('admin-password');
    const adminUserIdInput = document.getElementById('admin-user-id');
    const adminRollsInput = document.getElementById('admin-rolls');
    const adminLoggedInDiv = document.getElementById('admin-logged-in');

    let gameState = {
        players: [],
        currentPlayerIndex: 0,
        rollsRemaining: 1,
    };

    // Define Snakes and Ladders for the 6x9 grid (positions 1 to 54)
    // Format: { start: end }
    const snakes = {
        52: 12,
        45: 23,
        34: 14,
        28: 8,
        17: 5,
    };

    const ladders = {
        3: 21,
        7: 29,
        18: 38,
        26: 48,
        41: 53,
    };

    const playerColors = [
        '#FF6347', '#4682B4', '#32CD32', '#FFD700', '#9370DB', '#FF69B4', '#00CED1', '#FF4500', 
        '#DA70D6', '#8FBC8F', '#DC143C', '#00BFFF', '#ADFF2F', '#FF8C00', '#4B0082', '#FF1493',
        '#1E90FF', '#FF7F50', '#7FFF00', '#D2691E'
    ];

    function initGame() {
        createBoard();
        createPlayers();
        renderPlayerList();
        updateUI();
        setMessage(`Game started! It's ${gameState.players[gameState.currentPlayerIndex].name}'s turn.`);
    }

    function createBoard() {
        boardElement.innerHTML = '';
        for (let i = 1; i <= TOTAL_SQUARES; i++) {
            const square = document.createElement('div');
            square.classList.add('square');

            // Alternate colors
            const row = Math.floor((i - 1) / BOARD_COLS);
            const col = (i - 1) % BOARD_COLS;
            // Reverse direction every second row (snake pattern numbering)
            let logicalPosition;
            if (row % 2 === 0) {
                logicalPosition = TOTAL_SQUARES - i + 1;
            } else {
                // If it's an even-indexed row (0-based), it's the reverse row
                // We need to calculate the position differently to count up
                const startOfRow = (row * BOARD_COLS) + 1;
                const endOfRow = (row * BOARD_COLS) + BOARD_COLS;
                const offsetInRow = col;
                logicalPosition = startOfRow + (BOARD_COLS - 1 - offsetInRow);
            }

            // Assign the correct number for display
            let displayPosition = TOTAL_SQUARES - i + 1;
            
            // Add a temporary ID based on actual board position for styling
            square.id = `square-${displayPosition}`;

            // Add alternate colors for grid pattern
            if ((row + col) % 2 === 0) {
                square.classList.add('color-light');
            } else {
                square.classList.add('color-dark');
            }

            const numberSpan = document.createElement('span');
            numberSpan.classList.add('square-number');
            numberSpan.textContent = displayPosition;
            square.appendChild(numberSpan);

            // Add snake/ladder markers
            if (snakes[displayPosition]) {
                square.classList.add('snake');
            } else if (ladders[displayPosition]) {
                square.classList.add('ladder');
            }

            boardElement.appendChild(square);
        }
    }

    function createPlayers() {
        gameState.players = [];
        for (let i = 0; i < NUM_PLAYERS; i++) {
            gameState.players.push({
                id: i,
                name: `Player ${i + 1}`,
                position: 0, // Position 0 means not on the board yet (at the start line)
                color: playerColors[i % playerColors.length],
            });
        }
    }

    function renderPlayerList() {
        playerListElement.innerHTML = '';
        gameState.players.forEach((player, index) => {
            const li = document.createElement('li');
            li.classList.add('player-item');
            if (index === gameState.currentPlayerIndex) {
                li.classList.add('active');
            }
            li.style.borderLeft = `5px solid ${player.color}`;
            li.innerHTML = `
                <span>${player.name}</span>
                <span id="pos-${player.id}">Pos: ${player.position}</span>
            `;
            playerListElement.appendChild(li);
        });
    }

    function updateUI() {
        // Update player positions on the board
        // First, clear all tokens from the board visually
        document.querySelectorAll('.player-token').forEach(token => token.remove());

        gameState.players.forEach(player => {
            if (player.position > 0) {
                // The square ID matches the position number
                const square = document.getElementById(`square-${player.position}`);
                if (square) {
                    const token = document.createElement('div');
                    token.classList.add('player-token');
                    token.style.backgroundColor = player.color;
                    // Position tokens slightly differently within the square to avoid overlap (simple grid offset)
                    const tokenOffsetIndex = player.id % 4; // Use 4 simple spots within a cell
                    const offsetX = (tokenOffsetIndex % 2 === 0) ? '20%' : '60%';
                    const offsetY = (tokenOffsetIndex < 2) ? '20%' : '60%';
                    token.style.transform = `translate(${offsetX}, ${offsetY})`;
                    
                    square.appendChild(token);
                }
            }
        });
        
        // Update player list positions/active status
        renderPlayerList();
    }

    function rollDice() {
        rollDiceBtn.disabled = true;
        diceFaceElement.classList.add('rolling');
        
        // Simulate rolling animation time
        setTimeout(() => {
            diceFaceElement.classList.remove('rolling');
            const roll = Math.floor(Math.random() * 6) + 1;
            diceFaceElement.textContent = roll;
            movePlayer(roll);
        }, 500);
    }

    function movePlayer(roll) {
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];
        let newPosition = currentPlayer.position + roll;

        if (newPosition > TOTAL_SQUARES) {
            newPosition = currentPlayer.position; // Stay put if roll is too high
            setMessage(`${currentPlayer.name} rolled a ${roll} but went too far!`);
        } else {
            currentPlayer.position = newPosition;
            setMessage(`${currentPlayer.name} moved to square ${newPosition}.`);
        }
        
        updateUI();

        // Check for snakes or ladders after the move
        setTimeout(() => checkSpecialSquares(currentPlayer, roll), 600);
    }

    function checkSpecialSquares(player, roll) {
        const currentPos = player.position;
        if (snakes[currentPos]) {
            const endPos = snakes[currentPos];
            player.position = endPos;
            setMessage(`🐍 Oh no! ${player.name} hit a snake and slid down to ${endPos}.`);
            updateUI();
        } else if (ladders[currentPos]) {
            const endPos = ladders[currentPos];
            player.position = endPos;
            setMessage(`🪜 Yay! ${player.name} climbed a ladder to ${endPos}.`);
            updateUI();
        }

        // Check for win condition
        if (player.position === TOTAL_SQUARES) {
            setMessage(`🎉 ${player.name} wins the game!`);
            rollDiceBtn.disabled = true;
            return;
        }

        // Manage turns
        if (roll !== 6) {
            gameState.rollsRemaining--;
        }
        
        if (gameState.rollsRemaining === 0) {
            nextTurn();
        } else {
            setMessage(`Rolled a 6! ${player.name} gets another roll.`);
            rollDiceBtn.disabled = false;
        }
    }

    function nextTurn() {
        gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % NUM_PLAYERS;
        gameState.rollsRemaining = 1;
        setMessage(`It's ${gameState.players[gameState.currentPlayerIndex].name}'s turn.`);
        rollDiceBtn.disabled = false;
        renderPlayerList(); // Update active player highlighting
    }

    function setMessage(msg) {
        messageArea.textContent = msg;
    }

    function resetGame() {
        if (confirm("Are you sure you want to reset the entire game? All progress will be lost.")) {
            createPlayers(); // Resets positions to 0
            gameState.currentPlayerIndex = 0;
            gameState.rollsRemaining = 1;
            updateUI();
            rollDiceBtn.disabled = false;
            setMessage("Game has been reset. Player 1 starts.");
            localStorage.removeItem('snakeAndLadderGameState'); // Clear saved state
        }
    }

    function saveGame() {
        try {
            localStorage.setItem('snakeAndLadderGameState', JSON.stringify(gameState));
            setMessage("Game state saved locally.");
        } catch (error) {
            setMessage("Failed to save game state.");
        }
    }

    function loadGame() {
        try {
            const savedState = localStorage.getItem('snakeAndLadderGameState');
            if (savedState) {
                gameState = JSON.parse(savedState);
                updateUI();
                setMessage("Game state loaded successfully.");
                rollDiceBtn.disabled = false;
            } else {
                setMessage("No saved game state found.");
            }
        } catch (error) {
            setMessage("Failed to load game state.");
        }
    }

    // --- Admin Functionality ---
    adminPanelBtn.onclick = () => adminModal.style.display = "block";
    document.querySelector('.close').onclick = () => adminModal.style.display = "none";
    window.onclick = (event) => {
        if (event.target == adminModal) adminModal.style.display = "none";
    };

    adminLoginBtn.onclick = () => {
        if (adminPasswordInput.value === ADMIN_PASSWORD) {
            adminLoggedInDiv.style.display = 'block';
            adminLoginBtn.style.display = 'none';
            adminPasswordInput.value = '';
            setMessage("Admin logged in.");
        } else {
            alert("Incorrect password.");
        }
    };

    adminApplyBtn.onclick = () => {
        const userId = parseInt(adminUserIdInput.value);
        const rolls = parseInt(adminRollsInput.value);

        if (!isNaN(userId) && userId >= 0 && userId < NUM_PLAYERS && !isNaN(rolls) && rolls > 0) {
            gameState.currentPlayerIndex = userId;
            gameState.rollsRemaining = rolls;
            updateUI();
            adminModal.style.display = 'none';
            adminLoggedInDiv.style.display = 'none';
            adminLoginBtn.style.display = 'inline-block';
            setMessage(`Admin set ${gameState.players[userId].name} as next player with ${rolls} rolls.`);
        } else {
            alert("Invalid user ID or rolls count.");
        }
    };


    // --- Event Listeners ---
    rollDiceBtn.addEventListener('click', rollDice);
    resetGameBtn.addEventListener('click', resetGame);
    saveGameBtn.addEventListener('click', saveGame);
    loadGameBtn.addEventListener('click', loadGame);

    // Initialize the game on load
    initGame();
});
