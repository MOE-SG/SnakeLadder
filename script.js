// --- 1. PLAYER & MAP CONFIGURATION ---
const playerNames = ["Red Leo x Pro", "STAR TEAM", "O.m.O", "Five Guys", "Litho Force Unit", "MRTC TIGER"];
const adminPassword = "admin123";
const boardSize = 64;
const columns = 8;
const pendingId = localStorage.getItem('pending_room_id');
const pendingState = localStorage.getItem('pending_game_state');
// SPECIFY PORTALS HERE: { StartTile: EndTile }
// If End > Start, it's a Ladder. If Start > End, it's a Snake.
const portals = { 
    2: 18, 10: 30, 25: 45, 42: 59, // Ladders
    22: 4, 37: 15, 50: 32, 62: 40  // Snakes
};

// --- 1. PLAYER CONFIGURATION (Updated) ---
let players = playerNames.map((name, i) => ({
    id: i + 1, 
    name: name, 
    pos: 0,              // Start outside the board
    rolls: 0, 
    totalRollsGiven: 0,  // Tracking total rolls granted
    escapes: 0,          // Tracking snake escapes
    finished: false,
    color: `hsl(${(i * 137.5) % 360}, 75%, 55%)`
}));

let currentTurnIndex = 0;
let isAnimating = false;
let viewerConns = []; // <--- THIS LINE IS MISSING OR IN THE WRONG PLACE

// --- 2. PEERJS CONFIGURATION (With Port/Server Options) ---
// If port 443 is blocked, you can specify a custom port or use a different server
// PEERJS CONFIG: Host can change port here if 443 is blocked
const peer = new Peer(pendingId || null, {
    host: '0.peerjs.com',
    port: 443, // Change this to 9000 or other if 443 is blocked
    secure: true
});
peer.on('open', (id) => {
    document.getElementById('my-id').innerText = id;
	// RECOVERY LOGIC: Check if we just refreshed to load a file
    const pendingState = localStorage.getItem('pending_game_state');
    if (pendingState) {
        try {
            const data = JSON.parse(pendingState);
            
            // Apply the saved state to the current game variables
            players = data.players;
            currentTurnIndex = data.currentTurnIndex;
            
            // Clear the temporary storage
            localStorage.removeItem('pending_room_id');
            localStorage.removeItem('pending_game_state');
            
            // Refresh the Host UI
            updateUI();
            console.log("Persistence: Game state restored from file after refresh.");
        } catch (err) {
            console.error("Failed to parse pending game state:", err);
        }
    }
});


peer.on('connection', (conn) => {
    // Add to our list of viewers
    viewerConns.push(conn);
    
    // Update the local viewer count display
    document.getElementById('viewer-count').innerText = viewerConns.length;

    // IMPORTANT: Wait for the specific connection to be 'open' before sending data
    conn.on('open', () => {
        console.log("Viewer joined. Sending initial sync...");
        conn.send({
            type: 'SYNC',
            players: players,            // The full array of players
            currentTurnIndex: currentTurnIndex,
            viewerCount: viewerConns.length
        });
    });

    conn.on('close', () => {
        viewerConns = viewerConns.filter(c => c !== conn);
        document.getElementById('viewer-count').innerText = viewerConns.length;
        broadcast({ type: 'VIEWER_COUNT', count: viewerConns.length });
    });
});

function updateViewerCount() {
    const count = viewers.length;
    document.getElementById('viewer-count').innerText = count;
    broadcast({ type: 'VIEWER_COUNT', count: count });
}

function broadcast(data) {
    viewerConns.forEach(conn => conn.send(data));
}

function broadcastState() {
    broadcast({
        type: 'UPDATE_STATE',
        players: players,
        currentTurnIndex: currentTurnIndex
    });
}

