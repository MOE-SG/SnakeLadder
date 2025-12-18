// --- 1. PLAYER & MAP CONFIGURATION ---
const playerNames = ["Alice", "Bob", "Charlie", "David", "Eve", "Frank", "Grace", "Heidi", "Ivan", "Judy", "Kevin", "Liam", "Mallory", "Niaj", "Oscar", "Peggy", "Quentin", "Rupert", "Sybil", "Trent"];
const adminPassword = "admin123";
const boardSize = 64;
const columns = 8;

// SPECIFY PORTALS HERE: { StartTile: EndTile }
// If End > Start, it's a Ladder. If Start > End, it's a Snake.
const portals = { 
    2: 18, 10: 30, 25: 45, 42: 59, // Ladders
    22: 4, 37: 15, 50: 32, 62: 40  // Snakes
};

let players = playerNames.map((name, i) => ({
    id: i + 1, name: name, pos: 1, rolls: 0, finished: false,
    color: `hsl(${(i * 137.5) % 360}, 75%, 55%)`
}));

let currentTurnIndex = 0;
let isAnimating = false;

function init() {
    const board = document.getElementById('board');
    const select = document.getElementById('select-player');

    // Generate Rainbow Board
    for (let r = columns - 1; r >= 0; r--) {
        const isEvenRow = r % 2 === 0;
        for (let c = 0; c < columns; c++) {
            const col = isEvenRow ? (columns - 1 - c) : c;
            const tileNum = (r * columns) + col + 1;
            
            const div = document.createElement('div');
            div.className = 'tile'; div.id = `tile-${tileNum}`;
            div.innerText = tileNum;

            const hue = (tileNum * (360 / boardSize));
            div.style.backgroundColor = `hsl(${hue}, 45%, 20%)`;
            board.appendChild(div);
        }
    }

    players.forEach(p => {
        let opt = document.createElement('option');
        opt.value = p.id; opt.innerText = p.name;
        select.appendChild(opt);
    });

    drawPortals();
    updateUI();
}

// --- 2. GAMEPLAY LOGIC ---


function handleRollClick() {
    const player = players[currentTurnIndex];
    if (player.rolls <= 0 || player.finished || isAnimating) return;

    // 1. Lock UI & Start Sound
    isAnimating = true;
    const rollBtn = document.getElementById('roll-btn');
    const diceDisplay = document.getElementById('dice-result');
    const diceSound = document.getElementById('dice-sound');
    
    rollBtn.disabled = true;
    diceDisplay.classList.add('dice-rolling');
    diceDisplay.innerText = "🎲 ...";
    
    // Play sound (reset to start first in case of rapid turns)
    diceSound.currentTime = 0;
    diceSound.play().catch(e => console.log("Sound blocked by browser policy. Interaction required first."));

    // 2. Wait 1.5 seconds (Simulating the dice roll)
    setTimeout(() => {
        diceDisplay.classList.remove('dice-rolling');
        
        // Stop sound when dice stops
        diceSound.pause();
        
        const roll = Math.floor(Math.random() * 6) + 1;
        diceDisplay.innerText = `🎲 ${roll}`;
        player.rolls--;

        // Calculate destination with bounce back
        let target = player.pos + roll;
        if (target > boardSize) {
            target = boardSize - (target - boardSize);
        }
        
        // 3. Move the player visually
        player.pos = target;
        updateUI();

        // 4. Wait for token to land before checking portals
        setTimeout(() => {
            checkPortalsAndFinish(player);
        }, 800);

    }, 1500); 
}

function checkPortalsAndFinish(player) {
    if (portals[player.pos]) {
        const end = portals[player.pos];
        const isLadder = end > player.pos;
        
        showModal(
            isLadder ? "Ladder! 🪜" : "Snake! 🐍", 
            `${player.name} moves to ${end}.`, 
            () => {
                player.pos = end;
                updateUI();
                // Brief pause after sliding before unlocking
                setTimeout(() => finalizeTurn(player), 500);
            }
        );
    } else {
        finalizeTurn(player);
    }
}

function finalizeTurn(player) {
    if (player.pos === boardSize) {
        player.finished = true;
        showModal("🏆 WINNER!", `${player.name} reached 64!`, () => {
            launchFireworks();
        });
    }

    isAnimating = false; // Unlock global state
    
    if (player.rolls <= 0 || player.finished) {
        nextTurn();
    } else {
        updateUI(); // This will re-enable the button via the standard updateUI logic
    }
}

function finalizeMove(player) {
    if (player.pos === boardSize) player.finished = true;
    if (player.rolls <= 0 || player.finished) nextTurn();
    else updateUI();
}

/**
 * IMPROVED TURN LOGIC
 * Automatically skips players with 0 rolls and stops if NO ONE can move.
 */
function nextTurn() {
    let playersWithRolls = players.filter(p => p.rolls > 0 && !p.finished);

    if (playersWithRolls.length === 0) {
        // Stop the game and wait for admin
        updateUI();
        console.log("Game Halted: All players out of rolls.");
        return;
    }

    // Cycle through players until we find one with rolls
    let nextIndex = currentTurnIndex;
    let found = false;

    for (let i = 0; i < players.length; i++) {
        nextIndex = (nextIndex + 1) % players.length;
        if (players[nextIndex].rolls > 0 && !players[nextIndex].finished) {
            currentTurnIndex = nextIndex;
            found = true;
            break;
        }
    }

    updateUI();
}

