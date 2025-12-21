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
            div.style.backgroundColor = `hsla(${hue}, 45%, 20%, 0.6)`;
            board.appendChild(div);
        }
    }

    players.forEach(p => {
        let opt = document.createElement('option');
        opt.value = p.id; opt.innerText = p.name;
        select.appendChild(opt);
    });

  // ADD THIS AT THE BOTTOM OF init()
    window.addEventListener('click', () => {
        // We use a custom property to make sure it only tests once
        if (!window.audioTested) {
            testFireworks();
            runAudioTest();
            window.audioTested = true;
        }
    }, { once: true });
  
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
        
        // 1. Play the sound FIRST
        const sound = isLadder ? 
            document.getElementById('tiger-roar') : 
            document.getElementById('hiss-sound');

        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => console.log("Playback blocked"));
        }

        // 2. Wait 1.2 seconds for the sound to finish/play out
        setTimeout(() => {
            showModal(
                isLadder ? "Tiger Leap! 🪜" : "Snake Bite! 🐍", 
                `${player.name} is moving to tile ${end}.`, 
                () => {
                    // 3. Update the logical position
                    player.pos = end;
                    
                    // 4. CRITICAL: Update UI to visually move the token to the new spot
                    updateUI(); 
                    
                    // 5. Brief pause for the slide animation before finishing the turn
                    setTimeout(() => finalizeTurn(player), 600);
                }
            );
        }, 1200); 
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
    const defs = svg.querySelector('defs').outerHTML;
    svg.innerHTML = defs; 

    const portalKeys = Object.keys(portals);

    // --- PASS 1: DRAW ALL SNAKES FIRST (Bottom Layer) ---
    portalKeys.forEach(start => {
        const end = portals[start];
        if (end < start) { // It's a Snake
            const s = getTilePoint(start, 0, 0);
            const e = getTilePoint(end, 0, 0);
            const dx = e.x - s.x;
            const dy = e.y - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);

            const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
            use.setAttributeNS("http://www.w3.org/1999/xlink", "href", "#new-artwork-template");
            use.setAttribute("transform", `
                translate(${s.x}, ${s.y}) 
                rotate(${angle}) 
                scale(${dist / 300}, 1) 
                translate(-40, -40)
            `);
            svg.appendChild(use);
        }
    });

    // --- PASS 2: DRAW ALL LADDERS SECOND (Top Layer) ---
    portalKeys.forEach(start => {
        const end = portals[start];
        if (end > start) { // It's a Ladder
            const tile = document.getElementById(`tile-${start}`);
            const hX = tile.offsetWidth / 2;
            const hY = tile.offsetHeight / 2;

            const s = getTilePoint(start, hX, hY); 
            const e = getTilePoint(end, -hX, -hY);
            const dx = e.x - s.x;
            const dy = e.y - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;

            const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
            use.setAttributeNS("http://www.w3.org/1999/xlink", "href", "#tiger-template");
            use.setAttribute("transform", `
                translate(${s.x},${s.y}) 
                rotate(${angle}) 
                scale(0.35, ${dist / 280}) 
                translate(-100,-280)
            `);
            svg.appendChild(use);
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

/**
 * AUDIO TESTER
 * Plays all game sounds in sequence to verify they are loaded correctly.
 */
function runAudioTest() {
    const dice = document.getElementById('dice-sound');
    const hiss = document.getElementById('hiss-sound');
    const roar = document.getElementById('tiger-roar');
    const fireworksound = document.getElementById('firework-sound');
    console.log("Starting Audio Test...");

    // Play Dice Sound
    dice.currentTime = 0;
    dice.play().then(() => {
        console.log("Dice sound: OK");
        
        // Wait 1.5s, then play Hiss
        setTimeout(() => {
            hiss.play();
            console.log("Snake sound: OK");
            
            // Wait 1.5s, then play Roar
            setTimeout(() => {
                roar.play();
                console.log("Tiger sound: OK");
                setTimeout(() => {
                    fireworksound.play();
                    console.log("Tiger sound: OK");
                }, 1500);
            }, 1500);
            
        }, 1500);
    }).catch(err => {
        console.warn("Audio blocked! Click anywhere on the page to enable sound.");
    });
}

/**
 * TEST FIREWORKS
 * Call this from the console or a temporary button to see the result
 */
function testFireworks() {
    console.log("Testing Fireworks...");
    
    // Ensure container exists and is visible
    const container = document.getElementById('fireworks-container');
    container.classList.remove('hidden');
    container.innerHTML = '';

    // Create a few centered fireworks to see the effect clearly
    for (let i = 0; i < 5; i++) {
        const fw = document.createElement('div');
        fw.className = 'firework';
        
        // Spread them across the middle
        const x = (20 + (i * 15)) + 'vw'; 
        const y = (20 + (Math.random() * 20)) + 'vh';
        
        fw.style.setProperty('--x', x);
        fw.style.setProperty('--y', y);
        fw.style.setProperty('--color', `hsl(${Math.random() * 360}, 100%, 60%)`);
        fw.style.animationDelay = (i * 0.4) + 's';
        
        container.appendChild(fw);
    }

    // Auto-stop after 10 seconds for testing
    setTimeout(() => {
        container.classList.add('hidden');
        container.innerHTML = '';
    }, 10000);
}

window.onload = init;