// --- HEARTBEAT MECHANISM ---
// Sends a small "pulse" to all viewers every 3 seconds to confirm the host is still active.
setInterval(() => {
    broadcast({ 
        type: 'HEARTBEAT', 
        timestamp: Date.now() 
    });
}, 3000);

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
  /*  window.addEventListener('click', () => {
        // We use a custom property to make sure it only tests once
        if (!window.audioTested) {
            testFireworks();
            runAudioTest();
            window.audioTested = true;
        }
    }, { once: true });
  */
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
	
	// --- P2P BROADCAST: Trigger Dice Sound for Viewers ---
    broadcast({ 
        type: 'ACTION_SOUND', 
        soundId: 'dice-sound' 
    });
    // 2. Wait 1.5 seconds (Simulating the dice roll)
    setTimeout(() => {
        diceDisplay.classList.remove('dice-rolling');
        
        // Stop sound when dice stops
        diceSound.pause();
        
        const roll = Math.floor(Math.random() * 6) + 1;
        diceDisplay.innerText = `🎲 ${roll}`;
        player.rolls--;
		// --- P2P BROADCAST: Send Roll Result to Viewers ---
        broadcast({ 
            type: 'DICE_ROLL_RESULT', 
            roll: roll, 
            playerId: player.id 
        });
        // Calculate destination with bounce back
        let target = player.pos + roll;
        if (target > boardSize) {
            target = boardSize - (target - boardSize);
        }
        
        // 3. Move the player visually
        player.pos = target;
        updateUI();
		broadcastState();
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
        //console.log(`rolls ${player.rolls}`);
        // 1. Play the sound FIRST
		const soundId = isLadder ? 'tiger-roar' : 'hiss-sound';
		const sound = document.getElementById(soundId);

		if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => console.log("Playback blocked"));
        } 
		// --- P2P BROADCAST: Trigger Portal Sound for Viewers ---
        broadcast({ type: 'ACTION_SOUND', soundId: soundId });
        // 2. Wait 1.2 seconds for the sound to finish/play out
        setTimeout(() => {
			if (isLadder) {
            //const title = isLadder ? "Tiger Leap! 🪜" : "Snake Bite! 🐍";
            //const message = `${player.name} is moving to tile ${end}.`;
				// 3. Show Local Modal
				showModal("Tiger Leap! 🪜", `${player.name} is moving to tile ${end}.`, () => {
					player.pos = end;
					updateUI();
					
					// --- P2P BROADCAST: Sync Position after sliding ---
					broadcast({ 
						type: 'SYNC_POSITION', 
						playerId: player.id, 
						newPos: end 
					});
					broadcastState();
					setTimeout(() => finalizeTurn(player), 600);
				});
			} else {
                // NEW: Interactive Snake Choice
				// SNAKE CHOICE LOGIC
                showChoiceModal(
                    "Snake Encounter! 🐍", 
                    `${player.name}, do you manage to Escape?`,
                    "Escape", // Option 1
                    "Bitten", // Option 2
                    () => { // Escape Choice
                        player.escapes++;
						broadcast({ type: 'HIDE_MODAL' })
                        updateUI();
                        broadcastState();
                        finalizeTurn(player);
                    },
                    () => { // Bitten Choice
                        player.pos = end;
						broadcast({ type: 'HIDE_MODAL' })
                        updateUI();
                        broadcast({ type: 'SYNC_POSITION', playerId: player.id, newPos: end });
                        setTimeout(() => finalizeTurn(player), 600);
                    }
                );
            }
			// --- P2P BROADCAST: Show Modal for Viewers ---
            broadcast({ 
                type: 'SHOW_MODAL', 
                title: isLadder ? "Tiger Leap! 🪜" : "Snake Encounter! 🐍", 
                text: `${player.name} is at a portal!`
            });
        }, 1200); 
    } else {
        finalizeTurn(player);
    }
}

// Added Updated Modal with two buttons
function showChoiceModal(title, text, btn1Text, btn2Text, onBtn1, onBtn2) {
    const m = document.getElementById('event-modal');
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-text').innerText = text;
    
    // Create/Configure Buttons
    const btn1 = document.getElementById('modal-confirm-btn');
    btn1.innerText = btn1Text;
    
    // Check for/Create second button
    let btn2 = document.getElementById('modal-choice-btn');
    if (!btn2) {
        btn2 = document.createElement('button');
        btn2.id = 'modal-choice-btn';
        btn2.className = 'primary-btn';
        btn1.parentNode.appendChild(btn2);
    }
    btn2.innerText = btn2Text;
    btn2.style.display = "inline-block";

    m.classList.remove('hidden');

    btn1.onclick = () => {
        m.classList.add('hidden');
        btn2.style.display = "none";
        onBtn1();
    };

    btn2.onclick = () => {
        m.classList.add('hidden');
        btn2.style.display = "none";
        onBtn2();
    };
}