/**
 * WINNING LOGIC
 * Triggered only when a player lands exactly on 64.
 */
function finalizeMove(player) {
    if (player.pos === boardSize) {
        player.finished = true;
        showModal("🎉 CHAMPION!", `${player.name} has reached the end!`, () => {
            launchFireworks();
        });
    }

    // If current player is out of rolls, go to next
    if (player.rolls <= 0 || player.finished) {
        nextTurn();
    } else {
        updateUI();
    }
}

/**
 * FIREWORKS ANIMATION
 */
function launchFireworks() {
    const container = document.getElementById('fireworks-container');
    container.classList.remove('hidden');
    container.innerHTML = ''; // Reset

    for (let i = 0; i < 15; i++) {
        const fw = document.createElement('div');
        fw.className = 'firework';
        fw.style.setProperty('--x', Math.random() * 100 + 'vw');
        fw.style.setProperty('--y', Math.random() * 50 + 'vh');
        fw.style.setProperty('--color', `hsl(${Math.random() * 360}, 100%, 50%)`);
        fw.style.animationDelay = (Math.random() * 2) + 's';
        container.appendChild(fw);
    }

    // Hide fireworks after 10 seconds to allow game to continue
    setTimeout(() => {
        container.classList.add('hidden');
    }, 10000);
}

// Ensure finalizeMove is called in your handleRollClick

// --- 3. ADMIN TOOLS ---
function loginAdmin() {
    if (document.getElementById('admin-pass').value === adminPassword) {
        document.getElementById('admin-login-ui').classList.add('hidden');
        document.getElementById('admin-tools').classList.remove('hidden');
    } else { alert("Access Denied"); }
}

function logoutAdmin() {
    document.getElementById('admin-tools').classList.add('hidden');
    document.getElementById('admin-login-ui').classList.remove('hidden');
    document.getElementById('admin-pass').value = "";
}

function grantRollsToAll() {
    const amt = parseInt(document.getElementById('grant-amt').value) || 0;
    players.forEach(p => p.rolls += amt);
    updateUI();
}

function grantRollsToSpecific() {
    const id = document.getElementById('select-player').value;
    const amt = parseInt(document.getElementById('grant-amt').value) || 0;
    players[id-1].rolls += amt;
    updateUI();
}

// --- 4. VISUAL DRAWING & UI ---

// This function now takes an optional 'offset' parameter
// xOff and yOff are pixels away from the center
function getTilePoint(num, xOff = 0, yOff = 0) {
    const tile = document.getElementById(`tile-${num}`);
    const centerX = tile.offsetLeft + (tile.offsetWidth / 2);
    const centerY = tile.offsetTop + (tile.offsetHeight / 2);
    
    return { 
        x: centerX + xOff, 
        y: centerY + yOff 
    };
}

function drawPortals() {
    const svg = document.getElementById('svg-layer');
    svg.innerHTML = '';
    
    Object.keys(portals).forEach(start => {
        const end = portals[start];
        
        // Offset Logic: 
        // We move the start/end points 20px away from the center 
        // so the number in the middle stays clear.
        const s = getTilePoint(start, 15, 15); // Bottom-right of start tile
        const e = getTilePoint(end, -15, -15); // Top-left of end tile

        if (end > start) {
            // --- LADDER DRAWING ---
            const dx = e.x - s.x;
            const dy = e.y - s.y;
            const angle = Math.atan2(dy, dx);
            const gap = 7;

            const ox = Math.cos(angle + Math.PI/2) * gap;
            const oy = Math.sin(angle + Math.PI/2) * gap;

            createSVG('line', {x1: s.x-ox, y1: s.y-oy, x2: e.x-ox, y2: e.y-oy, class: 'ladder-side'}, svg);
            createSVG('line', {x1: s.x+ox, y1: s.y+oy, x2: e.x+ox, y2: e.y+oy, class: 'ladder-side'}, svg);

            for (let i = 0.2; i <= 0.8; i += 0.2) {
                createSVG('line', {
                    x1: s.x - ox + dx * i, y1: s.y - oy + dy * i,
                    x2: s.x + ox + dx * i, y2: s.y + oy + dy * i,
                    class: 'ladder-rung'
                }, svg);
            }
        } else {
            // --- SNAKE DRAWING ---
            // Move head to the top-right of the tile (x+18, y-18)
            const sHead = getTilePoint(start, 18, -18);
            const eTail = getTilePoint(end, 18, 18);
            
            const midX = (sHead.x + eTail.x) / 2 + 40;
            const midY = (sHead.y + eTail.y) / 2;
            
            createSVG('path', {d: `M${sHead.x},${sHead.y} Q${midX},${midY} ${eTail.x},${eTail.y}`, class: 'snake-body'}, svg);
            
            // Head and Eyes
            createSVG('ellipse', {rx: 9, ry: 5, cx: sHead.x, cy: sHead.y, class: 'snake-head'}, svg);
            //createSVG('circle', {cx: sHead.x-2, cy: sHead.y-2, r: 1.2, fill: 'white'}, svg);
            //createSVG('circle', {cx: sHead.x+2, cy: sHead.y-2, r: 1.2, fill: 'white'}, svg);
            // Change to just one eye on top of head - view side way
            createSVG('cricle', {cx: sHead.x, cy: sHead.y+4, r: 4,  fill: 'white'}, svg);
            createSVG('circle', {cx: sHead.x, cy: sHead.y+7, r: 2, fill: 'black'}, svg);
        }
    });
}


