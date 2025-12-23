import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Users, Swords, Trophy, Zap, Share2, Copy, Check, Link as LinkIcon, AlertCircle, Play, Home } from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, update, get, child } from "firebase/database";

// ============================================================================
// 🔴 COLE SUAS CHAVES DO FIREBASE AQUI
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

// Inicialização segura
let db;
try {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (e) {
  console.log("Modo Offline");
}

const GRID_SIZE = 8;
const CELL_SIZE = 42; 

const PIECES_BY_LEVEL = {
  1: [[[1]], [[1, 1]], [[1], [1]], [[1, 1], [1, 1]]],
  2: [[[1]], [[1, 1]], [[1], [1]], [[1, 1, 1]], [[1], [1], [1]], [[1, 1], [1, 1]]],
  3: [[[1, 1]], [[1], [1]], [[1, 1, 1]], [[1], [1], [1]], [[1, 1], [1, 1]], [[1, 1, 1], [1, 0, 0]], [[1, 0], [1, 0], [1, 1]], [[1, 1, 1], [0, 1, 0]]],
  4: [[[1, 1]], [[1, 1, 1]], [[1], [1], [1]], [[1, 1], [1, 1]], [[1, 1, 1], [1, 0, 0]], [[1, 0], [1, 0], [1, 1]], [[1, 1, 1], [0, 1, 0]], [[1, 1, 0], [0, 1, 1]], [[1, 1, 1], [1, 0, 0], [1, 0, 0]], [[1, 1, 1], [0, 0, 1], [0, 0, 1]]],
  5: [[[1, 1]], [[1, 1, 1]], [[1], [1], [1]], [[1, 1], [1, 1]], [[1, 1, 1], [1, 0, 0]], [[1, 0], [1, 0], [1, 1]], [[1, 1, 1], [0, 1, 0]], [[1, 1, 0], [0, 1, 1]], [[1, 1, 1], [1, 1, 1], [1, 1, 1]], [[1, 1, 1], [1, 0, 0], [1, 0, 0]], [[1, 1, 1], [0, 0, 1], [0, 0, 1]], [[1, 0, 0], [1, 0, 0], [1, 1, 1]], [[0, 0, 1], [0, 0, 1], [1, 1, 1]]]
};

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];