function finalizeTurn(player) {
    if (player.pos === boardSize) {
        player.finished = true;
		const title = "🏆 WINNER!";
        const message = `${player.name} has reached the goal!`;
		launchFireworks();
        // 2. Show local modal
        showModal(title, message, () => {
            // This runs when Player clicks "OK"
            // This runs when the Host clicks "OK"
            isAnimating = false; // UNLOCK the game
            nextTurn();          // MOVE to the next player
        });
		// BROADCAST: Viewers see the same title/text and start fireworks
		broadcast({ type: 'SHOW_MODAL', title: title, text: message });
		broadcast({ type: 'FIREWORKS' });
		return;
    }

    isAnimating = false; // Unlock global state
	console.log(`finalizeTurn called`);
    
    if (player.rolls <= 0 || player.finished) {
        nextTurn();
		//console.log(`next turn`);
    } else {
        updateUI(); // This will re-enable the button via the standard updateUI logic
		//console.log(`update UI`);
		broadcastState();
    }
}

function stopFireworks() {
    // Stop local
    const fwSound = document.getElementById('firework-sound');
    if (fwSound) {
        fwSound.pause();
        fwSound.currentTime = 0;
    }
    document.getElementById('fireworks-container').classList.add('hidden');

    // Stop for viewers
    broadcast({ type: 'HIDE_MODAL' });
    broadcast({ type: 'STOP_FIREWORKS' });
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
	broadcastState();
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
    // 1. Play the sound locally for the Player
    const fwSound = document.getElementById('firework-sound');
    if (fwSound) {
        fwSound.currentTime = 0;
        fwSound.play().catch(e => console.log("Firework sound blocked"));
    }

    // 2. Broadcast to viewers to trigger their local sound and animation
    broadcast({ type: 'ACTION_SOUND', soundId: 'firework-sound' });
    broadcast({ type: 'FIREWORKS' });
	
	const container = document.getElementById('fireworks-container');
    container.classList.remove('hidden');
    container.innerHTML = ''; // Reset

	// 3. Local animation logic
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
    players.forEach(p => {
		p.rolls += amt;
		p.totalRollsGiven += amt; //added
	});
    updateUI();
	broadcastState(); // sync with viewer
}

function grantRollsToSpecific() {
    const id = document.getElementById('select-player').value;
    const amt = parseInt(document.getElementById('grant-amt').value) || 0;
    players[id-1].rolls += amt;
	players[id-1].totalRollsGiven += amt; //added
    updateUI();
	broadcastState(); // sync with viewer
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
	//     2: 18, 10: 30, 25: 45, 42: 59, // Ladders
    let i = 0;
    portalKeys.forEach(start => {
        const end = portals[start];
        if (end > start) { // It's a Ladder
            i = i +1;
			const tile = document.getElementById(`tile-${start}`);
            const hX = tile.offsetWidth / 2;
            const hY = tile.offsetHeight / 2;
			const s = getTilePoint(start, hX, hY); 
            const e = getTilePoint(end, hX, hY);
            const dx = e.x - s.x;
            const dy = e.y - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = (Math.atan2(dy, dx) * (180 / Math.PI))+130;
			const flipThreshold = 40;
            const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
            use.setAttributeNS("http://www.w3.org/1999/xlink", "href", "#tiger-template");
            const flip = Math.abs(angle) > flipThreshold ? -1 : 1;
			//const scale = dist/200;
			const baseHeight = 1000; 
			const scaleY = dist/baseHeight;
            console.log(`🪜 Ladder (${start} to ${end}): sx=${s.x}, sy=${s.y}, ex=${e.x}, ey=${e.y}, dx=${dx.toFixed(2)}, dy=${dy.toFixed(2)}, dist=${dist.toFixed(2)}, scaleY=${scaleY.toFixed(2)}, angle = ${angle.toFixed(2)}`);
			//const scaleX = dist / baseHeight;
			if (i==1){
			use.setAttribute("transform", `
				translate(480, 420)
				scale(0.25,0.2)
				rotate(30)	
            `);
			}else if (i==2){
			use.setAttribute("transform", `
				translate(${e.x-10}, ${e.y-10})
				rotate(50)	
				scale(-0.2,0.52)
            `);
			}else if (i==3){
			use.setAttribute("transform", `
				translate(${e.x-20}, ${e.y-10})
				rotate(50)	
				scale(-0.2,0.52)
            `);
			}else if (i==4){
			use.setAttribute("transform", `
				translate(${e.x-10}, ${e.y-30})
				rotate(0)	
				scale(-0.25,0.25)
            `);}
			svg.appendChild(use);
        }
    });
}