function updateUI() {
    const active = players[currentTurnIndex];
    const totalGlobalRolls = players.reduce((s, p) => s + p.rolls, 0);
    const indicator = document.getElementById('turn-indicator');
    const rollBtn = document.getElementById('roll-btn');

    if (totalGlobalRolls === 0) {
        indicator.innerText = "ADMIN ENTRY REQUIRED";
        indicator.style.color = "#ef4444";
        rollBtn.disabled = true;
    } else if (active.rolls <= 0) {
        indicator.innerText = `${active.name} (Waiting...)`;
        indicator.style.color = "#64748b";
        rollBtn.disabled = true;
    } else {
        indicator.innerText = active.name;
        indicator.style.color = active.color;
        rollBtn.disabled = false;
    }

    document.getElementById('roll-counter').innerText = `Rolls: ${active.rolls}`;
    const tbody = document.getElementById('player-rows');
    tbody.innerHTML = '';

    players.forEach(p => {
        const isCurrent = p.id === active.id;
        const isFinished = p.finished;
        
        const row = document.createElement('tr');
        if (isCurrent) row.className = 'current-player-row';
        if (isFinished) row.classList.add('finished-player-row');
        
        row.innerHTML = `
            <td><span style="color:${p.color}">●</span> ${p.name} ${isFinished ? '🚩' : ''}</td>
            <td>${p.pos}</td>
            <td>${p.rolls}</td>
        `;
        
        tbody.appendChild(row);

        // AUTO-SCROLL LOGIC
        if (isCurrent) {
            // Wait for DOM to update then scroll
            setTimeout(() => {
                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        }

        // --- Token logic remains the same ---
        let t = document.getElementById(`token-${p.id}`);    
        if (!t) {
            t = document.createElement('div');
            t.id = `token-${p.id}`; t.className = 'token';
            t.style.background = p.color; t.innerText = p.id;
            document.getElementById('tokens-layer').appendChild(t);
        }
        const coords = getTileCenter(p.pos);
        t.style.left = (coords.x - 14 + (p.id % 5) * 4) + 'px';
        t.style.top = (coords.y - 14 + Math.floor(p.id / 5) * 4) + 'px';
    });
}

function getTileCenter(num) {
    const tile = document.getElementById(`tile-${num}`);
    return { x: tile.offsetLeft + (tile.offsetWidth / 2), y: tile.offsetTop + (tile.offsetHeight / 2) };
}

function showModal(title, text, onConfirm) {
    const m = document.getElementById('event-modal');
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-text').innerText = text;
    m.classList.remove('hidden');
    document.getElementById('modal-confirm-btn').onclick = () => { m.classList.add('hidden'); onConfirm(); };
}

function createSVG(tag, attr, parent) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (let k in attr) el.setAttribute(k, attr[k]);
    parent.appendChild(el);
}

/**
 * SAVE GAME STATE
 * Converts the current game data into a JSON file and triggers a download
 */
function saveGameState() {
    const dataToSave = {
        players: players,
        currentTurnIndex: currentTurnIndex,
        saveDate: new Date().toLocaleString(),
        gameConfig: {
            boardSize: boardSize,
            portals: portals
        }
    };

    const blob = new Blob([JSON.stringify(dataToSave, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `snakes_ladders_save_${new Date().getTime()}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    alert("Game state saved successfully!");
}

/**
 * LOAD GAME STATE
 * Reads a JSON file from the user's computer and restores the game
 */
function loadGameState(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const loadedData = JSON.parse(e.target.result);
            
            // Validation
            if (!loadedData.players || typeof loadedData.currentTurnIndex === 'undefined') {
                throw new Error("Invalid save file format.");
            }

            // Restore State
            players = loadedData.players;
            currentTurnIndex = loadedData.currentTurnIndex;
            
            // Refresh the UI to show new positions and names
            updateUI();
            
            // Redraw portals in case the save file had a different map config
            if(loadedData.gameConfig && loadedData.gameConfig.portals) {
                // portals = loadedData.gameConfig.portals; // Uncomment if you want map to change too
                drawPortals(); 
            }

            alert("Game Loaded: Continued from " + (loadedData.saveDate || "previous session"));
            
            // Reset the file input so the same file can be loaded again if needed
            event.target.value = '';
            
        } catch (err) {
            alert("Error loading file: " + err.message);
        }
    };
    reader.readAsText(file);
}

window.onload = init;