const BlockBlastGame = () => {
  const [screen, setScreen] = useState('menu');
  const [gameMode, setGameMode] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Game State
  const [grid, setGrid] = useState(Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)));
  const [pieces, setPieces] = useState([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [level, setLevel] = useState(1);
  
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [hoverCell, setHoverCell] = useState(null);
  const [message, setMessage] = useState('');
  const [particles, setParticles] = useState([]);
  const [backgroundIndex, setBackgroundIndex] = useState(0);
  
  // Multiplayer State
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [connectedPlayer, setConnectedPlayer] = useState(null);
  const [opponentScore, setOpponentScore] = useState(0);
  const [opponentGrid, setOpponentGrid] = useState(Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)));
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Lista de Gradientes (Fundo Colorido)
  const backgrounds = [
    'from-purple-600 via-pink-500 to-orange-400',
    'from-blue-600 via-cyan-500 to-teal-400',
    'from-red-600 via-orange-500 to-yellow-400',
    'from-green-600 via-emerald-500 to-lime-400',
    'from-indigo-600 via-purple-500 to-pink-400'
  ];

  // Auto-join via Link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setRoomCode(roomParam);
      setScreen('onlineSetup');
    }
  }, []);

  // --- AUDIO SYSTEM ---
  const playSound = (type) => {
    if (!soundEnabled) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        const now = ctx.currentTime;

        switch(type) {
        case 'place': osc.frequency.value=400; g.gain.value=0.1; osc.start(); osc.stop(now+0.1); break;
        case 'clear': 
            osc.frequency.value=800; g.gain.setValueAtTime(0.2, now); g.gain.exponentialRampToValueAtTime(0.01, now+0.3);
            osc.start(); osc.stop(now+0.3); break;
        case 'perfect':
            [600, 700, 800, 1000].forEach((f, i) => {
            const o = ctx.createOscillator(); const gn = ctx.createGain();
            o.connect(gn); gn.connect(ctx.destination); o.frequency.value=f; gn.gain.value=0.1;
            o.start(now+i*0.15); o.stop(now+i*0.15+0.2);
            }); break;
        case 'start': osc.frequency.value=600; g.gain.value=0.15; osc.start(); osc.stop(now+0.1); break;
        case 'gameover': osc.frequency.value=150; osc.type='sawtooth'; g.gain.value=0.2; osc.start(); osc.stop(now+0.5); break;
        }
    } catch(e) { console.log("Audio bloqueado"); }
  };

  // --- FIREBASE ACTIONS ---
  const generateRoomCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  const copyInviteLink = () => {
    const baseUrl = window.location.origin + window.location.pathname;
    const url = `${baseUrl}?room=${roomCode}`;
    
    navigator.clipboard.writeText(url).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
    }).catch(err => {
        prompt("Copie o link:", url);
    });
  };

  const createRoom = async () => {
    if(!db) return alert("Erro: Firebase não configurado. Verifique o arquivo App.jsx.");
    if(!playerName) return alert("Digite seu nome!");
    try {
        const c = generateRoomCode();
        setRoomCode(c);
        setIsHost(true);
        // ATENÇÃO: Aqui estava o erro. Adicionei setGameMode('online') e iniciei o hostGrid corretamente
        setGameMode('online'); 
        
        await set(ref(db, `rooms/${c}`), {
            host: playerName, 
            hostScore: 0, 
            // Inicia com grid vazio real, não string vazia
            hostGrid: JSON.stringify(Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null))), 
            guest: null, 
            createdAt: Date.now()
        });
        setScreen('waitingRoom');
    } catch (error) { alert("Erro ao criar sala: " + error.message); }
  };

  const joinRoom = async (code) => {
    if(!db) return alert("Erro: Firebase não configurado.");
    if(!playerName) return alert("Digite seu nome!");
    if(!code) return alert("Digite o código da sala!");

    try {
        const roomRef = ref(db, `rooms/${code}`);
        const snapshot = await get(roomRef);
        if (!snapshot.exists()) return alert('Sala não encontrada!');
        const data = snapshot.val();
        if (data.guest && data.guest !== playerName) return alert('Sala cheia!');
        
        setRoomCode(code);
        setIsHost(false);
        // CORREÇÃO: Define o modo online para o visitante ver a tela dividida
        setGameMode('online');
        setConnectedPlayer(data.host);
        
        await update(roomRef, { 
            guest: playerName, 
            guestScore: 0, 
            guestGrid: JSON.stringify(Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null))) 
        });
        setScreen('game');
    } catch (error) { alert("Erro ao entrar: " + error.message); }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !roomCode || !db) return;
    try {
        const newMsgRef = child(ref(db, `rooms/${roomCode}/chat`), `${Date.now()}`);
        await set(newMsgRef, { player: playerName, message: chatInput, timestamp: Date.now() });
        setChatInput('');
    } catch (e) {}
  };

  useEffect(() => {
    if (!roomCode || screen === 'menu' || !db) return;
    const unsubscribe = onValue(ref(db, `rooms/${roomCode}`), (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      if (data.chat) setChatMessages(Object.values(data.chat));
      
      if (isHost) {
        if (data.guest && !connectedPlayer) { 
            setConnectedPlayer(data.guest); 
            setGameMode('online'); // Garante modo online quando guest entra
            setScreen('game'); 
        }
        setOpponentScore(data.guestScore || 0);
        if (data.guestGrid) {
            try { setOpponentGrid(JSON.parse(data.guestGrid)); } catch(e) {}
        }
      } else {
        setOpponentScore(data.hostScore || 0);
        if (data.hostGrid) {
            try { setOpponentGrid(JSON.parse(data.hostGrid)); } catch(e) {}
        }
      }
    });
    return () => unsubscribe();
  }, [roomCode, isHost, screen, connectedPlayer]);

  useEffect(() => {
    if (gameMode !== 'online' || !roomCode || screen !== 'game' || !db) return;
    const updates = {};
    const prefix = isHost ? 'host' : 'guest';
    updates[`rooms/${roomCode}/${prefix}Score`] = score;
    updates[`rooms/${roomCode}/${prefix}Grid`] = JSON.stringify(grid);
    update(ref(db), updates).catch(console.error);
  }, [score, grid]);

  // --- GAME LOGIC ---
  const generatePieces = () => {
    const lvl = Math.max(1, Math.min(5, Math.floor(score/1000)+1));
    const avail = PIECES_BY_LEVEL[lvl] || PIECES_BY_LEVEL[1];
    return Array(3).fill(0).map((_,i) => ({ 
        shape: avail[Math.floor(Math.random()*avail.length)], 
        color: COLORS[Math.floor(Math.random()*COLORS.length)], 
        id: Date.now()+i 
    }));
  };

  // Trava de segurança para peças
  useEffect(() => {
    if (screen === 'game' && pieces.length === 0 && !gameOver) {
        setPieces(generatePieces());
    }
  }, [screen, pieces, gameOver]);

  const startGame = (mode) => {
    setGameMode(mode);
    setGrid(Array(GRID_SIZE).fill(null).map(()=>Array(GRID_SIZE).fill(null)));
    setScore(0); setCombo(0); setGameOver(false);
    setPieces(generatePieces());
    
    // Zera o índice do fundo ao começar
    setBackgroundIndex(0);
    
    if(mode==='local') setScreen('game');
    playSound('start');
  };

  const placePiece = (piece, row, col) => {
    const newGrid = grid.map(r => [...r]);
    piece.shape.forEach((rArr, r) => rArr.forEach((v, c) => { if(v) newGrid[row+r][col+c] = piece.color; }));
    setGrid(newGrid); playSound('place');
    
    let lines = 0;
    const cleared = newGrid.map(r=>[...r]);
    for(let i=0; i<GRID_SIZE; i++) {
        if(cleared[i].every(c=>c)) { cleared[i].fill(null); lines++; } 
        if(cleared.every(r=>r[i])) { for(let r=0; r<GRID_SIZE; r++) cleared[r][i]=null; lines++; } 
    }

    if(lines > 0) {
        setGrid(cleared);
        const mult = Math.min(1 + Math.floor((combo+1)/2)*0.5, 5);
        setCombo(c=>c+1); setMultiplier(mult);
        setScore(s => s + Math.floor(lines*100*mult));
        createParticles(lines);
        playSound('clear');
        showMessage(lines > 1 ? `${lines} LINHAS!` : 'BOM!');
        if(cleared.every(r=>r.every(c=>c===null))) {
             setScore(s=>s+500); showMessage("PERFECT! +500"); playSound('perfect');
             setBackgroundIndex(p => (p+1)%backgrounds.length);
        }
    } else {
        setCombo(0);
    }
    
    const remaining = pieces.filter(p=>p.id!==piece.id);
    setPieces(remaining.length ? remaining : generatePieces());
    setSelectedPiece(null); setHoverCell(null);
  };
  
  useEffect(() => {
      if(screen==='game' && !gameOver && pieces.length>0) {
          const canMove = pieces.some(p => {
              for(let r=0; r<GRID_SIZE; r++) for(let c=0; c<GRID_SIZE; c++) {
                  let fits = true;
                  for(let pr=0; pr<p.shape.length; pr++) for(let pc=0; pc<p.shape[pr].length; pc++) {
                      if(p.shape[pr][pc]) {
                          if(r+pr>=GRID_SIZE || c+pc>=GRID_SIZE || grid[r+pr][c+pc]) fits = false;
                      }
                  }
                  if(fits) return true;
              }
              return false;
          });
          if(!canMove) { setGameOver(true); playSound('gameover'); }
      }
  }, [pieces, grid, screen]);

  // Helpers
  const showMessage = (t) => { setMessage(t); setTimeout(()=>setMessage(''), 1500); };
  const createParticles = (n) => { setParticles(Array(n*5).fill(0).map((_,i)=>({id:Date.now()+i, x:Math.random()*100, y:Math.random()*100, color:COLORS[i%COLORS.length]}))); setTimeout(()=>setParticles([]), 1000); };

  // --- RENDERS ---

  if (screen === 'menu') {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${backgrounds[0]} flex items-center justify-center p-4`}>
        <div className="bg-white/90 backdrop-blur rounded-3xl shadow-2xl p-8 max-w-md w-full animate-float">
          <h1 className="text-5xl font-bold text-center mb-2 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Block Blast</h1>
          <p className="text-center text-gray-600 mb-8">Multiplayer Edition</p>
          <div className="space-y-4">
            <button onClick={() => setScreen('onlineSetup')} className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-4 rounded-xl hover:scale-105 transition-all flex justify-center gap-2 shadow-lg"><Share2 /> Jogar Online</button>
            <button onClick={() => startGame('local')} className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-4 rounded-xl hover:scale-105 transition-all flex justify-center gap-2 shadow-lg"><Play /> Modo Solo</button>
            <button onClick={() => setSoundEnabled(!soundEnabled)} className="w-full bg-gray-200 text-gray-800 font-bold py-3 rounded-xl flex justify-center gap-2 shadow-sm">{soundEnabled ? <Volume2 /> : <VolumeX />} Som: {soundEnabled ? 'ON' : 'OFF'}</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'onlineSetup') {
    return (
      <div className={`min-h-screen bg-gradient-to-br ${backgrounds[1]} flex items-center justify-center p-4`}>
        <div className="bg-white/90 backdrop-blur rounded-3xl p-8 max-w-md w-full shadow-2xl">
          <h2 className="text-3xl font-bold mb-6 text-center text-gray-800">Multiplayer</h2>
          <div className="space-y-4">
            <div>
                <label className="block text-sm font-bold text-gray-600 mb-1">Seu Nome:</label>
                <input type="text" placeholder="Digite seu nome..." value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full p-4 border-2 border-purple-300 rounded-xl outline-none text-black bg-white font-bold text-lg focus:border-purple-600" />
            </div>
            {roomCode && !isHost ? (
               <button onClick={() => { if(!db) return alert("Firebase Off"); joinRoom(roomCode); }} disabled={!playerName} className="w-full bg-green-500 text-white py-4 rounded-xl font-bold shadow-lg hover:scale-105 transition disabled:opacity-50 flex justify-center items-center gap-2">Entrar na Sala: {roomCode}</button>
            ) : (
                <>
                    <button onClick={createRoom} disabled={!playerName} className="w-full bg-purple-500 text-white py-4 rounded-xl font-bold shadow-lg hover:scale-105 transition disabled:opacity-50">Criar Sala Nova</button>
                    <div className="flex gap-2 pt-4 border-t items-center"><input type="text" placeholder="CÓDIGO" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} className="flex-1 p-3 border-2 border-gray-300 rounded-xl uppercase text-center text-black bg-white font-bold" /><button onClick={() => { if(!db) return alert("Firebase Off"); joinRoom(roomCode); }} disabled={!playerName || !roomCode} className="px-6 bg-gray-800 text-white rounded-xl font-bold disabled:opacity-50">Entrar</button></div>
                </>
            )}
            <button onClick={() => setScreen('menu')} className="w-full text-gray-500 py-2 hover:text-gray-800 font-bold">Voltar</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'waitingRoom') {
    return (
        <div className={`min-h-screen bg-gradient-to-br ${backgrounds[2]} flex items-center justify-center p-4`}>
            <div className="bg-white/95 backdrop-blur rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
                <h2 className="text-2xl font-bold mb-4 text-gray-800">Sala Criada!</h2>
                <div className="bg-purple-50 p-6 rounded-2xl mb-4 border-2 border-purple-200 border-dashed relative">
                    <p className="text-sm text-purple-600 uppercase font-bold mb-2">Código da Sala</p>
                    <p className="text-5xl font-mono font-black text-purple-600 tracking-widest">{roomCode}</p>
                </div>
                
                {/* BOTÃO DE LINK PRESENTE */}
                <button onClick={copyInviteLink} className="w-full mb-6 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg hover:scale-105">
                    {copiedLink ? <Check size={20} /> : <LinkIcon size={20} />} 
                    {copiedLink ? 'Link Copiado!' : 'Copiar Link para Convidar'}
                </button>
                
                <div className="animate-pulse text-purple-600 font-bold mb-6 flex justify-center items-center gap-2">
                    <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce"></div> 
                    Aguardando oponente...
                </div>

                <button onClick={() => { setScreen('menu'); setRoomCode(''); }} className="text-red-500 font-bold hover:underline">Cancelar</button>
            </div>
        </div>
    );
  }

  // TELA DO JOGO (COM MODO ONLINE CORRIGIDO)
  return (
    <div className={`min-h-screen bg-gradient-to-br ${backgrounds[backgroundIndex]} p-2 transition-all duration-1000 flex flex-col items-center justify-center`}>
      <div className="max-w-6xl w-full">
        {/* Placar */}
        <div className="bg-white/90 backdrop-blur rounded-2xl p-4 mb-4 flex justify-between items-center shadow-lg">
           <div><div className="text-2xl font-black text-gray-800">Score: {score}</div>{combo>1 && <div className="text-sm text-purple-600 font-black animate-bounce mt-1"><Zap className="inline w-4 h-4" /> {combo}x COMBO!</div>}</div>
           {gameMode==='online' && <div className="text-right bg-gray-100 px-4 py-2 rounded-xl"><div className="text-xs text-gray-500 font-bold">{connectedPlayer||'Oponente'}</div><div className="text-xl font-bold text-red-600">{opponentScore}</div></div>}
           <button onClick={()=>setScreen('menu')} className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold shadow hover:bg-red-600 flex gap-2 items-center"><Home size={18}/> Sair</button>
        </div>

        {message && <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-yellow-400 text-white font-black px-8 py-4 rounded-3xl text-3xl shadow-2xl z-50 animate-bounce">{message}</div>}
        {particles.map(p=><div key={p.id} className="fixed w-4 h-4 rounded-full animate-ping" style={{left:`${p.x}%`,top:`${p.y}%`,backgroundColor:p.color}}/>)}

        <div className="flex flex-col lg:flex-row gap-6 justify-center items-start">
            
            {/* --- TABULEIRO PRINCIPAL --- */}
            {/* AGORA É VIDRO TRANSPARENTE (bg-white/20) PARA MOSTRAR O COLORIDO DE FUNDO */}
            <div className="bg-white/20 backdrop-blur-xl border border-white/40 rounded-3xl p-6 shadow-2xl flex flex-col items-center">
                
                <p className="text-white text-sm mb-2 font-bold drop-shadow-md">{selectedPiece ? '👇 Clique no tabuleiro para colocar' : '👇 Selecione uma peça abaixo'}</p>

                <div className="bg-black/10 p-3 rounded-2xl inline-block shadow-inner backdrop-blur-sm">
                    <div style={{display:'grid',gridTemplateColumns:`repeat(${GRID_SIZE},${CELL_SIZE}px)`,gap:'4px'}}>
                        {grid.map((row,r)=>row.map((cell,c)=>(
                            <div key={`${r}-${c}`} onClick={()=>{if(selectedPiece) { 
                                let fits=true; 
                                for(let pr=0;pr<selectedPiece.shape.length;pr++) for(let pc=0;pc<selectedPiece.shape[pr].length;pc++) 
                                    if(selectedPiece.shape[pr][pc] && (r+pr>=GRID_SIZE||c+pc>=GRID_SIZE||grid[r+pr][c+pc])) fits=false;
                                if(fits) placePiece(selectedPiece,r,c);
                             }}} 
                             onMouseEnter={()=>setHoverCell({r,c})}
                             className="rounded-lg transition-all duration-200"
                             style={{
                                 width:CELL_SIZE, height:CELL_SIZE,
                                 // Células brancas semitransparentes para contraste no vidro
                                 backgroundColor: cell || (selectedPiece&&hoverCell&&hoverCell.r===r&&hoverCell.c===c?'#ffffff80':'rgba(255,255,255,0.25)'),
                                 boxShadow: cell ? '0 0 10px rgba(0,0,0,0.2)' : 'none',
                                 transform: cell ? 'scale(1)' : 'scale(1)'
                             }} />
                        )))}
                    </div>
                </div>

                {/* Peças - FUNDO BRANCO LEVE PARA DESTACAR DO COLORIDO */}
                <div className="mt-6 flex gap-4 justify-center items-center min-h-[120px] w-full bg-white/30 rounded-xl p-2 shadow-inner">
                    {pieces.length === 0 && <p className="text-white font-bold animate-pulse">Gerando peças...</p>}
                    {pieces.map(p=><div key={p.id} onClick={()=>setSelectedPiece(selectedPiece?.id===p.id?null:p)} className={`bg-white p-3 rounded-xl cursor-pointer transition-all shadow-lg ${selectedPiece?.id===p.id?'scale-110 ring-4 ring-purple-500':''}`}><div style={{display:'grid',gridTemplateColumns:`repeat(${p.shape[0].length},20px)`,gap:'2px'}}>{p.shape.map((rw,i)=>rw.map((c,j)=><div key={`${i}-${j}`} className="rounded-sm" style={{width:20,height:20,backgroundColor:c?p.color:'transparent'}}/>))}</div></div>)}
                </div>
            </div>

            {gameMode==='online' && (
                <div className="bg-white/20 backdrop-blur-md border border-white/30 rounded-3xl p-6 shadow-xl opacity-90 scale-90">
                    <h3 className="font-bold text-center mb-4 text-white flex items-center justify-center gap-2 drop-shadow-md"><Swords size={20} /> {connectedPlayer||'Aguardando...'}</h3>
                    <div className="bg-black/10 p-2 rounded-xl inline-block opacity-80"><div style={{display:'grid',gridTemplateColumns:`repeat(${GRID_SIZE},${CELL_SIZE*0.7}px)`,gap:'2px'}}>{opponentGrid.map((row,r)=>row.map((cell,c)=><div key={`op-${r}-${c}`} className="rounded" style={{width:CELL_SIZE*0.7,height:CELL_SIZE*0.7,backgroundColor:cell||'rgba(255,255,255,0.2)'}}/>))}</div></div>
                    <div className="mt-4 bg-white/90 rounded-xl p-3 h-40 flex flex-col shadow-inner"><div className="flex-1 overflow-y-auto text-xs space-y-2 mb-2">{chatMessages.map((m,i)=><div key={i} className="bg-gray-100 p-2 rounded-lg"><span className="font-bold text-purple-600">{m.player}:</span> {m.message}</div>)}</div><div className="flex gap-2"><input className="flex-1 border rounded px-2 text-black" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendChatMessage()} /><button onClick={sendChatMessage} className="bg-purple-500 text-white px-2 rounded">></button></div></div>
                </div>
            )}
        </div>

        {gameOver && <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"><div className="bg-white p-10 rounded-3xl text-center shadow-2xl animate-bounce"><h2 className="text-4xl font-black mb-2">FIM DE JOGO!</h2><div className="text-6xl font-black text-purple-600 mb-6">{score}</div><button onClick={()=>setScreen('menu')} className="bg-purple-500 text-white px-8 py-4 rounded-xl font-bold">Voltar</button></div></div>}
      </div>
    </div>
  );
};

export default BlockBlastGame;