function updateUI() {
    const active = players[currentTurnIndex];
    const totalGlobalRolls = players.reduce((s, p) => s + p.rolls, 0);
    const indicator = document.getElementById('turn-indicator');
    const rollBtn = document.getElementById('roll-btn');

    // 1. Update Turn Indicator and Buttons
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
    
    // 2. Clear and Rebuild Player Table
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
            <td>${p.pos === 0 ? 'START' : p.pos}</td>
            <td>${p.rolls}</td>
            <td>${p.totalRollsGiven || 0}</td>
            <td>${p.escapes || 0}</td>
        `;
        
        tbody.appendChild(row);

        if (isCurrent) {
            setTimeout(() => {
                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        }

        // 3. TOKEN LOGIC: Handling Tile 0 Staggering
        let t = document.getElementById(`token-${p.id}`);    
        if (!t) {
            t = document.createElement('div');
            t.id = `token-${p.id}`; t.className = 'token';
            t.style.background = p.color; t.innerText = p.id;
            document.getElementById('tokens-layer').appendChild(t);
        }

        let coords;
        if (p.pos === 0) {
            // Define "Waiting Area" to the right of the first tile
            const tile1 = getTileCenter(1);
            coords = { 
                x: tile1.x + 70, // Shift right of tile 1
                y: tile1.y 
            };
        } else {
            coords = getTileCenter(p.pos);
        }

        // Apply your staggered grid formula: (p.id % 5) * 4 for X and floor(p.id / 5) * 4 for Y
        t.style.left = (coords.x - 14 + (p.id % 5) * 4) + 'px';
        t.style.top = (coords.y - 14 + Math.floor(p.id / 5) * 4) + 'px';
        
        // Ensure tokens are visible if you previously had them hidden at pos 0
        t.style.display = 'flex';
        t.style.opacity = isFinished ? "0.4" : "1";
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
	// where the game reset happens:
	document.getElementById('modal-confirm-btn').onclick = () => { 
		// 1. Stop local fireworks
		stopFireworks(); 
        m.classList.add('hidden');
		//document.getElementById('fireworks-container').classList.add('hidden');
		
		// 2. Tell viewers to hide modal AND stop fireworks
		broadcast({ type: 'HIDE_MODAL' });
		broadcast({ type: 'STOP_FIREWORKS' });
		
		// 3. Hide local modal
		//document.getElementById('event-modal').classList.add('hidden');
		
		// --- CRITICAL FIX: Run the callback logic! ---
        if (onConfirm) onConfirm();
	};
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
		roomId: peer.id, // added to save room as well for easier reconnection
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
            const savedData = JSON.parse(e.target.result);
            
            // Validation
            if (!savedData.players || typeof savedData.currentTurnIndex === 'undefined') {
                throw new Error("Invalid save file format.");
            }

            // Restore State
            players = savedData.players;
            currentTurnIndex = savedData.currentTurnIndex;
            
			// 2. Check for Saved Room ID
            if (savedData.roomId && savedData.roomId !== peer.id) {
				const confirmRestart = confirm("This save file contains a specific Room ID. To keep the same connection for viewers, the page will refresh. Continue?");
					if (confirmRestart) {
						// Store the ID in localStorage so the Peer constructor can find it after refresh
						localStorage.setItem('pending_room_id', savedData.roomId);
						localStorage.setItem('pending_game_state', JSON.stringify(savedData));
						location.reload(); 
						return;
					}
			}
            // Refresh the UI to show new positions and names
            updateUI();
            broadcastState();
            
            // Redraw portals in case the save file had a different map config
            if(savedData.gameConfig && savedData.gameConfig.portals) {
                // portals = loadedData.gameConfig.portals; // Uncomment if you want map to change too
                drawPortals(); 
            }

            alert("Game Loaded: Continued from " + (savedData.saveDate || "previous session"));
            
            // Reset the file input so the same file can be loaded again if needed
            event.target.value = '';
            
        } catch (err) {
            alert("Error loading file: " + err.message);
        }
    };
    reader.readAsText(file);
}

/**
 * MANUAL ROLL ENTRY
 * Allows inputting a physical dice result instead of generating a random one.
 */
function handleManualRoll() {
    const player = players[currentTurnIndex];
    if (player.rolls <= 0 || player.finished || isAnimating) return;

    // 1. Prompt for result
    const input = prompt(`Enter dice result for ${player.name} (1-6):`);
    const roll = parseInt(input);

    // 2. Validation
    if (isNaN(roll) || roll < 1 || roll > 6) {
        alert("Invalid input. Please enter a number between 1 and 6.");
        return;
    }

    // 3. Update State & UI
    isAnimating = true;
    player.rolls--;
    document.getElementById('dice-result').innerText = `🎲 ${roll}`;
    
    // 4. Sync Viewers
    broadcast({ 
        type: 'DICE_ROLL_RESULT', 
        roll: roll, 
        playerId: player.id 
    });

    // 5. Calculate Movement
    let target = player.pos + roll;
    if (target > boardSize) {
        target = boardSize - (target - boardSize);
    }
    
    player.pos = target;
    updateUI();
    broadcastState();

    // 6. Finish move after a short delay
    setTimeout(() => {
        checkPortalsAndFinish(player);
    }, 800);
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

/**
 * DEBUG: Force a win for the current player
 */
function debugWin() {
    const player = players[currentTurnIndex];
    console.log(`Debugging win for: ${player.name}`);
    
    player.pos = 64;      // Move to goal
    player.rolls = 0;     // Ensure no rolls left
    updateUI();           // Update board
    finalizeTurn(player); // Trigger win logic
}

/**
 * DEBUG: Autoplay Loop
 * Automatically rolls and dismisses modals until everyone is out of rolls.
 */
let autoplayActive = false;
let autoplayTimer = null;

function toggleAutoplay() {
    autoplayActive = !autoplayActive;
    
    if (autoplayActive) {
        console.log("🛠️ Autoplay Started...");
        runAutoplayStep();
    } else {
        console.log("🛑 Autoplay Stopped.");
        clearTimeout(autoplayTimer);
    }
}

function runAutoplayStep() {
    if (!autoplayActive) return;

    // 1. Check if anyone has rolls left
    const totalRolls = players.reduce((sum, p) => sum + (p.finished ? 0 : p.rolls), 0);
    if (totalRolls <= 0) {
        console.log("✅ Autoplay Finished: No rolls remaining.");
        autoplayActive = false;
        return;
    }

    const modal = document.getElementById('event-modal');
    const isModalVisible = !modal.classList.contains('hidden');
    const activePlayer = players[currentTurnIndex];

    // 2. Logic Branching
    if (isModalVisible) {
        // Automatically click "OK" on snakes, ladders, or win screens
        console.log("Autoplay: Dismissing Modal...");
        document.getElementById('modal-confirm-btn').click();
    } 
    else if (!isAnimating) {
        // If it is the current player's turn and they have rolls, roll the dice
        if (activePlayer.rolls > 0 && !activePlayer.finished) {
            console.log(`Autoplay: Rolling for ${activePlayer.name}...`);
            handleRollClick();
        } else {
            // If the player is finished or out of rolls, force a turn switch
            console.log("Autoplay: Switching turn...");
            nextTurn();
        }
    }

    // 3. Schedule next check (every 1 second to allow animations to play)
    autoplayTimer = setTimeout(runAutoplayStep, 1000);
}

/**
 * DEBUG: Jump to a Snake
 * Teleports the current player to the first available snake head to test choices.
 */
function debugSnake() {
    const player = players[currentTurnIndex];
    // Find all tiles that are snake heads (Start > End)
    const snakes = Object.keys(portals).filter(start => parseInt(start) > portals[start]);
    
    if (snakes.length > 0) {
        const targetSnake = parseInt(snakes[0]); // Pick the first one (e.g., 22)
        console.log(`🛠️ Debug: Moving ${player.name} to Snake at tile ${targetSnake}`);
        
        player.pos = targetSnake;
        updateUI();
        broadcastState();
        
        // Trigger the interactive logic
        checkPortalsAndFinish(player);
    } else {
        console.error("No snakes found in the portals configuration!");
    }
}

/**
 * DEBUG: Jump to a Ladder
 * Teleports the current player to the first available ladder to test automatic climbing.
 */
function debugLadder() {
    const player = players[currentTurnIndex];
    // Find all tiles that are ladders (End > Start)
    const ladders = Object.keys(portals).filter(start => portals[start] > parseInt(start));
    
    if (ladders.length > 0) {
        const targetLadder = parseInt(ladders[0]); // Pick the first one (e.g., 2)
        console.log(`🛠️ Debug: Moving ${player.name} to Ladder at tile ${targetLadder}`);
        
        player.pos = targetLadder;
        updateUI();
        broadcastState();
        
        // Trigger the automatic climb logic
        checkPortalsAndFinish(player);
    } else {
        console.error("No ladders found in the portals configuration!");
    }
}
window.onload = init;
