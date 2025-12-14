
/* script.js — Bridge to control the CSS-only Snake & Ladders from Power Apps */
(function () {
  const qs = new URLSearchParams(location.search);
  const gameId = qs.get('gameId') || String(Date.now());
  const flowUrl = qs.get('flowUrl') || null; // optional: POST here to log rolls via Power Automate

  // Parse "users=Alice:1:15,Bob:2:0"
  const usersParam = qs.get('users') || '';
  const parsedUsers = usersParam
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
    .map(x => {
      const [name, playerStr, tileStr] = x.split(':');
      return {
        name: name || `P${playerStr}`,
        player: Math.max(1, Math.min(4, parseInt(playerStr || '1', 10))),
        tile: Math.max(0, Math.min(106, parseInt(tileStr || '0', 10)))
      };
    });

  // Parse "rolls=1:2,2:3"
  const rollsAllowed = {};
  (qs.get('rolls') || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
    .forEach(x => {
      const [pStr, rStr] = x.split(':');
      const p = Math.max(1, Math.min(4, parseInt(pStr || '1', 10)));
      const r = Math.max(0, parseInt(rStr || '0', 10));
      rollsAllowed[p] = r;
    });

  const initialTurn = Math.max(1, Math.min(4, parseInt(qs.get('turn') || '1', 10)));

  /** ---- helpers ---- **/
  const check = id => { const el = document.getElementById(id); if (el) el.checked = true; };
  const uncheck = id => { const el = document.getElementById(id); if (el) el.checked = false; };

  /** create the cb-pl{p}-{i} radios so CSS movement rules work */
  const createPositionRadios = () => {
    const container = document.createDocumentFragment();
    for (let p = 1; p <= 4; p++) {
      for (let i = 0; i <= 106; i++) {
        const input = document.createElement('input');
        input.type = 'radio';
        input.id = `cb-pl${p}-${i}`;
        input.className = 'cb';
        // name per player so only one tile is active per player
        input.name = `cb-player${p}`;
        container.appendChild(input);
      }
    }
    // insert radios before the #game element so "~ #game ..." selectors apply
    const body = document.body;
    const gameEl = document.getElementById('game');
    body.insertBefore(container, gameEl);
  };

  /** show/hide the SVG piece for a player */
  const setPieceVisibility = (player, show) => {
    const piece = document.getElementById(`piece-player-${player}`);
    if (!piece) return;
    piece.style.display = show ? '' : 'none';
  };

  /** move a player's piece by checking #cb-pl{p}-{tile} */
  const setPlayerPosition = (player, tile) => {
    for (let i = 0; i <= 106; i++) uncheck(`cb-pl${player}-${i}`);
    check(`cb-pl${player}-${tile}`);
    state.positions[player - 1] = tile;
    updateScoreboard();
  };

  /** snakes & ladders (edit if your board differs) */
  const snakes  = { 16: 6, 46: 25, 49: 11, 62: 19, 64: 60, 74: 53, 89: 68, 92: 88, 95: 75, 99: 80 };
  const ladders = {  2:38,  7:14,  8:31, 15:26, 21:42, 28:84, 36:44, 51:67, 71:91, 78:98, 87:94 };
  const HOME = 100;
  const applyBoardRules = t => ladders[t] || snakes[t] || t;

  /** gate dice based on rollsRemaining for current player */
  const gateDiceUI = () => {
    const diceTab = document.querySelector('#game .tab#dice');
    if (!diceTab) return;
    const r = state.rollsRemaining[state.turn] || 0;
    diceTab.style.pointerEvents = r > 0 ? 'auto' : 'none';
    diceTab.style.opacity       = r > 0 ? '1'    : '0.5';
    diceTab.dataset.rollsLeft   = String(r);
    diceTab.setAttribute('title', r > 0 ? `Rolls left: ${r}` : 'No rolls remaining');
  };

  /** set active turn (#turn1..#turn4) and set allowance */
  const setTurn = (p) => {
    const t = Math.max(1, Math.min(4, parseInt(p, 10)));
    check(`turn${t}`);
    state.turn = t;
    // when "rolls" was provided, unspecified players get 0; otherwise default 1
    state.rollsRemaining[t] = (typeof rollsAllowed[t] === 'number') ? rollsAllowed[t] : ((Object.keys(rollsAllowed).length > 0) ? 0 : 1);
    gateDiceUI();
    updateScoreboard();
  };

  /** roll dice for current player */
  const rollDice = async () => {
    const p = state.turn;
    const remaining = state.rollsRemaining[p] || 0;
    if (remaining <= 0) return;

    const roll = Math.floor(Math.random() * 6) + 1;
    let next = state.positions[p - 1] + roll;

    if (next > HOME) next = HOME - (next - HOME); // bounce
    next = applyBoardRules(next);
    setPlayerPosition(p, next);

    state.rollsRemaining[p] = Math.max(0, remaining - 1);
    gateDiceUI();
    updateScoreboard();

    // optional: log to Power Automate HTTP endpoint
    if (flowUrl) {
      try {
        await fetch(flowUrl, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            gameId, player: p, roll, position: next,
            positions: state.positions, timestamp: new Date().toISOString()
          })
        });
      } catch (e) { console.error('Flow POST failed', e); }
    }
  };

  /** small scoreboard (top-right) */
  const updateScoreboard = () => {
    const el = document.getElementById('scoreboard');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = `
      <div style="background:#fff;border:1px solid #ccc;border-radius:4px;padding:.5rem;max-width:420px;">
        <strong>Game ${state.gameId}</strong><br/>
        ${state.players.map(u => {
          const pos = state.positions[u.player - 1];
          const turns = (u.player === state.turn) ? ` (turn, rolls left: ${state.rollsRemaining[u.player] || 0})` : '';
          return `<div>• ${u.name} (P${u.player}) — Tile ${pos}${turns}</div>`;
        }).join('')}
      </div>
    `;
  };

  /** init players/colors and positions from querystring */
  const initUsers = () => {
    // hide all pieces first
    for (let p = 1; p <= 4; p++) setPieceVisibility(p, false);

    parsedUsers.forEach(u => {
      setPieceVisibility(u.player, true);
      setPlayerPosition(u.player, u.tile);
      state.players.push({ name: u.name, player: u.player, tile: u.tile });
    });

    // show game area once users exist
    if (state.players.length > 0) check('game-time');

    // color scheme (choose one)
    const colors = Math.max(1, Math.min(4, parseInt(qs.get('colors') || '1', 10)));
    check(`colors${colors}`);

    // initialize allowances: supplied => value, others => 0
    [1,2,3,4].forEach(p => {
      state.rollsRemaining[p] = (typeof rollsAllowed[p] === 'number') ? rollsAllowed[p] : 0;
    });
    updateScoreboard();
  };

  /** public API if you want to send messages with postMessage */
  const state = {
    gameId,
    players: [],
    positions: [0,0,0,0],
    rollsRemaining: {1:0,2:0,3:0,4:0},
    turn: initialTurn
  };

  window.GameBridge = {
    setTurn,                // GameBridge.setTurn(3)
    setPlayerPosition,      // GameBridge.setPlayerPosition(2, 42)
    rollDice,               // Programmatic roll (enforces gate)
    getState: () => state
  };

  /** wire dice tab click */
  document.querySelector('#game .tab#dice')?.addEventListener('click', () => rollDice());

  /** bootstrap */
  window.addEventListener('DOMContentLoaded', () => {
    createPositionRadios();
    initUsers();
    setTurn(initialTurn);
  });
})();
