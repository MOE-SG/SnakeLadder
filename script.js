
/* script.js — Power Apps bridge, now honoring CSS popup buttons */
(function () {
  const qs = new URLSearchParams(location.search);
  const gameId = qs.get('gameId') || String(Date.now());
  const flowUrl = qs.get('flowUrl') || null;

  // Parse users=Alice:1:15,Bob:2:0
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

  // Parse rolls=1:2,2:3
  const rollsAllowed = {};
  (qs.get('rolls') || '')
    .split(',').map(x => x.trim()).filter(Boolean)
    .forEach(x => {
      const [pStr, rStr] = x.split(':');
      const p = Math.max(1, Math.min(4, parseInt(pStr || '1', 10)));
      const r = Math.max(0, parseInt(rStr || '0', 10));
      rollsAllowed[p] = r;
    });

  const initialTurn = Math.max(1, Math.min(4, parseInt(qs.get('turn') || '1', 10)));

  /** helpers **/
  const check   = id => { const el = document.getElementById(id); if (el) el.checked = true; };
  const uncheck = id => { const el = document.getElementById(id); if (el) el.checked = false; };

  /** create cb-pl radios so CSS movement rules work */
  const createPositionRadios = () => {
    const frag = document.createDocumentFragment();
    for (let p = 1; p <= 4; p++) {
      for (let i = 0; i <= 106; i++) {
        const input = document.createElement('input');
        input.type  = 'radio';
        input.id    = `cb-pl${p}-${i}`;
        input.className = 'cb';
        input.name  = `cb-player${p}`;
        frag.appendChild(input);
      }
    }
    document.body.insertBefore(frag, document.getElementById('game'));
  };

  /** piece visibility */
  const setPieceVisibility = (player, show) => {
    const piece = document.getElementById(`piece-player-${player}`);
    if (!piece) return;
    piece.style.display = show ? '' : 'none';
  };

  /** move piece (check proper tile radio) */
  const setPlayerPosition = (player, tile) => {
    for (let i = 0; i <= 106; i++) uncheck(`cb-pl${player}-${i}`);
    check(`cb-pl${player}-${tile}`);
    state.positions[player - 1] = tile;
    updateScoreboard();
  };

  /** board rules (edit if your board differs) */
  const snakes  = { 16: 6, 46: 25, 49: 11, 62: 19, 64: 60, 74: 53, 89: 68, 92: 88, 95: 75, 99: 80 };
  const ladders = {  2:38,  7:14,  8:31, 15:26, 21:42, 28:84, 36:44, 51:67, 71:91, 78:98, 87:94 };
  const HOME = 100;

  /** state */
  const state = {
    gameId,
    players: [],
    positions: [0,0,0,0],
    rollsRemaining: {1:0,2:0,3:0,4:0},
    turn: initialTurn,
    pendingMove: null // {type:'ladder'|'snake'|'home', player, fromTile, toTile}
  };

  /** scoreboard */
  const updateScoreboard = () => {
    const el = document.getElementById('scoreboard');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = `
      <div style="background:#fff;border:1px solid #ccc;border-radius:4px;padding:.5rem;max-width:420px;">
        <strong>Game ${state.gameId}</strong><br/>
        ${state.players.map(u => {
          const pos = state.positions[u.player - 1];
          const turnTxt = (u.player === state.turn) ? ` (turn, rolls left: ${state.rollsRemaining[u.player] || 0})` : '';
          return `<div>• ${u.name} (P${u.player}) — Tile ${pos}${turnTxt}</div>`;
        }).join('')}
      </div>
    `;
  };

  /** turn & dice gate */
  const gateDiceUI = () => {
    const diceLabel = document.getElementById('diceLabel');
    if (!diceLabel) return;
    const r = state.rollsRemaining[state.turn] || 0;
    const blocked = !!state.pendingMove || r <= 0;
    diceLabel.style.pointerEvents = blocked ? 'none' : 'auto';
    diceLabel.style.opacity       = blocked ? '0.5' : '1';
    diceLabel.setAttribute('title', blocked
      ? (state.pendingMove ? 'Resolve popup first' : 'No rolls remaining')
      : `Rolls left: ${r}`);
  };

  const setTurn = (p) => {
    const t = Math.max(1, Math.min(4, parseInt(p, 10)));
    check(`turn${t}`);
    state.turn = t;
    state.rollsRemaining[t] = (typeof rollsAllowed[t] === 'number')
      ? rollsAllowed[t]
      : ((Object.keys(rollsAllowed).length > 0) ? 0 : 1);
    gateDiceUI();
    updateScoreboard();
  };

  /** roll */
  const rollDice = async () => {
    if (state.pendingMove) return; // wait until popup confirmed
    const p = state.turn;
    const remaining = state.rollsRemaining[p] || 0;
    if (remaining <= 0) return;

    const roll = Math.floor(Math.random() * 6) + 1;
    let next = state.positions[p - 1] + roll;

    // bounce if overshoot
    if (next > HOME) {
      // Place on HOME first so CSS can show #home-popup (for radios like -101..-106 in your CSS)
      // We’ll then wait for confirm to bounce back.
      const overshoot = next - HOME;
      setPlayerPosition(p, HOME);
      state.pendingMove = {
        type: 'home',
        player: p,
        fromTile: HOME,
        toTile: HOME - overshoot
      };
      afterRollLog(p, roll, state.positions[p - 1]); // optional log
      gateDiceUI();
      return;
    }

    // If ladder/snake tile: place on trigger tile and wait for popup confirm
    if (ladders[next]) {
      setPlayerPosition(p, next);
      state.pendingMove = { type: 'ladder', player: p, fromTile: next, toTile: ladders[next] };
      afterRollLog(p, roll, state.positions[p - 1]);
      gateDiceUI();
      return;
    }
    if (snakes[next]) {
      setPlayerPosition(p, next);
      state.pendingMove = { type: 'snake', player: p, fromTile: next, toTile: snakes[next] };
      afterRollLog(p, roll, state.positions[p - 1]);
      gateDiceUI();
      return;
    }

    // Normal move (no popup)
    setPlayerPosition(p, next);
    state.rollsRemaining[p] = Math.max(0, remaining - 1);
    afterRollLog(p, roll, next);
    gateDiceUI();
  };

  /** (optional) log to flow */
  const afterRollLog = async (player, roll, position) => {
    if (!flowUrl) return;
    try {
      await fetch(flowUrl, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          gameId: state.gameId,
          player, roll, position,
          positions: state.positions,
          timestamp: new Date().toISOString()
        })
      });
    } catch(e) { console.error('Flow POST failed', e); }
  };

  /** init users/colors */
  const initUsers = () => {
    for (let p = 1; p <= 4; p++) setPieceVisibility(p, false);

    parsedUsers.forEach(u => {
      setPieceVisibility(u.player, true);
      setPlayerPosition(u.player, u.tile);
      state.players.push({ name: u.name, player: u.player, tile: u.tile });
    });

    if (state.players.length > 0) check('game-time');

    const colors = Math.max(1, Math.min(4, parseInt(qs.get('colors') || '1', 10)));
    check(`colors${colors}`);

    [1,2,3,4].forEach(p => {
      state.rollsRemaining[p] = (typeof rollsAllowed[p] === 'number') ? rollsAllowed[p] : 0;
    });
    updateScoreboard();
  };

  /** popup button handlers */
  const bindPopupButtons = () => {
    // Ladder
    document.getElementById('btnLadderConfirm')?.addEventListener('click', () => {
      if (state.pendingMove?.type !== 'ladder') return;
      const { player, toTile } = state.pendingMove;
      setPlayerPosition(player, toTile);
      state.pendingMove = null;
      // consume one roll
      state.rollsRemaining[player] = Math.max(0, (state.rollsRemaining[player] || 1) - 1);
      gateDiceUI();
    });
    document.getElementById('btnLadderCancel')?.addEventListener('click', () => {
      // Keep on ladder bottom; clear pendingMove
      state.pendingMove = null;
      gateDiceUI();
    });

    // Snake
    document.getElementById('btnSnakeConfirm')?.addEventListener('click', () => {
      if (state.pendingMove?.type !== 'snake') return;
      const { player, toTile } = state.pendingMove;
      setPlayerPosition(player, toTile);
      state.pendingMove = null;
      state.rollsRemaining[player] = Math.max(0, (state.rollsRemaining[player] || 1) - 1);
      gateDiceUI();
    });
    document.getElementById('btnSnakeCancel')?.addEventListener('click', () => {
      state.pendingMove = null;
      gateDiceUI();
    });

    // Home bounce
    document.getElementById('btnHomeConfirm')?.addEventListener('click', () => {
      if (state.pendingMove?.type !== 'home') return;
      const { player, toTile } = state.pendingMove;
      setPlayerPosition(player, toTile);
      state.pendingMove = null;
      state.rollsRemaining[player] = Math.max(0, (state.rollsRemaining[player] || 1) - 1);
      gateDiceUI();
    });
    document.getElementById('btnHomeCancel')?.addEventListener('click', () => {
      state.pendingMove = null;
      gateDiceUI();
    });
  };

  /** public API (optional postMessage scenarios) */
  window.GameBridge = {
    setTurn,
    setPlayerPosition,
    rollDice,
    getState: () => state
  };

  /** wire dice label */
  document.getElementById('diceLabel')?.addEventListener('click', () => rollDice());

  /** bootstrap */
  window.addEventListener('DOMContentLoaded', () => {
    createPositionRadios();
    initUsers();
    bindPopupButtons();
    setTurn(initialTurn);
  });
})();

