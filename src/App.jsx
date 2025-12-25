import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Users, Swords, Trophy, Zap, Share2, Copy, Check, Link as LinkIcon, Bomb, RotateCcw, MessageSquare, Home } from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, update, get, child, remove } from "firebase/database";

// ============================================================================
// 🔴 CONFIGURAÇÃO DO FIREBASE
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyAN6oV7_cXKJQTn1BOm3WX_bmhzS1GNDlM",
  authDomain: "ontheblastgame.firebaseapp.com",
  databaseURL: "https://ontheblastgame-default-rtdb.firebaseio.com",
  projectId: "ontheblastgame",
  storageBucket: "ontheblastgame.firebasestorage.app",
  messagingSenderId: "996058726356",
  appId: "1:996058726356:web:b50500f2347eecd9d4a041",
};

let db;
try {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (e) {
  console.log("Modo Offline / Firebase Erro");
}

// ============================================================================
// CONSTANTES
// ============================================================================
const GRID_SIZE = 8;
const CELL_SIZE = 40;
const MAX_PLAYERS = 3;

// Cores Neon Vibrantes
const COLORS = [
  '#FF0055', '#00FF99', '#00CCFF', '#FFAA00', '#CC00FF', '#FFFF00'
];

const PIECES_BY_LEVEL = {
  1: [[[1]], [[1, 1]], [[1], [1]], [[1, 1], [1, 1]]],
  2: [[[1, 1, 1]], [[1], [1], [1]], [[1, 1], [1, 0]], [[1, 1], [0, 1]]],
  3: [[[1, 1, 1], [0, 1, 0]], [[1, 1, 1], [1, 0, 0]], [[1, 1, 0], [0, 1, 1]]],
  4: [[[1, 1, 1], [1, 1, 1], [1, 1, 1]], [[1, 1, 1, 1]], [[1], [1], [1], [1]]],
  5: [[[1, 0, 0], [1, 0, 0], [1, 1, 1]], [[0, 0, 1], [0, 0, 1], [1, 1, 1]]]
};

const BlockBlastGame = () => {
  // Estados
  const [screen, setScreen] = useState('menu');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [playerId] = useState(`player_${Math.random().toString(36).substr(2, 9)}`);
  
  // Jogo
  const [grid, setGrid] = useState(Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)));
  const [pieces, setPieces] = useState([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [bombs, setBombs] = useState(0);
  const [lastBonusScore, setLastBonusScore] = useState(0);
  
  // Drag & Drop
  const [draggingPiece, setDraggingPiece] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [hoverCell, setHoverCell] = useState(null);
  
  // Multiplayer
  const [playerName, setPlayerName] = useState('');
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [activeRoomCode, setActiveRoomCode] = useState('');
  const [playersData, setPlayersData] = useState({});
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  
  // Refs
  const inactivityTimer = useRef(null);
  const audioContextRef = useRef(null);
  // Refs para Drag Logic (Para evitar closures antigos nos event listeners)
  const draggingPieceRef = useRef(null);
  const gridRef = useRef(grid);

  // Atualiza ref do grid sempre que mudar (para o drop saber onde pode soltar)
  useEffect(() => { gridRef.current = grid; }, [grid]);

  // Inicialização Audio
  useEffect(() => {
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContextRef.current = new window.AudioContext();
    resetInactivityTimer();
    
    // Listeners Globais para detectar inatividade
    const reset = () => resetInactivityTimer();
    window.addEventListener('keydown', reset);
    window.addEventListener('click', reset);
    window.addEventListener('touchstart', reset);

    return () => {
      clearTimeout(inactivityTimer.current);
      window.removeEventListener('keydown', reset);
      window.removeEventListener('click', reset);
      window.removeEventListener('touchstart', reset);
    };
  }, []);

  // Garantia de Peças
  useEffect(() => {
    if (screen === 'game' && !gameOver && pieces.length === 0) {
        setPieces(generatePieces());
    }
  }, [screen, pieces, gameOver]);

  // --- LÓGICA DE ARRASTAR CORRIGIDA (EVENTOS DIRETOS) ---
  
  const onDragStart = (e, piece) => {
    // Previne comportamento padrão (scroll)
    if (e.cancelable && e.type === 'touchstart') e.preventDefault();
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // Atualiza Estado e Ref
    setDraggingPiece(piece);
    draggingPieceRef.current = piece;
    setDragPos({ x: clientX, y: clientY });

    // Adiciona Listeners na Janela (Global)
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('touchmove', onDragMove, { passive: false });
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchend', onDragEnd);
  };

  const onDragMove = (e) => {
    if (!draggingPieceRef.current) return;
    
    // Previne scroll durante o arrasto
    if(e.cancelable) e.preventDefault();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    setDragPos({ x: clientX, y: clientY });
    
    // Detecção de Hover (Onde vai cair)
    const elements = document.elementsFromPoint(clientX, clientY);
    const cellEl = elements.find(el => el.getAttribute('data-row'));
    
    if (cellEl) {
      setHoverCell({ 
          r: parseInt(cellEl.getAttribute('data-row')), 
          c: parseInt(cellEl.getAttribute('data-col')) 
      });
    } else {
      setHoverCell(null);
    }
  };

  const onDragEnd = (e) => {
    // Remove listeners
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('touchmove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
    window.removeEventListener('touchend', onDragEnd);

    // Tenta soltar a peça
    // Usamos refs aqui para garantir estado atualizado dentro do listener
    if (draggingPieceRef.current) {
        // Logica de soltar baseada no hoverCell atual (precisamos pegar do estado ou recalcular)
        // Como o setHoverCell é assíncrono, recalculamos rapidinho baseada na ultima posição
        const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
        const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
        
        const elements = document.elementsFromPoint(clientX, clientY);
        const cellEl = elements.find(el => el.getAttribute('data-row'));
        
        if (cellEl) {
            const r = parseInt(cellEl.getAttribute('data-row'));
            const c = parseInt(cellEl.getAttribute('data-col'));
            attemptPlacePiece(draggingPieceRef.current, r, c);
        }
    }

    setDraggingPiece(null);
    draggingPieceRef.current = null;
    setHoverCell(null);
  };

  const attemptPlacePiece = (piece, r, c) => {
      // Usa gridRef.current para ter certeza que é o grid atual
      if (canPlacePiece(piece, r, c, gridRef.current)) {
          placePiece(piece, r, c);
      }
  };

  // --- LÓGICA DO JOGO ---
  
  const canPlacePiece = (piece, row, col, currentGrid = grid) => {
    if (!piece) return false;
    const offsetR = Math.floor(piece.shape.length / 2);
    const offsetC = Math.floor(piece.shape[0].length / 2);
    const startR = row - offsetR;
    const startC = col - offsetC;

    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (piece.shape[r][c]) {
          const nr = startR + r;
          const nc = startC + c;
          if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) return false;
          if (currentGrid[nr][nc]) return false;
        }
      }
    }
    return { startR, startC };
  };

  const placePiece = (piece, row, col) => {
    const check = canPlacePiece(piece, row, col, grid);
    if (!check) return;
    const { startR, startC } = check;

    const newGrid = grid.map(r => [...r]);
    piece.shape.forEach((rowArr, r) => {
      rowArr.forEach((val, c) => {
        if (val) newGrid[startR + r][startC + c] = piece.color;
      });
    });

    // Remove peça da mão
    const remainingPieces = pieces.filter(p => p.id !== piece.id);
    
    // Check Linhas
    let lines = 0;
    const clearedGrid = newGrid.map(r => [...r]);
    for(let i=0; i<GRID_SIZE; i++) {
        if(clearedGrid[i].every(c=>c)) { clearedGrid[i].fill(null); lines++; }
        if(clearedGrid.every(r=>r[i])) { for(let r=0; r<GRID_SIZE; r++) clearedGrid[r][i]=null; lines++; }
    }

    setGrid(clearedGrid);
    
    if (lines > 0) {
        playSound('clear');
        const newCombo = combo + 1;
        setCombo(newCombo);
        if(newCombo === 2) speak("Bom!");
        if(newCombo >= 3) speak("Incrível!");
        
        const points = lines * 100 * newCombo;
        const newScore = score + points;
        setScore(newScore);

        if (newScore >= lastBonusScore + 2000) {
            setBombs(b => b + 1);
            setLastBonusScore(s => s + 2000);
            speak("Bomba!");
        }
    } else {
        setCombo(0);
    }

    if (remainingPieces.length === 0) setPieces(generatePieces());
    else setPieces(remainingPieces);
  };

  // --- AUDIO ---
  const resetInactivityTimer = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if(audioContextRef.current && audioContextRef.current.suspenseOsc) {
       audioContextRef.current.suspenseOsc.stop();
       audioContextRef.current.suspenseOsc = null;
    }
    inactivityTimer.current = setTimeout(() => {
        if(screen === 'game' && !gameOver) playSound('suspense');
    }, 5000);
  };

  const speak = (text) => {
    if (!soundEnabled || !window.speechSynthesis) return;
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = 'pt-BR';
    ut.rate = 1.2;
    window.speechSynthesis.speak(ut);
  };

  const playSound = (type) => {
    if (!soundEnabled) return;
    const ctx = audioContextRef.current;
    if(!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    const now = ctx.currentTime;

    switch (type) {
      case 'clear':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
        break;
      case 'bomb':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.5);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
        break;
      case 'suspense':
        if(ctx.suspenseOsc) return;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(50, now);
        gain.gain.value = 0.1;
        osc.start();
        ctx.suspenseOsc = osc;
        break;
    }
  };

  const generatePieces = () => {
    const lvl = Math.min(5, Math.floor(score / 1000) + 1);
    const avail = PIECES_BY_LEVEL[lvl] || PIECES_BY_LEVEL[1];
    return Array(3).fill(0).map((_, i) => ({
      shape: avail[Math.floor(Math.random() * avail.length)],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      id: Date.now() + i
    }));
  };

  const startGame = (mode) => {
    setGrid(Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)));
    setPieces(generatePieces());
    setScore(0);
    setCombo(0);
    setBombs(0);
    setLastBonusScore(0);
    setGameOver(false);
    
    if (mode === 'online' && activeRoomCode) {
        updatePlayerStatus(0, Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)));
    } else {
        setScreen('game');
    }
  };

  const useBomb = () => {
    if (bombs <= 0) return;
    playSound('bomb');
    setBombs(b => b - 1);
    alert("💣 BOMBA LANÇADA!");

    if (activeRoomCode && db) {
        const opponents = Object.keys(playersData).filter(id => id !== playerId);
        opponents.forEach(oppId => {
            const oppGridStr = playersData[oppId].grid;
            if(!oppGridStr) return;
            try {
                const oppGrid = JSON.parse(oppGridStr);
                for(let i=0; i<5; i++){
                    const r = Math.floor(Math.random()*GRID_SIZE);
                    const c = Math.floor(Math.random()*GRID_SIZE);
                    oppGrid[r][c] = null;
                }
                update(ref(db, `rooms/${activeRoomCode}/players/${oppId}`), { grid: JSON.stringify(oppGrid) });
            } catch(e){}
        });
    } else {
        const newGrid = [...grid];
        const r = Math.floor(Math.random()*(GRID_SIZE-2));
        const c = Math.floor(Math.random()*(GRID_SIZE-2));
        for(let i=0; i<3; i++) for(let j=0; j<3; j++) newGrid[r+i][c+j] = null;
        setGrid(newGrid);
    }
  };

  useEffect(() => {
    if(screen !== 'game' || gameOver || pieces.length === 0) return;
    const canMove = pieces.some(p => {
        for(let r=0; r<GRID_SIZE; r++) for(let c=0; c<GRID_SIZE; c++) {
            if(canPlacePiece(p, r, c, grid)) return true;
        }
        return false;
    });
    if(!canMove) {
        setGameOver(true);
        speak("Fim de jogo");
    }
  }, [pieces, grid, screen]);

  // --- MULTIPLAYER ---
  useEffect(() => {
    if (activeRoomCode && db && screen === 'game') {
        updatePlayerStatus(score, grid);
    }
  }, [score, grid, activeRoomCode]);

  const updatePlayerStatus = (currentScore, currentGrid) => {
      update(ref(db, `rooms/${activeRoomCode}/players/${playerId}`), {
          name: playerName, score: currentScore, grid: JSON.stringify(currentGrid)
      });
  };

  const copyInviteLink = () => {
    const baseUrl = window.location.origin + window.location.pathname;
    const url = `${baseUrl}?room=${activeRoomCode}`;
    navigator.clipboard.writeText(url).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
    }).catch(() => prompt("Copie o link:", url));
  };

  const joinRoom = async () => {
    if(!db) return alert("Erro: Firebase");
    if(!playerName) return alert("Nome?");
    if(!inputRoomCode) return alert("Código?");

    const code = inputRoomCode.toUpperCase();
    const roomRef = ref(db, `rooms/${code}`);
    const snapshot = await get(roomRef);
    
    let currentPlayers = {};
    if(snapshot.exists()) currentPlayers = snapshot.val().players || {};

    if(Object.keys(currentPlayers).length >= MAX_PLAYERS) return alert("Sala cheia");

    await set(ref(db, `rooms/${code}/players/${playerId}`), {
        name: playerName, score: 0, 
        grid: JSON.stringify(Array(GRID_SIZE).fill(null).map(()=>Array(GRID_SIZE).fill(null)))
    });

    setActiveRoomCode(code);
    setScreen('waitingRoom');
  };

  useEffect(() => {
    if(!activeRoomCode || !db) return;
    const unsub = onValue(ref(db, `rooms/${activeRoomCode}`), (snap) => {
        const data = snap.val();
        if(!data) { setScreen('menu'); setActiveRoomCode(''); return; }
        if(data.players) setPlayersData(data.players);
        if(data.chat) setChatMessages(Object.values(data.chat));
    });
    return () => unsub();
  }, [activeRoomCode]);

  const sendChat = () => {
      if(!chatInput.trim() || !activeRoomCode) return;
      set(child(ref(db, `rooms/${activeRoomCode}/chat`), `${Date.now()}`), { player: playerName, text: chatInput });
      setChatInput('');
  };

  // --- COMPONENTE VISUAL DA PEÇA ---
  const RenderPiece = ({ piece, isDragging }) => (
    <div 
        className={`grid gap-1 p-2 ${isDragging ? 'scale-110 opacity-90' : 'cursor-grab hover:scale-105'}`}
        style={{ 
            gridTemplateColumns: `repeat(${piece.shape[0].length}, 20px)`,
            touchAction: 'none' // CRÍTICO: Previne scroll no mobile
        }}
        onMouseDown={(e) => onDragStart(e, piece)}
        onTouchStart={(e) => onDragStart(e, piece)}
    >
        {piece.shape.map((row, i) => row.map((cell, j) => (
            <div key={`${i}-${j}`} 
                 style={{
                     width: 20, height: 20,
                     backgroundColor: cell ? piece.color : 'transparent',
                     boxShadow: cell ? 'inset 2px 2px 2px rgba(255,255,255,0.4), inset -2px -2px 2px rgba(0,0,0,0.2), 2px 2px 0px rgba(0,0,0,0.3)' : 'none',
                     borderRadius: '4px'
                 }} 
            />
        )))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans select-none overflow-hidden touch-none">
      
      {/* MENU */}
      {screen === 'menu' && (
        <div className="flex flex-col items-center justify-center h-screen p-4 space-y-6 animate-float">
            <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500">BLOCK BLAST</h1>
            <div className="flex gap-4 w-full max-w-md flex-col">
                <button onClick={() => setScreen('onlineInput')} className="bg-blue-600 hover:bg-blue-500 p-4 rounded-xl font-bold text-xl shadow-[0_4px_0_rgb(0,0,100)] active:translate-y-1 transition-all flex justify-center gap-2"><Share2/> Jogar Online</button>
                <button onClick={() => startGame('local')} className="bg-green-600 hover:bg-green-500 p-4 rounded-xl font-bold text-xl shadow-[0_4px_0_rgb(0,50,0)] active:translate-y-1 transition-all flex justify-center gap-2"><Trophy/> Modo Solo</button>
            </div>
        </div>
      )}

      {/* INPUT SALA */}
      {screen === 'onlineInput' && (
          <div className="flex flex-col items-center justify-center h-screen p-4 space-y-4">
              <h2 className="text-3xl font-bold">Multiplayer</h2>
              <input type="text" placeholder="Seu Nome" value={playerName} onChange={e=>setPlayerName(e.target.value)} className="p-3 rounded-lg text-black font-bold text-center w-64" />
              <div className="flex gap-2">
                  <input type="text" placeholder="CÓDIGO SALA" value={inputRoomCode} onChange={e=>setInputRoomCode(e.target.value.toUpperCase())} className="p-3 rounded-lg text-black font-bold text-center w-32 uppercase" />
                  <button onClick={joinRoom} className="bg-purple-600 p-3 rounded-lg font-bold">ENTRAR</button>
              </div>
              <button onClick={()=>setScreen('menu')} className="text-gray-400">Voltar</button>
          </div>
      )}

      {/* SALA DE ESPERA */}
      {screen === 'waitingRoom' && (
          <div className="flex flex-col items-center justify-center h-screen p-4 space-y-6">
              <h2 className="text-4xl font-bold text-green-400">Sala: {activeRoomCode}</h2>
              <div className="bg-slate-800 p-6 rounded-2xl w-full max-w-md">
                  <h3 className="text-xl mb-4 border-b border-gray-600 pb-2">Jogadores ({Object.keys(playersData).length}/3)</h3>
                  {Object.values(playersData).map((p, i) => (
                      <div key={i} className="flex justify-between items-center py-2">
                          <span>{p.name}</span> <span className="text-yellow-400">Pronto</span>
                      </div>
                  ))}
              </div>
              
              {/* LINK DE COMPARTILHAR - RESTAURADO E VISÍVEL */}
              <button onClick={copyInviteLink} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2 transition-all">
                  {copiedLink ? <Check size={20}/> : <LinkIcon size={20}/>} 
                  {copiedLink ? 'Link Copiado!' : 'Copiar Link da Sala'}
              </button>

              <button onClick={() => setScreen('game')} className="bg-yellow-500 text-black px-8 py-4 rounded-xl font-black text-xl shadow-[0_4px_0_rgb(100,50,0)] hover:scale-105 transition">COMEÇAR</button>
          </div>
      )}

      {/* JOGO */}
      {screen === 'game' && (
        <div className="h-screen flex flex-col p-2 max-w-6xl mx-auto">
            <div className="flex justify-between items-center bg-slate-800 p-3 rounded-xl mb-2 shadow-lg border-b-4 border-slate-950">
                <div><div className="text-xs text-gray-400">SCORE</div><div className="text-2xl font-black text-yellow-400">{score}</div></div>
                <div className="flex gap-4">
                    <button onClick={useBomb} disabled={bombs===0} className={`flex flex-col items-center p-2 rounded-lg ${bombs>0 ? 'bg-red-600 shadow-[0_0_15px_red]' : 'bg-gray-700 opacity-50'}`}><Bomb size={24} color="white" /><span className="text-xs font-bold">{bombs}</span></button>
                    <button onClick={() => { setScreen('menu'); if(activeRoomCode) remove(ref(db, `rooms/${activeRoomCode}/players/${playerId}`)); }} className="bg-red-500 px-3 py-1 rounded font-bold text-xs h-8">SAIR</button>
                </div>
            </div>

            <div className="flex flex-1 gap-4 overflow-hidden">
                <div className="flex-1 flex flex-col items-center justify-center relative">
                    {/* TABULEIRO */}
                    <div className="relative bg-slate-800 p-2 rounded-lg shadow-2xl border-4 border-slate-700" style={{ width: 'fit-content' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL_SIZE}px)`, gap: '2px' }}>
                            {grid.map((row, r) => row.map((cell, c) => (
                                <div key={`${r}-${c}`} data-row={r} data-col={c}
                                     style={{
                                         width: CELL_SIZE, height: CELL_SIZE,
                                         backgroundColor: cell || '#1e293b',
                                         borderRadius: '4px',
                                         boxShadow: cell ? 'inset 3px 3px 2px rgba(255,255,255,0.3), 3px 3px 0px rgba(0,0,0,0.4)' : 'inset 1px 1px 4px rgba(0,0,0,0.5)',
                                         // PREVIEW
                                         backgroundColor: (draggingPiece && hoverCell && canPlacePiece(draggingPiece, hoverCell.r, hoverCell.c) && 
                                            r >= (hoverCell.r - Math.floor(draggingPiece.shape.length/2)) && 
                                            r < (hoverCell.r - Math.floor(draggingPiece.shape.length/2) + draggingPiece.shape.length) &&
                                            c >= (hoverCell.c - Math.floor(draggingPiece.shape[0].length/2)) &&
                                            c < (hoverCell.c - Math.floor(draggingPiece.shape[0].length/2) + draggingPiece.shape[0].length) &&
                                            draggingPiece.shape[r - (hoverCell.r - Math.floor(draggingPiece.shape.length/2))][c - (hoverCell.c - Math.floor(draggingPiece.shape[0].length/2))])
                                            ? 'rgba(255,255,255,0.2)' 
                                            : (cell || '#1e293b')
                                     }}
                                />
                            )))}
                        </div>
                    </div>
                    {/* PEÇAS */}
                    <div className="mt-4 flex gap-6 min-h-[100px] items-center justify-center bg-slate-800/50 w-full rounded-xl p-2">
                        {pieces.map(p => <RenderPiece key={p.id} piece={p} isDragging={false} />)}
                    </div>
                    {/* DRAG GHOST */}
                    {draggingPiece && (
                        <div style={{ position: 'fixed', left: dragPos.x, top: dragPos.y, pointerEvents: 'none', transform: 'translate(-50%, -50%)', zIndex: 100 }}>
                            <RenderPiece piece={draggingPiece} isDragging={true} />
                        </div>
                    )}
                </div>

                {activeRoomCode && (
                    <div className="w-1/3 bg-slate-800 rounded-xl p-2 flex flex-col gap-2">
                        <div className="flex-1 overflow-y-auto space-y-2">
                            {Object.entries(playersData).filter(([id]) => id !== playerId).map(([id, p]) => (
                                <div key={id} className="bg-slate-700 p-2 rounded-lg">
                                    <div className="flex justify-between text-xs font-bold mb-1"><span className="truncate w-16">{p.name}</span><span className="text-yellow-400">{p.score}</span></div>
                                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_SIZE}, 6px)`, gap: '1px' }}>
                                        {p.grid && JSON.parse(p.grid).map((row, r) => row.map((c, k) => (
                                            <div key={k} style={{ width:6, height:6, backgroundColor: c || '#334155', borderRadius:1 }} />
                                        )))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* CHAT COM COR BRANCA */}
                        <div className="bg-slate-900 rounded-lg p-2 h-1/3 flex flex-col">
                            <div className="flex-1 overflow-y-auto text-[10px] mb-1 text-white">
                                {chatMessages.map((m, i) => (
                                    <div key={i}><b className="text-blue-400">{m.player}:</b> {m.text}</div>
                                ))}
                            </div>
                            <div className="flex gap-1">
                                <input className="w-full text-black rounded px-1 text-xs" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter' && sendChat()} />
                                <button onClick={sendChat} className="bg-blue-500 px-2 rounded text-xs">></button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {gameOver && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 animate-in fade-in">
                    <h2 className="text-5xl font-black text-red-500 mb-4">GAME OVER</h2>
                    <p className="text-2xl text-white mb-8">Score: {score}</p>
                    <button onClick={() => startGame(activeRoomCode ? 'online' : 'local')} className="bg-green-500 hover:bg-green-600 text-white px-8 py-4 rounded-xl font-bold text-xl flex items-center gap-2">
                        <RotateCcw /> REINICIAR (0 Pts)
                    </button>
                </div>
            )}
        </div>
      )}
    </div>
  );
};

export default BlockBlastGame;