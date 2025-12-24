import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Users, Swords, Trophy, Zap, Share2, Copy, Check, Link as LinkIcon, Bomb, RotateCcw, MessageSquare } from 'lucide-react';
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
  storageBucket:  "ontheblastgame.firebasestorage.app",
  messagingSenderId: "996058726356",
  appId: "1:996058726356:web:b50500f2347eecd9d4a041"
};


let db;
try {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (e) {
  console.log("Modo Offline / Firebase Erro");
}

// ============================================================================
// CONSTANTES E DADOS
// ============================================================================
const GRID_SIZE = 8;
const CELL_SIZE = 40;
const MAX_PLAYERS = 3;

// Cores vibrantes com efeito 3D (shadows manipuladas via CSS inline depois)
const COLORS = [
  '#FF0055', // Neon Red
  '#00FF99', // Neon Green
  '#00CCFF', // Neon Blue
  '#FFAA00', // Neon Orange
  '#CC00FF', // Neon Purple
  '#FFFF00'  // Neon Yellow
];

const PIECES_BY_LEVEL = {
  1: [[[1]], [[1, 1]], [[1], [1]], [[1, 1], [1, 1]]],
  2: [[[1, 1, 1]], [[1], [1], [1]], [[1, 1], [1, 0]], [[1, 1], [0, 1]]],
  3: [[[1, 1, 1], [0, 1, 0]], [[1, 1, 1], [1, 0, 0]], [[1, 1, 0], [0, 1, 1]]],
  4: [[[1, 1, 1], [1, 1, 1], [1, 1, 1]], [[1, 1, 1, 1]], [[1], [1], [1], [1]]],
  5: [[[1, 0, 0], [1, 0, 0], [1, 1, 1]], [[0, 0, 1], [0, 0, 1], [1, 1, 1]]]
};

const BlockBlastGame = () => {
  // --- ESTADOS ---
  const [screen, setScreen] = useState('menu');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [playerId] = useState(`player_${Math.random().toString(36).substr(2, 9)}`);
  
  // Jogo Local
  const [grid, setGrid] = useState(Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)));
  const [pieces, setPieces] = useState([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [bombs, setBombs] = useState(0);
  const [lastBonusScore, setLastBonusScore] = useState(0); // Controle para gerar bomba a cada 2000
  
  // Drag & Drop
  const [draggingPiece, setDraggingPiece] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [hoverCell, setHoverCell] = useState(null); // Onde a peça vai cair
  
  // Multiplayer
  const [playerName, setPlayerName] = useState('');
  const [inputRoomCode, setInputRoomCode] = useState(''); // O que digita
  const [activeRoomCode, setActiveRoomCode] = useState(''); // A sala conectada
  const [playersData, setPlayersData] = useState({}); // Dados de todos os jogadores { id: {name, grid, score} }
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  
  // Áudio e Inatividade
  const inactivityTimer = useRef(null);
  const audioContextRef = useRef(null);

  // Inicialização de áudio
  useEffect(() => {
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContextRef.current = new window.AudioContext();
    resetInactivityTimer();
    
    // Listener global para mover o drag
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalMouseUp);
    window.addEventListener('keydown', resetInactivityTimer);
    window.addEventListener('click', resetInactivityTimer);

    return () => {
      clearTimeout(inactivityTimer.current);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalMouseUp);
      window.removeEventListener('keydown', resetInactivityTimer);
      window.removeEventListener('click', resetInactivityTimer);
    };
  }, [draggingPiece, grid]); // Dependências para o listener ter acesso ao estado atual

  // --- LÓGICA DE ÁUDIO ---
  const resetInactivityTimer = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    // Para som de suspense se estiver tocando (simulação)
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
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    switch (type) {
      case 'clear':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      case 'bomb':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.5);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
        break;
      case 'suspense':
        // Som contínuo de suspense
        if(ctx.suspenseOsc) return; // Já tocando
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(50, now); // Grave
        // Modulação LFO para dar medo
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 2; // 2Hz tremolo
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 10;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start();
        
        gain.gain.value = 0.1; // Baixo volume
        osc.start();
        ctx.suspenseOsc = osc; // Guarda referência para parar depois
        break;
      default: break;
    }
  };

  // --- LÓGICA DO JOGO ---
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
    
    // Se for online, atualiza o status do jogador na sala existente
    if (mode === 'online' && activeRoomCode) {
        updatePlayerStatus(0, Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)));
    } else {
        setScreen('game');
    }
  };

  // Sistema de Bomba
  const useBomb = () => {
    if (bombs <= 0) return;
    playSound('bomb');
    setBombs(b => b - 1);
    
    // Efeito Visual Local
    alert("💣 BOMBA LANÇADA! Destruindo peças dos adversários...");

    // Se estiver online, atacar outros
    if (activeRoomCode && db) {
        const opponents = Object.keys(playersData).filter(id => id !== playerId);
        opponents.forEach(oppId => {
            // Destrói 5 células aleatórias do oponente
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
        // Modo solo: Limpa 3x3 área aleatória do próprio grid para ajudar
        const newGrid = [...grid];
        const r = Math.floor(Math.random()*(GRID_SIZE-2));
        const c = Math.floor(Math.random()*(GRID_SIZE-2));
        for(let i=0; i<3; i++) for(let j=0; j<3; j++) newGrid[r+i][c+j] = null;
        setGrid(newGrid);
    }
  };

  // Drag and Drop Handlers
  const handleDragStart = (e, piece) => {
    // Evita scroll em mobile
    if(e.type === 'touchstart') document.body.style.overflow = 'hidden';
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    setDraggingPiece(piece);
    setDragPos({ x: clientX, y: clientY });
  };

  function handleGlobalMouseMove(e) {
    if (!draggingPiece) return;
    setDragPos({ x: e.clientX, y: e.clientY });
    checkHover(e.clientX, e.clientY);
  }

  function handleGlobalTouchMove(e) {
    if (!draggingPiece) return;
    e.preventDefault(); // Importante para não rolar a tela
    const touch = e.touches[0];
    setDragPos({ x: touch.clientX, y: touch.clientY });
    checkHover(touch.clientX, touch.clientY);
  }

  function checkHover(x, y) {
    // Tenta encontrar qual célula está embaixo do mouse
    // Isso é uma aproximação. O ideal seria usar document.elementFromPoint
    const elements = document.elementsFromPoint(x, y);
    const cellEl = elements.find(el => el.getAttribute('data-row'));
    
    if (cellEl) {
      const r = parseInt(cellEl.getAttribute('data-row'));
      const c = parseInt(cellEl.getAttribute('data-col'));
      setHoverCell({ r, c });
    } else {
      setHoverCell(null);
    }
  }

  function handleGlobalMouseUp() {
    document.body.style.overflow = 'auto'; // Restaura scroll
    if (draggingPiece && hoverCell) {
        placePiece(draggingPiece, hoverCell.r, hoverCell.c);
    }
    setDraggingPiece(null);
    setHoverCell(null);
  }

  const canPlacePiece = (piece, row, col) => {
    // Centraliza a peça no mouse (offset)
    // Assumindo que o usuário segura pelo centro aprox (2x2)
    // Ajuste fino: subtrair metade da largura/altura da peça
    const offsetR = Math.floor(piece.shape.length / 2);
    const offsetC = Math.floor(piece.shape[0].length / 2);
    const startR = row - offsetR;
    const startC = col - offsetC;

    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (piece.shape[r][c]) {
          const nr = startR + r;
          const nc = startC + c;
          if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE || grid[nr][nc]) return false;
        }
      }
    }
    return { startR, startC }; // Retorna a posição ajustada se válido
  };

  const placePiece = (piece, row, col) => {
    const placement = canPlacePiece(piece, row, col);
    if (!placement) return;

    const { startR, startC } = placement;
    const newGrid = grid.map(r => [...r]);
    
    piece.shape.forEach((rowArr, r) => {
      rowArr.forEach((val, c) => {
        if (val) newGrid[startR + r][startC + c] = piece.color;
      });
    });

    // Atualiza grid e remove peça
    const remainingPieces = pieces.filter(p => p.id !== piece.id);
    // Limpa linhas
    let lines = 0;
    const clearedGrid = newGrid.map(r => [...r]);
    
    // Check rows & cols logic...
    for(let i=0; i<GRID_SIZE; i++) {
        if(clearedGrid[i].every(c=>c)) { clearedGrid[i].fill(null); lines++; }
        if(clearedGrid.every(r=>r[i])) { for(let r=0; r<GRID_SIZE; r++) clearedGrid[r][i]=null; lines++; }
    }

    setGrid(clearedGrid);
    
    if (lines > 0) {
        playSound('clear');
        const newCombo = combo + 1;
        setCombo(newCombo);
        
        // Vozes de Combo
        if(newCombo === 2) speak("Bom!");
        if(newCombo === 3) speak("Ótimo!");
        if(newCombo >= 4) speak("Incrível!");

        const points = lines * 100 * newCombo;
        const newScore = score + points;
        setScore(newScore);

        // Checar Bônus de Bomba a cada 2000 pontos
        if (newScore >= lastBonusScore + 2000) {
            setBombs(b => b + 1);
            setLastBonusScore(s => s + 2000);
            speak("Bomba liberada!");
        }
    } else {
        setCombo(0);
    }

    if (remainingPieces.length === 0) setPieces(generatePieces());
    else setPieces(remainingPieces);
  };

  // Check Game Over
  useEffect(() => {
    if(screen !== 'game' || gameOver || pieces.length === 0) return;
    
    // Verifica se alguma peça cabe em algum lugar
    const canMove = pieces.some(p => {
        for(let r=0; r<GRID_SIZE; r++) for(let c=0; c<GRID_SIZE; c++) {
            if(canPlacePiece(p, r, c)) return true;
        }
        return false;
    });

    if(!canMove) {
        setGameOver(true);
        speak("Fim de jogo");
    }
  }, [pieces, grid, screen]);

  // --- MULTIPLAYER (3 Pessoas) ---
  
  // Atualiza dados no Firebase
  useEffect(() => {
    if (activeRoomCode && db && screen === 'game') {
        updatePlayerStatus(score, grid);
    }
  }, [score, grid, activeRoomCode]);

  const updatePlayerStatus = (currentScore, currentGrid) => {
      update(ref(db, `rooms/${activeRoomCode}/players/${playerId}`), {
          name: playerName,
          score: currentScore,
          grid: JSON.stringify(currentGrid),
          lastActive: Date.now()
      });
  };

  const joinRoom = async () => {
    if(!db) return alert("Erro: Firebase não configurado");
    if(!playerName) return alert("Digite seu nome");
    if(!inputRoomCode) return alert("Digite o código");

    const code = inputRoomCode.toUpperCase();
    const roomRef = ref(db, `rooms/${code}`);
    
    const snapshot = await get(roomRef);
    let currentPlayers = {};
    if(snapshot.exists()) {
        currentPlayers = snapshot.val().players || {};
    }

    if(Object.keys(currentPlayers).length >= MAX_PLAYERS) {
        return alert("Sala cheia (Máx 3 jogadores)");
    }

    // Entra na sala
    await set(ref(db, `rooms/${code}/players/${playerId}`), {
        name: playerName,
        score: 0,
        grid: JSON.stringify(Array(GRID_SIZE).fill(null).map(()=>Array(GRID_SIZE).fill(null)))
    });

    setActiveRoomCode(code);
    setScreen('waitingRoom'); // Vai para espera primeiro
  };

  // Listener da Sala
  useEffect(() => {
    if(!activeRoomCode || !db) return;
    
    const roomRef = ref(db, `rooms/${activeRoomCode}`);
    const unsub = onValue(roomRef, (snap) => {
        const data = snap.val();
        if(!data) {
            alert("A sala foi fechada");
            setScreen('menu');
            setActiveRoomCode('');
            return;
        }
        if(data.players) setPlayersData(data.players);
        if(data.chat) {
            const msgs = Object.values(data.chat);
            setChatMessages(msgs);
        }
    });
    return () => unsub();
  }, [activeRoomCode]);

  const sendChat = () => {
      if(!chatInput.trim() || !activeRoomCode) return;
      const msgRef = child(ref(db, `rooms/${activeRoomCode}/chat`), `${Date.now()}`);
      set(msgRef, { player: playerName, text: chatInput });
      setChatInput('');
  };

  // --- RENDERIZAÇÃO ---

  // Visual da Peça (Drag Preview ou Estática)
  const RenderPiece = ({ piece, isDragging }) => (
    <div className={`grid gap-1 p-2 transition-transform ${isDragging ? 'scale-110 opacity-90' : 'hover:scale-105 cursor-grab'}`}
         style={{ 
             gridTemplateColumns: `repeat(${piece.shape[0].length}, 20px)`,
             pointerEvents: isDragging ? 'none' : 'auto' // Importante para o drag
         }}
         onMouseDown={(e) => handleDragStart(e, piece)}
         onTouchStart={(e) => handleDragStart(e, piece)}
    >
        {piece.shape.map((row, i) => row.map((cell, j) => (
            <div key={`${i}-${j}`} 
                 style={{
                     width: 20, height: 20,
                     backgroundColor: cell ? piece.color : 'transparent',
                     // Efeito 3D chanfrado
                     boxShadow: cell ? 'inset 2px 2px 2px rgba(255,255,255,0.4), inset -2px -2px 2px rgba(0,0,0,0.2), 2px 2px 0px rgba(0,0,0,0.3)' : 'none',
                     borderRadius: '4px'
                 }} 
            />
        )))}
    </div>
  );

  return (
    // Fundo Sólido Escuro como pedido
    <div className="min-h-screen bg-slate-900 text-white font-sans select-none overflow-hidden touch-none">
        
      {/* --- MENU --- */}
      {screen === 'menu' && (
        <div className="flex flex-col items-center justify-center h-screen p-4 space-y-6 animate-float">
            <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 drop-shadow-[0_2px_2px_rgba(255,255,255,0.5)]">
                BLOCK BLAST
            </h1>
            <div className="flex gap-4 w-full max-w-md flex-col">
                <button onClick={() => setScreen('onlineInput')} className="bg-blue-600 hover:bg-blue-500 p-4 rounded-xl font-bold text-xl shadow-[0_4px_0_rgb(0,0,100)] active:shadow-none active:translate-y-1 transition-all flex items-center justify-center gap-2"><Share2/> Jogar Online</button>
                <button onClick={() => startGame('local')} className="bg-green-600 hover:bg-green-500 p-4 rounded-xl font-bold text-xl shadow-[0_4px_0_rgb(0,50,0)] active:shadow-none active:translate-y-1 transition-all flex items-center justify-center gap-2"><Trophy/> Modo Solo</button>
            </div>
        </div>
      )}

      {/* --- INPUT SALA ONLINE --- */}
      {screen === 'onlineInput' && (
          <div className="flex flex-col items-center justify-center h-screen p-4 space-y-4">
              <h2 className="text-3xl font-bold">Multiplayer (Máx 3)</h2>
              <input 
                type="text" 
                placeholder="Seu Nome" 
                value={playerName} onChange={e=>setPlayerName(e.target.value)}
                className="p-3 rounded-lg text-black font-bold text-center w-64"
              />
              <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="CÓDIGO SALA" 
                    value={inputRoomCode} 
                    onChange={e=>setInputRoomCode(e.target.value.toUpperCase())}
                    className="p-3 rounded-lg text-black font-bold text-center w-32 uppercase"
                  />
                  <button onClick={joinRoom} className="bg-purple-600 p-3 rounded-lg font-bold">ENTRAR</button>
              </div>
              <button onClick={()=>setScreen('menu')} className="text-gray-400">Voltar</button>
          </div>
      )}

      {/* --- SALA DE ESPERA --- */}
      {screen === 'waitingRoom' && (
          <div className="flex flex-col items-center justify-center h-screen p-4 space-y-6">
              <h2 className="text-4xl font-bold text-green-400">Sala: {activeRoomCode}</h2>
              <div className="bg-slate-800 p-6 rounded-2xl w-full max-w-md">
                  <h3 className="text-xl mb-4 border-b border-gray-600 pb-2">Jogadores ({Object.keys(playersData).length}/3)</h3>
                  {Object.values(playersData).map((p, i) => (
                      <div key={i} className="flex justify-between items-center py-2">
                          <span>{p.name}</span>
                          <span className="text-yellow-400 font-mono">Pronto</span>
                      </div>
                  ))}
              </div>
              <button onClick={() => setScreen('game')} className="bg-yellow-500 text-black px-8 py-4 rounded-xl font-black text-xl shadow-[0_4px_0_rgb(100,50,0)] hover:scale-105 transition">
                  COMEÇAR
              </button>
          </div>
      )}

      {/* --- TELA DO JOGO --- */}
      {screen === 'game' && (
        <div className="h-screen flex flex-col p-2 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center bg-slate-800 p-3 rounded-xl mb-2 shadow-lg border-b-4 border-slate-950">
                <div>
                    <div className="text-xs text-gray-400">SCORE</div>
                    <div className="text-2xl font-black text-yellow-400">{score}</div>
                </div>
                
                <div className="flex gap-4">
                    {/* Botão de Bomba */}
                    <button onClick={useBomb} disabled={bombs===0} 
                            className={`flex flex-col items-center p-2 rounded-lg transition-all ${bombs>0 ? 'bg-red-600 hover:scale-110 cursor-pointer shadow-[0_0_15px_red]' : 'bg-gray-700 opacity-50'}`}>
                        <Bomb size={24} color="white" />
                        <span className="text-xs font-bold">{bombs}</span>
                    </button>
                    
                    <button onClick={() => { setScreen('menu'); remove(ref(db, `rooms/${activeRoomCode}/players/${playerId}`)); }} className="bg-red-500 px-3 py-1 rounded font-bold text-xs h-8">SAIR</button>
                </div>
            </div>

            <div className="flex flex-1 gap-4 overflow-hidden">
                {/* ÁREA PRINCIPAL (TABULEIRO E PEÇAS) */}
                <div className="flex-1 flex flex-col items-center justify-center relative">
                    
                    {/* Tabuleiro com Drag & Drop */}
                    <div className="relative bg-slate-800 p-2 rounded-lg shadow-2xl border-4 border-slate-700"
                         style={{ width: 'fit-content' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL_SIZE}px)`, gap: '2px' }}>
                            {grid.map((row, r) => row.map((cell, c) => (
                                <div key={`${r}-${c}`}
                                     data-row={r} data-col={c} // Identificadores para o Drag
                                     style={{
                                         width: CELL_SIZE, height: CELL_SIZE,
                                         // Cor sólida escura para fundo, cor vibrante para peça
                                         backgroundColor: cell || (draggingPiece && canPlacePiece(draggingPiece, hoverCell?.r, hoverCell?.c) && 
                                            // Lógica visual de preview simples
                                            r >= (hoverCell?.r - Math.floor(draggingPiece.shape.length/2)) && 
                                            c >= (hoverCell?.c - Math.floor(draggingPiece.shape[0].length/2)) &&
                                            // (Preview exato é complexo aqui, simplificado para feedback de hover)
                                            'rgba(255,255,255,0.1)') || '#1e293b',
                                         borderRadius: '4px',
                                         boxShadow: cell ? 'inset 3px 3px 2px rgba(255,255,255,0.3), 3px 3px 0px rgba(0,0,0,0.4)' : 'inset 1px 1px 4px rgba(0,0,0,0.5)'
                                     }}
                                />
                            )))}
                        </div>
                    </div>

                    {/* Peças (Dock) */}
                    <div className="mt-4 flex gap-6 min-h-[100px] items-center justify-center bg-slate-800/50 w-full rounded-xl p-2">
                        {pieces.map(p => <RenderPiece key={p.id} piece={p} isDragging={false} />)}
                        {pieces.length===0 && !gameOver && <p className="text-sm animate-pulse">Gerando...</p>}
                    </div>

                    {/* DRAGGING GHOST (Segue o Mouse) */}
                    {draggingPiece && (
                        <div style={{
                            position: 'fixed', left: dragPos.x, top: dragPos.y,
                            pointerEvents: 'none', transform: 'translate(-50%, -50%)', zIndex: 100
                        }}>
                            <RenderPiece piece={draggingPiece} isDragging={true} />
                        </div>
                    )}
                </div>

                {/* SIDEBAR (OPONENTES E CHAT) - Só aparece online */}
                {activeRoomCode && (
                    <div className="w-1/3 bg-slate-800 rounded-xl p-2 flex flex-col gap-2">
                        <div className="flex-1 overflow-y-auto space-y-2">
                            {Object.entries(playersData).filter(([id]) => id !== playerId).map(([id, p]) => (
                                <div key={id} className="bg-slate-700 p-2 rounded-lg">
                                    <div className="flex justify-between text-xs font-bold mb-1">
                                        <span className="truncate w-16">{p.name}</span>
                                        <span className="text-yellow-400">{p.score}</span>
                                    </div>
                                    {/* Mini Grid Oponente */}
                                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_SIZE}, 6px)`, gap: '1px' }}>
                                        {p.grid && JSON.parse(p.grid).map((row, r) => row.map((c, k) => (
                                            <div key={k} style={{ width:6, height:6, backgroundColor: c || '#334155', borderRadius:1 }} />
                                        )))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        {/* Chat */}
                        <div className="bg-slate-900 rounded-lg p-2 h-1/3 flex flex-col">
                            <div className="flex-1 overflow-y-auto text-[10px] mb-1">
                                {chatMessages.map((m, i) => (
                                    <div key={i}><b className="text-blue-400">{m.player}:</b> {m.text}</div>
                                ))}
                            </div>
                            <div className="flex gap-1">
                                <input className="w-full text-black rounded px-1 text-xs" 
                                       value={chatInput} onChange={e=>setChatInput(e.target.value)} 
                                       onKeyDown={e=>e.key==='Enter' && sendChat()} />
                                <button onClick={sendChat} className="bg-blue-500 px-2 rounded text-xs">></button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* GAME OVER MODAL */}
            {gameOver && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 animate-in fade-in">
                    <h2 className="text-5xl font-black text-red-500 mb-4 drop-shadow-[0_0_10px_red]">GAME OVER</h2>
                    <p className="text-2xl text-white mb-8">Score: {score}</p>
                    <button onClick={() => startGame(activeRoomCode ? 'online' : 'local')} 
                            className="bg-green-500 hover:bg-green-600 text-white px-8 py-4 rounded-xl font-bold text-xl flex items-center gap-2 shadow-[0_0_20px_green]">
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