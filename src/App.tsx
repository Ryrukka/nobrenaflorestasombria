import React, { useEffect, useRef, useState } from 'react';
import { Heart, Coins, Trees, Gem, Hammer, Shield, Home, Users, X, ArrowUpCircle, Wrench, Play, User } from 'lucide-react';
import io from 'socket.io-client';
import type { Socket } from 'socket.io-client';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);
  const socketRef = useRef<Socket | null>(null);
  
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [gameState, setGameState] = useState<any>(null);
  const [isAudioOn, setIsAudioOn] = useState(true);

  const audioContextRef = useRef<AudioContext | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const hasStartedRef = useRef(false);

  const handleJoin = () => {
    setIsJoined(true);
    hasStartedRef.current = true;
    
    // Initialize audio context on user interaction
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  };

  useEffect(() => {
    if (!isJoined || !gameState) return;
    
    if (!bgMusicRef.current) {
      bgMusicRef.current = new Audio();
      bgMusicRef.current.loop = true;
    }

    const currentPhase = gameState.isPrepPhase ? 'prep' : 'battle';
    const isIntense = gameState.enemies.length > 10;
    const isBoss = gameState.wave % 5 === 0 && !gameState.isPrepPhase;

    let trackUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'; // Default
    if (currentPhase === 'prep') trackUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3';
    if (currentPhase === 'battle') trackUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3';
    if (isIntense) trackUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3';
    if (isBoss) trackUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3';

    if (bgMusicRef.current.src !== trackUrl) {
      bgMusicRef.current.src = trackUrl;
      if (isAudioOn) bgMusicRef.current.play().catch(() => {});
    }

    if (!isAudioOn) {
      bgMusicRef.current.pause();
    } else {
      bgMusicRef.current.play().catch(() => {});
    }

  }, [gameState?.isPrepPhase, gameState?.wave, gameState?.enemies.length, isAudioOn]);

  useEffect(() => {
    if (!isJoined) return;
    
    const socket = io();
    socketRef.current = socket;
    
    socket.emit('joinRoom', roomId || 'default', playerName || 'Hero');
    
    socket.on('gameState', (state) => {
      setGameState(state);
      // Update startWaveBtn handler every time state changes (to ensure it has latest roomId)
      const startWaveBtn = document.getElementById('startWaveBtn');
      if (startWaveBtn) {
        startWaveBtn.onclick = () => {
          socket.emit('startWave', roomId || 'default');
        };
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [isJoined]);

  useEffect(() => {
    if (!isJoined || !gameState) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    const ui = {
      healthText: document.getElementById('healthText'),
      healthFill: document.getElementById('healthFill'),
      woodCount: document.getElementById('woodCount'),
      stoneCount: document.getElementById('stoneCount'),
      fiberCount: document.getElementById('fiberCount'),
      goldCount: document.getElementById('goldCount'),
      dayBadge: document.getElementById('dayBadge'),
      messageBox: document.getElementById('messageBox'),
      titleOverlay: document.getElementById('titleOverlay'),
      gameOverOverlay: document.getElementById('gameOverOverlay'),
      daysSurvived: document.getElementById('daysSurvived'),
      finalGold: document.getElementById('finalGold'),
      upgradePanel: document.getElementById('upgradePanel'),
      panelTitle: document.getElementById('panelTitle'),
      panelDesc: document.getElementById('panelDesc'),
      upgradeBtn: document.getElementById('upgradeBtn'),
      repairBtn: document.getElementById('repairBtn'),
      closePanelBtn: document.getElementById('closePanelBtn'),
      mobileUI: document.querySelector('.mobile-controls') as HTMLElement,
      joystickBase: document.getElementById('joystickBase'),
      joystickStick: document.getElementById('joystickStick'),
      questMessage: document.getElementById('questMessage'),
      soundBtn: document.getElementById('soundBtn'),
      waveInfo: document.getElementById('waveInfo'),
      waveTimer: document.getElementById('waveTimer'),
      prepOverlay: document.getElementById('prepOverlay'),
      prepTimer: document.getElementById('prepTimer'),
      startWaveBtn: document.getElementById('startWaveBtn'),
    };

    const keys: Record<string, boolean> = {};
    const pointer = { x: 0, y: 0 };
    const joystick = { active: false, dx: 0, dy: 0 };
    let selectedConstruction: any = null;
    let messageTimer: any = null;
    let forceMobile = false;
    let soundOn = true;
    let audioContext: AudioContext | null = null;
    let bgMusic: HTMLAudioElement | null = null;

    const DAY_SPEED = 0.00028;
    const AUTO_COLLECT_RADIUS = 34;
    const PC_BUILD_KEYS: Record<string, string> = { '1': 'fence', '2': 'tower', '3': 'helper' };

    function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
    function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
    function distance(a: {x:number, y:number}, b: {x:number, y:number}) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function canPay(inv: any, cost: any) { return Object.entries(cost).every(([k, v]) => inv[k] >= (v as number)); }
    function pay(inv: any, cost: any) { Object.entries(cost).forEach(([k, v]) => inv[k] -= (v as number)); }
    function isMobileLayout() { return forceMobile || window.innerWidth <= 760; }

    function showQuestMessage(text: string, duration = 2000) {
      if (!ui.questMessage) return;
      ui.questMessage.textContent = text;
      ui.questMessage.style.display = 'block';
      setTimeout(() => { if (ui.questMessage) ui.questMessage.style.display = 'none'; }, duration);
    }

    function showMessage(text: string) {
      if (!ui.messageBox) return;
      ui.messageBox.textContent = text;
      ui.messageBox.style.display = 'block';
      clearTimeout(messageTimer);
      messageTimer = setTimeout(() => { if (ui.messageBox) ui.messageBox.style.display = 'none'; }, 1500);
    }

    const isInCenter = (x: number, y: number) => {
      const clearW = WIDTH * 0.82; // Increased from 0.72
      const clearH = HEIGHT * 0.82;
      return x > WIDTH / 2 - clearW/2 && x < WIDTH / 2 + clearW/2 && 
             y > HEIGHT / 2 - clearH/2 && y < HEIGHT / 2 + clearH/2;
    };

    const getPos = (minX: number, maxX: number, minY: number, maxY: number) => {
      let x, y;
      let attempts = 0;
      do {
        x = rand(minX, maxX);
        y = rand(minY, maxY);
        attempts++;
      } while (isInCenter(x, y) && attempts < 100);
      return { x, y };
    };

    function nextResourceType() {
      const r = Math.random();
      if (r < 0.42) return 'wood';
      if (r < 0.74) return 'stone';
      if (r < 0.94) return 'fiber';
      return 'gold';
    }

    function makeResource(type: string) {
      const margin = 56;
      const pos = getPos(margin, WIDTH - margin, margin, HEIGHT - margin);
      return { id: Math.random().toString(36).slice(2), type, x: pos.x, y: pos.y, respawning: false };
    }

    function createFenceSegments(campfire: any) {
      const size = 232;
      const left = campfire.x - size / 2;
      const top = campfire.y - size / 2;
      const right = campfire.x + size / 2;
      const bottom = campfire.y + size / 2;
      const gateX = campfire.x;
      return [
        { id: 'topL', x1: left, y1: top, x2: gateX - 28, y2: top, hp: 140, maxHp: 140, kind: 'fence', level: 1 },
        { id: 'topR', x1: gateX + 28, y1: top, x2: right, y2: top, hp: 140, maxHp: 140, kind: 'fence', level: 1 },
        { id: 'left', x1: left, y1: top, x2: left, y2: bottom, hp: 140, maxHp: 140, kind: 'fence', level: 1 },
        { id: 'right', x1: right, y1: top, x2: right, y2: bottom, hp: 140, maxHp: 140, kind: 'fence', level: 1 },
        { id: 'bottom', x1: left, y1: bottom, x2: right, y2: bottom, hp: 140, maxHp: 140, kind: 'fence', level: 1 },
        { id: 'gate', x1: gateX - 26, y1: top, x2: gateX + 26, y2: top, hp: 170, maxHp: 170, kind: 'gate', level: 1 },
      ];
    }

    function initialState() {
      const campfire = { x: WIDTH / 2, y: HEIGHT / 2, radius: 122, hp: 500, maxHp: 500 };
      return {
        status: 'title',
        day: 1,
        wave: 1,
        waveTimer: 60,
        prepTimer: 15,
        isPrepPhase: true,
        timeElapsed: 0,
        spawnTimer: 0,
        timeOfDay: 0.42,
        cameraShake: 0,
        pulse: 0,
        effects: [] as any[],
        particles: [] as any[],
        drops: [] as any[],
        ambientParticles: Array.from({ length: 25 }, () => ({
          x: rand(0, WIDTH),
          y: rand(0, HEIGHT),
          vx: rand(0.2, 0.8),
          vy: rand(0.1, 0.4),
          size: rand(2, 4),
          color: Math.random() > 0.5 ? '#79a950' : '#4e7a33', // Leaf colors
          type: 'leaf'
        })),
        grass: Array.from({ length: 120 }, () => ({
          x: rand(0, WIDTH),
          y: rand(0, HEIGHT),
          type: Math.floor(rand(0, 3))
        })),
        player: {
          x: WIDTH / 2,
          y: HEIGHT / 2 + 66,
          speed: 2.6,
          health: 100,
          maxHealth: 100,
          facing: 'down',
          frame: 0,
          walkTimer: 0,
          wood: 0,
          stone: 0,
          fiber: 0,
          gold: 0,
          idleAttackTimer: 0,
          attackTimer: 0,
          attackAngle: 0,
          hitFlash: 0,
          attackCooldown: 48, // 0.8s
          autoAttackTimer: 0,
          damage: 15,
          defense: 0,
          hasHitThisAttack: false,
          equipment: {
            weapon: null as any,
            armor: null as any,
            accessory: null as any
          },
          inventory: [] as any[]
        },
        campfire,
        resources: Array.from({ length: 66 }, () => makeResource(nextResourceType())),
        enemies: [] as any[],
        summons: [] as any[],
        trees: Array.from({ length: 165 }, () => {
          const pos = getPos(-50, WIDTH + 50, -50, HEIGHT + 50);
          return { x: pos.x, y: pos.y, size: rand(0.9, 1.4) };
        }),
        rocks: Array.from({ length: 66 }, () => {
          const pos = getPos(20, WIDTH - 20, 20, HEIGHT - 20);
          return { x: pos.x, y: pos.y, size: rand(0.8, 1.3) };
        }),
        bushes: Array.from({ length: 135 }, () => {
          const pos = getPos(20, WIDTH - 20, 20, HEIGHT - 20);
          return { x: pos.x, y: pos.y, size: rand(0.7, 1.2) };
        }),
        mushrooms: Array.from({ length: 84 }, () => {
          const pos = getPos(30, WIDTH - 30, 30, HEIGHT - 30);
          return { x: pos.x, y: pos.y };
        }),
        constructions: {
          fenceBuilt: false,
          fenceSegments: [] as any[],
          towers: [] as any[],
          helpers: [] as any[]
        },
        towerSlots: [
          { x: WIDTH / 2 - 142, y: HEIGHT / 2 - 140, used: false },
          { x: WIDTH / 2 + 142, y: HEIGHT / 2 - 140, used: false },
          { x: WIDTH / 2 - 142, y: HEIGHT / 2 + 142, used: false },
          { x: WIDTH / 2 + 142, y: HEIGHT / 2 + 142, used: false },
        ],
        helperSlots: [
          { x: WIDTH / 2 - 80, y: HEIGHT / 2 + 26, used: false },
          { x: WIDTH / 2 + 80, y: HEIGHT / 2 + 26, used: false },
          { x: WIDTH / 2, y: HEIGHT / 2 - 56, used: false },
          { x: WIDTH / 2 - 120, y: HEIGHT / 2 - 40, used: false },
          { x: WIDTH / 2 + 120, y: HEIGHT / 2 - 40, used: false },
        ],
      };
    }

    let state = initialState();

    const weatherParticles = Array.from({ length: 55 }, () => ({
      x: rand(0, WIDTH), y: rand(0, HEIGHT), size: rand(1, 3), speedY: rand(0.16, 0.5), drift: rand(-0.12, 0.12)
    }));

    function addEffect(x: number, y: number, text: string, color: string, isCrit = false) {
      state.effects.push({ x, y, text, color, life: 1, vy: -0.45, isCrit });
    }

    function addParticles(x: number, y: number, color: string, count = 5) {
      for (let i = 0; i < count; i++) {
        state.particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4 - 2,
          life: 1,
          size: Math.random() * 3 + 2,
          color
        });
      }
    }

    function addPulse(x: number, y: number, color: string) {
      state.effects.push({ x, y, pulse: true, color, life: 1 });
    }

    function updateUI() {
      if (!gameState) return;
      const me = gameState.players[socketRef.current?.id || ''];
      if (!me) return;

      if (ui.healthFill) ui.healthFill.style.width = `${me.health}%`;
      if (ui.healthText) ui.healthText.textContent = `${Math.ceil(me.health)} / ${me.maxHealth}`;
      if (ui.woodCount) ui.woodCount.textContent = String(me.wood);
      if (ui.stoneCount) ui.stoneCount.textContent = String(me.stone);
      if (ui.fiberCount) ui.fiberCount.textContent = String(me.fiber);
      if (ui.goldCount) ui.goldCount.textContent = String(me.gold);
      if (ui.dayBadge) ui.dayBadge.textContent = `ONDA ${gameState.wave}`;

      if (ui.waveTimer) ui.waveTimer.textContent = `Tempo: ${Math.ceil(gameState.waveTimer)}s`;
      if (ui.prepOverlay) ui.prepOverlay.style.display = gameState.isPrepPhase ? 'flex' : 'none';
      if (ui.prepTimer) ui.prepTimer.textContent = `Preparação: ${Math.ceil(gameState.prepTimer)}s`;

      const mobile = isMobileLayout();
      if (ui.mobileUI) ui.mobileUI.style.display = mobile ? 'block' : 'none';
    }

    function closeUpgradePanel() {
      selectedConstruction = null;
      if (ui.upgradePanel) {
        ui.upgradePanel.classList.remove('active');
        setTimeout(() => {
          if (!selectedConstruction && ui.upgradePanel) ui.upgradePanel.style.display = 'none';
        }, 300);
      }
    }

    function triggerShake(amount: number) {
      state.cameraShake = amount;
    }

    function openUpgradePanel(target: any) {
      selectedConstruction = target;
      let title = target.label;
      if (target.type === 'helper' && target.ref.type) {
        const displayType = target.ref.type === 'warrior' ? 'Guerreiro' : target.ref.type === 'archer' ? 'Arqueiro' : 'Atirador';
        title = `Soldado (${displayType})`;
      }
      if (ui.panelTitle) ui.panelTitle.textContent = title || (target.type === 'tower' ? 'Torre' : target.type === 'house' ? 'Casa' : target.type === 'helper' ? 'Soldado de Alistagem' : 'Cerca');
      
      let info = `Nível ${target.ref.level} • Vida ${Math.ceil(target.ref.hp)}/${Math.ceil(target.ref.maxHp)}`;
      if (target.type === 'tower') info += ` • Dano: ${target.ref.damage}`;
      if (target.type === 'house') info += ` • Ouro/s: ${target.ref.goldRate}`;
      
      if (ui.panelDesc) ui.panelDesc.textContent = info;
      if (ui.upgradePanel) {
        ui.upgradePanel.style.display = 'block';
        // Force reflow
        ui.upgradePanel.offsetHeight;
        ui.upgradePanel.classList.add('active');
        triggerShake(6);
      }
    }

    ui.closePanelBtn?.addEventListener('touchstart', (e) => { e.preventDefault(); closeUpgradePanel(); });
    ui.closePanelBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeUpgradePanel();
    });
    
    const handleUpgrade = (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      if (selectedConstruction) {
        upgradeConstruction(selectedConstruction);
        if (selectedConstruction) openUpgradePanel(selectedConstruction);
      }
    };
    ui.upgradeBtn?.addEventListener('touchstart', handleUpgrade);
    ui.upgradeBtn?.addEventListener('click', handleUpgrade);

    const handleRepair = (e: any) => {
      e.preventDefault();
      e.stopPropagation();
      if (selectedConstruction) {
        repairConstruction(selectedConstruction);
        if (selectedConstruction) openUpgradePanel(selectedConstruction);
      }
    };
    ui.repairBtn?.addEventListener('touchstart', handleRepair);
    ui.repairBtn?.addEventListener('click', handleRepair);

    function initAudio() {
      if (audioContext) return;
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      bgMusic = new Audio();
      bgMusic.loop = true;
      bgMusic.volume = 0.3;
      bgMusic.src = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'; 
      if (soundOn) bgMusic.play().catch(() => {});
    }
    initAudioRef.current = initAudio;

    setPlayingRef.current = () => {
      state.status = 'playing';
      updateUI();
    };

    function updateMusic() {
      if (!bgMusic || !soundOn) return;
      
      const targetSrc = state.isPrepPhase 
        ? 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' 
        : state.wave % 5 === 0 
          ? 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' 
          : 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'; 
          
      if (bgMusic.src !== targetSrc) {
        bgMusic.src = targetSrc;
        bgMusic.play().catch(() => {});
      }
    }

    function toggleSound() {
      soundOn = !soundOn;
      if (bgMusic) {
        if (soundOn) bgMusic.play().catch(() => {});
        else bgMusic.pause();
      }
      if (ui.soundBtn) ui.soundBtn.textContent = soundOn ? '🔊' : '🔈';
    }
    (window as any).toggleSound = toggleSound;

    function updateWave() {
      if (state.status !== 'playing') return;

      if (state.isPrepPhase) {
        state.prepTimer -= 1/60;
        if (state.prepTimer <= 0) {
          startWave();
        }
      } else {
        state.waveTimer -= 1/60;
        if (state.waveTimer <= 0 && state.enemies.length === 0) {
          startPrep();
        }
      }
    }

    function startPrep() {
      state.isPrepPhase = true;
      state.prepTimer = 15;
      state.wave++;
      showQuestMessage(`ONDA ${state.wave - 1} CONCLUÍDA! PREPARE-SE!`, 3000);
      updateMusic();
    }

    function startWave() {
      state.isPrepPhase = false;
      state.waveTimer = 60;
      showQuestMessage(`ONDA ${state.wave} INICIADA!`, 3000);
      updateMusic();
    }
    
    // startWaveBtn listener removed from here

    // handleRestart removed from here

    document.getElementById('toggleMobileMode')?.addEventListener('click', () => {
      forceMobile = !forceMobile;
      updateUI();
      showMessage(forceMobile ? 'Simulação Android Ativa' : 'Modo PC Ativo');
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keys[key] = true;
      if (PC_BUILD_KEYS[key] && state.status === 'playing') {
        buyConstruction(PC_BUILD_KEYS[key]);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = (e.clientX - rect.left) * (canvas.width / rect.width);
      pointer.y = (e.clientY - rect.top) * (canvas.height / rect.height);
    });

    canvas.addEventListener('pointerdown', (e) => {
      if (state.status !== 'playing') return;
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (canvas.width / rect.width);
      const py = (e.clientY - rect.top) * (canvas.height / rect.height);
      
      const target = getConstructionAt(px, py);
      if (target) {
        openUpgradePanel(target);
      } else {
        if (!isMobileLayout()) closeUpgradePanel();
        playerAttack();
      }
    });

    canvas.addEventListener('click', (e) => {
      if (state.status !== 'playing' || isMobileLayout()) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = (e.clientX - rect.left) * (canvas.width / rect.width);
      pointer.y = (e.clientY - rect.top) * (canvas.height / rect.height);
      const target = getConstructionAt(pointer.x, pointer.y);
      if (target) openUpgradePanel(target);
      else closeUpgradePanel();
    });

    // Hotbar / Shop Menu listeners
    document.querySelectorAll('.hotbar-item').forEach((item, index) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const types = ['fence', 'tower', 'helper'];
        buyConstruction(types[index]);
        addParticles(state.player.x, state.player.y, '#ffd700', 4);
      });
    });

    // Joystick listeners
    ui.joystickBase?.addEventListener('pointerdown', startJoystick);
    ui.joystickBase?.addEventListener('pointermove', moveJoystick);
    ui.joystickBase?.addEventListener('pointerup', endJoystick);
    ui.joystickBase?.addEventListener('pointercancel', endJoystick);
    ui.joystickBase?.addEventListener('lostpointercapture', endJoystick);

    function startJoystick(e: any) {
      if (!isMobileLayout()) return;
      joystick.active = true;
      ui.joystickBase?.setPointerCapture?.(e.pointerId);
      moveJoystick(e);
    }

    function moveJoystick(e: any) {
      if (!joystick.active || !ui.joystickBase || !ui.joystickStick) return;
      const rect = ui.joystickBase.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const max = 40;
      const deadzone = 6;
      
      if (dist < deadzone) {
        joystick.dx = 0;
        joystick.dy = 0;
        ui.joystickStick.style.transform = 'translate(0px, 0px)';
        return;
      }

      if (dist > max) {
        dx = (dx / dist) * max;
        dy = (dy / dist) * max;
      }
      
      // Sensitivity curve
      const normalizedDist = (dist - deadzone) / (max - deadzone);
      const sensitivity = Math.pow(normalizedDist, 0.8); // Slight boost to low-end sensitivity
      
      joystick.dx = (dx / dist) * sensitivity;
      joystick.dy = (dy / dist) * sensitivity;
      ui.joystickStick.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    function endJoystick() {
      joystick.active = false;
      joystick.dx = 0;
      joystick.dy = 0;
      if (ui.joystickStick) ui.joystickStick.style.transform = 'translate(0px, 0px)';
    }

    function getConstructionAt(x: number, y: number) {
      // Campfire first
      if (Math.hypot(x - state.campfire.x, y - state.campfire.y) < 40) {
        return { type: 'campfire', label: 'Fogueira', ref: state.campfire };
      }
      for (const tower of state.constructions.towers) {
        if (Math.hypot(x - tower.x, y - tower.y) < 26) return { type: 'tower', label: 'Torre', ref: tower };
      }
      for (const helper of state.constructions.helpers) {
        if (Math.hypot(x - helper.x, y - helper.y) < 22) return { type: 'helper', label: 'Soldado', ref: helper };
      }
      for (const seg of state.constructions.fenceSegments) {
        const c = { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 };
        if (Math.hypot(x - c.x, y - c.y) < 34) return { type: 'fence', label: seg.kind === 'gate' ? 'Portão' : 'Cerca', ref: seg };
      }
      return null;
    }

    function upgradeConstruction(target: any) {
      const p = state.player;
      const level = target.ref.level || 1;
      const upgradeCost = 5 + (level * 5); // Gold cost increases per level

      if (p.gold < upgradeCost) return showMessage(`Melhorar: ${upgradeCost} ouro`);
      
      p.gold -= upgradeCost;
      state.cameraShake = 6;
      target.ref.level = level + 1;
      target.ref.maxHp += 50;
      target.ref.hp = target.ref.maxHp;

      if (target.type === 'campfire') {
        target.ref.radius += 10;
        addEffect(target.ref.x, target.ref.y - 24, 'Fogo Aumentado!', '#ffd700');
      } else if (target.type === 'tower') {
        target.ref.damage += 5;
        target.ref.range += 10;
        addEffect(target.ref.x, target.ref.y - 24, '+5 Dano!', '#ffd700');
      } else if (target.type === 'helper') {
        target.ref.damage += 4;
        target.ref.range += 10;
        addEffect(target.ref.x, target.ref.y - 20, 'Soldado Melhorado!', '#ffd700');
      } else if (target.type === 'fence') {
        addEffect((target.ref.x1 + target.ref.x2) / 2, (target.ref.y1 + target.ref.y2) / 2 - 12, 'Cerca Reforçada!', '#ffd700');
      }
    }

    function repairConstruction(target: any) {
      const p = state.player;
      const missing = target.ref.maxHp - target.ref.hp;
      if (missing <= 0) return showMessage('Já está inteira!');
      
      const cost = { wood: 5, stone: 2 };
      if (!canPay(p, cost)) return showMessage(`Reparar: 5 madeira, 2 pedra`);
      
      pay(p, cost);
      state.cameraShake = 4;
      target.ref.hp = Math.min(target.ref.maxHp, target.ref.hp + 50);
      addEffect(target.ref.x || ((target.ref.x1 + target.ref.x2) / 2), (target.ref.y || ((target.ref.y1 + target.ref.y2) / 2)) - 16, '+50 HP!', '#89c36a');
    }

    function buyConstruction(type: string) {
      const p = state.player;
      if (type === 'fence') {
        if (!state.constructions.fenceBuilt) {
          const cost = { wood: 10, stone: 6 };
          if (!canPay(p, cost)) return showMessage(`Cerca: ${cost.wood} madeira, ${cost.stone} pedra`);
          pay(p, cost);
          state.cameraShake = 8;
          state.constructions.fenceBuilt = true;
          state.constructions.fenceSegments = createFenceSegments(state.campfire);
          addEffect(state.campfire.x, state.campfire.y - 42, 'cerca construída!', '#dbc9a9');
          return showMessage('Cerca construída!');
        }
        const cost = { wood: 8, stone: 5 };
        if (!canPay(p, cost)) return showMessage(`Melhorar Cerca: ${cost.wood} madeira, ${cost.stone} pedra`);
        pay(p, cost);
        state.cameraShake = 6;
        state.constructions.fenceSegments.forEach(seg => { seg.level += 1; seg.maxHp += 80; seg.hp = seg.maxHp; });
        addEffect(state.campfire.x, state.campfire.y - 42, 'cerca aprimorada!', '#dbc9a9');
        return showMessage('Cerca aprimorada!');
      }
      if (type === 'tower') {
        const slot = state.towerSlots.find(s => !s.used);
        if (!slot) return showMessage('Nenhum espaço disponível!');
        const cost = { wood: 8, stone: 4 };
        if (!canPay(p, cost)) return showMessage(`Torre: ${cost.wood} madeira, ${cost.stone} pedra`);
        pay(p, cost);
        state.cameraShake = 8;
        slot.used = true;
        state.constructions.towers.push({ x: slot.x, y: slot.y, level: 1, hp: 100, maxHp: 100, damage: 10, range: 130, cooldown: 0 });
        addEffect(slot.x, slot.y - 22, 'torre construída!', '#d3b071');
        return showMessage('Torre construída!');
      }
      if (type === 'helper') {
        const slot = state.helperSlots.find(s => !s.used);
        if (!slot) return showMessage('Nenhum espaço disponível!');
        const cost = { gold: 8 };
        if (!canPay(p, cost)) return showMessage(`Soldado: ${cost.gold} ouro`);
        pay(p, cost);
        state.cameraShake = 8;
        slot.used = true;
        
        const types = ['warrior', 'archer', 'mage', 'sniper', 'summoner'];
        const hType = types[state.constructions.helpers.length % types.length];
        
        let hData = { 
          x: slot.x, y: slot.y, 
          homeX: slot.x, homeY: slot.y, 
          level: 1, type: hType, 
          hp: 100, maxHp: 100, 
          damage: 8, range: 120, 
          cooldown: 0,
          summonTimer: 0
        };
        
        if (hType === 'warrior') { hData.hp = 180; hData.maxHp = 180; hData.damage = 16; hData.range = 130; }
        if (hType === 'sniper') { hData.hp = 80; hData.maxHp = 80; hData.damage = 32; hData.range = 260; hData.cooldown = 100; }
        if (hType === 'mage') { hData.hp = 90; hData.maxHp = 90; hData.damage = 12; hData.range = 180; hData.cooldown = 60; }
        if (hType === 'summoner') { hData.hp = 100; hData.maxHp = 100; hData.damage = 0; hData.range = 200; hData.cooldown = 180; }
        
        state.constructions.helpers.push(hData);
        const displayType = hType === 'warrior' ? 'Guerreiro' : hType === 'archer' ? 'Arqueiro' : hType === 'mage' ? 'Mago' : hType === 'sniper' ? 'Atirador' : 'Invocador';
        addEffect(slot.x, slot.y - 20, `${displayType} alistado!`, '#8ed170');
        return showMessage(`${displayType} alistado!`);
      }
    }

    function movePlayer() {
      let xAxis = 0;
      let yAxis = 0;
      if (keys['w'] || keys['arrowup']) yAxis -= 1;
      if (keys['s'] || keys['arrowdown']) yAxis += 1;
      if (keys['a'] || keys['arrowleft']) xAxis -= 1;
      if (keys['d'] || keys['arrowright']) xAxis += 1;

      if (joystick.active) {
        xAxis += joystick.dx;
        yAxis += joystick.dy;
      }

      const len = Math.hypot(xAxis, yAxis);
      let moving = false;
      if (len > 0.06) {
        const speedMult = Math.min(1, len);
        xAxis /= len;
        yAxis /= len;
        state.player.x += xAxis * state.player.speed * speedMult;
        state.player.y += yAxis * state.player.speed * speedMult;
        moving = true;
        if (Math.abs(xAxis) > Math.abs(yAxis)) state.player.facing = xAxis < 0 ? 'left' : 'right';
        else state.player.facing = yAxis < 0 ? 'up' : 'down';
      }

      state.player.x = clamp(state.player.x, 22, WIDTH - 22);
      state.player.y = clamp(state.player.y, 22, HEIGHT - 22);

      if (moving) {
        state.player.walkTimer += 1;
        if (state.player.walkTimer > 10) {
          state.player.walkTimer = 0;
          state.player.frame = (state.player.frame + 1) % 2;
        }
      } else {
        state.player.walkTimer = 0;
        state.player.frame = 0;
      }
    }

    function autoCollectResources() {
      state.resources = state.resources.filter(res => {
        if (res.respawning) return true;
        if (Math.hypot(state.player.x - res.x, state.player.y - res.y) <= AUTO_COLLECT_RADIUS) {
          const type = res.type;
          if (type === 'egg') {
            state.player.gold += 20;
            addEffect(res.x, res.y - 15, '+20 Ouro!', '#ffd700');
            addPulse(res.x, res.y, '#fff');
            showQuestMessage('¡Encontrou o Ovo de Ouro!', 3000);
            return false;
          }
          const color = type === 'wood' ? '#8c5a39' : type === 'stone' ? '#808074' : type === 'fiber' ? '#79a950' : '#ffd700';
          addParticles(res.x, res.y, color, 8);
          res.respawning = true;
          if (type === 'wood') state.player.wood += 1;
          if (type === 'stone') state.player.stone += 1;
          if (type === 'fiber') state.player.fiber += 1;
          if (type === 'gold') state.player.gold += 1;
          addEffect(res.x, res.y - 16, `+1 ${type === 'wood' ? 'madeira' : type === 'stone' ? 'pedra' : type === 'fiber' ? 'fibra' : 'ouro'}`, '#e4d0a4');
          res.x = -9999;
          res.y = -9999;
          setTimeout(() => {
            res.type = nextResourceType();
            const pos = getPos(60, WIDTH - 60, 60, HEIGHT - 60);
            res.x = pos.x;
            res.y = pos.y;
            res.respawning = false;
          }, 2400);
        }
        return true;
      });
    }

    function playerAttack() {
      if (!socketRef.current || !isJoined || !gameState) return;
      const me = gameState.players[socketRef.current.id];
      if (!me || me.attackTimer > 0) return;

      // Calculate angle from player to mouse/pointer
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mouseX = (pointer.x - rect.left) * scaleX;
      const mouseY = (pointer.y - rect.top) * scaleY;
      const angle = Math.atan2(mouseY - me.y, mouseX - me.x);

      socketRef.current.emit('playerAttack', roomId || 'default', angle);
    }

    // Expose to window for JSX
    (window as any).playerAttack = playerAttack;
    (window as any).closeUpgradePanel = () => { if (ui.upgradePanel) ui.upgradePanel.style.display = 'none'; };

    function spawnEnemy() {
      if (state.isPrepPhase) return;
      
      state.spawnTimer--;
      if (state.spawnTimer <= 0) {
        // Difficulty scales with wave
        const waveScale = 1 + (state.wave - 1) * 0.2;
        state.spawnTimer = Math.max(20, 120 - state.wave * 5);
        
        const side = Math.floor(Math.random() * 4);
        let x, y;
        if (side === 0) { x = rand(0, WIDTH); y = -50; }
        else if (side === 1) { x = rand(0, WIDTH); y = HEIGHT + 50; }
        else if (side === 2) { x = -50; y = rand(0, HEIGHT); }
        else { x = WIDTH + 50; y = rand(0, HEIGHT); }

        const types = ['slime', 'goblin', 'skeleton', 'orc', 'knight'];
        const typeIndex = Math.min(types.length - 1, Math.floor(state.wave / 3));
        const type = types[Math.floor(Math.random() * (typeIndex + 1))];
        
        let hp = 20 * waveScale;
        let damage = 5 * waveScale;
        let speed = 1.2 + Math.min(1, state.wave * 0.05);
        let color = '#79a950';
        let size = 12;

        if (type === 'goblin') { hp = 35 * waveScale; damage = 8 * waveScale; speed = 1.6; color = '#4e7a33'; size = 14; }
        if (type === 'skeleton') { hp = 50 * waveScale; damage = 12 * waveScale; speed = 1.0; color = '#e0e0e0'; size = 16; }
        if (type === 'orc') { hp = 100 * waveScale; damage = 20 * waveScale; speed = 0.8; color = '#5d4037'; size = 22; }
        if (type === 'knight') { hp = 200 * waveScale; damage = 30 * waveScale; speed = 0.7; color = '#78909c'; size = 24; }

        state.enemies.push({
          id: Math.random().toString(36).slice(2),
          type, x, y, vx: 0, vy: 0, hp, maxHp: hp, damage, speed, color, size, hitFlash: 0,
          aiState: 'attack', aiTimer: 0
        });
      }
    }

    function distToSegment(p: {x: number, y: number}, seg: any) {
      const { x1, y1, x2, y2 } = seg;
      const l2 = Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2);
      if (l2 === 0) return Math.hypot(p.x - x1, p.y - y1);
      let t = ((p.x - x1) * (x2 - x1) + (p.y - y1) * (y2 - y1)) / l2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(p.x - (x1 + t * (x2 - x1)), p.y - (y1 + t * (y2 - y1)));
    }

    function segmentCenter(seg: any) { return { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 }; }

    function updateEnemies() {
      state.enemies = state.enemies.filter(e => {
        if (e.hp <= 0 && !e.dying) {
          e.dying = 30; // 30 frames of death animation
          
          // Drop system
          if (Math.random() < 0.15 + state.wave * 0.01) {
            const r = Math.random();
            let lootType = 'herb';
            let lootName = 'Erva Medicinal';
            if (r < 0.1) { lootType = 'sword'; lootName = 'Espada de Bronze'; }
            else if (r < 0.25) { lootType = 'ring'; lootName = 'Anel de Velocidade'; }
            else if (r < 0.45) { lootType = 'boot'; lootName = 'Bota de Mercúrio'; }
            
            state.drops.push({
              x: e.x, y: e.y,
              type: lootType,
              name: lootName,
              life: 600 // 10s
            });
          }
        }
        
        if (e.dying === undefined) {
          // Improved AI
          e.aiTimer = (e.aiTimer || 0) - 1;
          
          // Target selection: Campfire, Player, or nearest construction
          let targetX = state.campfire.x;
          let targetY = state.campfire.y;
          let targetDist = Math.hypot(e.x - targetX, e.y - targetY);
          
          const pDist = Math.hypot(e.x - state.player.x, e.y - state.player.y);
          if (pDist < targetDist) {
            targetX = state.player.x;
            targetY = state.player.y;
            targetDist = pDist;
          }
          
          // Strategic retreat if low health
          if (e.hp < e.maxHp * 0.2 && e.aiState !== 'retreat') {
            e.aiState = 'retreat';
            e.aiTimer = 120;
          }
          
          if (e.aiState === 'retreat') {
            const ang = Math.atan2(e.y - targetY, e.x - targetX);
            e.vx += Math.cos(ang) * e.speed * 0.1;
            e.vy += Math.sin(ang) * e.speed * 0.1;
            if (e.aiTimer <= 0) e.aiState = 'attack';
          } else {
            const ang = Math.atan2(targetY - e.y, targetX - e.x);
            e.vx += Math.cos(ang) * e.speed * 0.08;
            e.vy += Math.sin(ang) * e.speed * 0.08;
          }

          // Friction
          e.vx *= 0.92;
          e.vy *= 0.92;
          e.x += e.vx;
          e.y += e.vy;

          if (e.hitFlash > 0) e.hitFlash--;

          // Damage player or constructions
          if (targetDist < e.size + 15) {
            if (targetX === state.player.x) {
              const finalDmg = Math.max(1, e.damage - state.player.defense);
              state.player.health -= finalDmg / 60;
              state.player.hitFlash = 5;
            } else if (targetX === state.campfire.x) {
              state.campfire.hp -= e.damage / 60;
            }
          }
          
          // Fence collision
          for (const seg of state.constructions.fenceSegments) {
            const d = distToSegment({x: e.x, y: e.y}, seg);
            if (d < e.size + 8) {
              seg.hp -= e.damage / 60;
              const ang = Math.atan2(e.y - (seg.y1 + seg.y2)/2, e.x - (seg.x1 + seg.x2)/2);
              e.vx += Math.cos(ang) * 0.5;
              e.vy += Math.sin(ang) * 0.5;
            }
          }
        }
        
        if (e.dying !== undefined) {
          e.dying--;
          if (e.dying <= 0) {
            // Smoke effect at the end
            for (let i = 0; i < 8; i++) {
              state.particles.push({
                x: e.x, y: e.y,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                life: 0.6,
                size: rand(4, 8),
                color: '#ffffff'
              });
            }
            return false;
          }
        }
        
        return e.x > -100 && e.x < WIDTH + 100 && e.y > -100 && e.y < HEIGHT + 100;
      });
    }

    function updateDrops() {
      for (const d of state.drops) {
        d.life--;
        const dist = Math.hypot(state.player.x - d.x, state.player.y - d.y);
        if (dist < 25) {
          d.life = 0; // Collect
          addEffect(d.x, d.y - 15, d.name, '#ffd700'); // Golden text
          showQuestMessage(`¡Obteve ${d.name}!`);
          
          if (d.type === 'sword') {
            state.player.damage += 3;
            state.player.equipment.weapon = d;
          }
          if (d.type === 'ring') {
            state.player.attackCooldown = Math.max(12, state.player.attackCooldown - 6);
            state.player.equipment.accessory = d;
          }
          if (d.type === 'boot') {
            state.player.speed += 0.2;
          }
          if (d.type === 'herb') {
            state.player.health = Math.min(100, state.player.health + 20);
          }
          // Armor drop (could be added to enemy drops)
          if (d.type === 'armor') {
            state.player.defense += 5;
            state.player.equipment.armor = d;
          }
        }
      }
      state.drops = state.drops.filter(d => d.life > 0);

      // Rare Golden Egg
      if (Math.random() < 0.0005) {
        state.resources.push({
          id: Math.random().toString(36).substring(2, 9),
          x: rand(50, WIDTH - 50),
          y: rand(50, HEIGHT - 50),
          type: 'egg',
          respawning: false
        });
      }
    }

    function updateDefenders() {
      // Static Towers
      for (const tower of state.constructions.towers) {
        tower.cooldown = Math.max(0, tower.cooldown - 1);
        if (tower.cooldown > 0) continue;
        let target = null;
        let best = Infinity;
        for (const enemy of state.enemies) {
          const d = Math.hypot(tower.x - enemy.x, tower.y - enemy.y);
          if (d < tower.range && d < best) { best = d; target = enemy; }
        }
        if (target) {
          target.hp -= tower.damage;
          target.hitFlash = 5;
          addEffect(target.x, target.y, `-${tower.damage}`, '#ff5252');
          tower.cooldown = 36;
          addPulse(target.x, target.y, '#f1d28c');
          if (target.hp <= 0) {
            state.player.gold += 1;
            addEffect(target.x, target.y - 12, '+1 ouro', '#e0c055');
          }
        }
      }

      // Dynamic Helpers
      for (const h of state.constructions.helpers) {
        h.cooldown = Math.max(0, h.cooldown - 1);
        
        let target = null;
        let best = Infinity;
        for (const enemy of state.enemies) {
          const d = Math.hypot(h.x - enemy.x, h.y - enemy.y);
          if (d < h.range && d < best) { best = d; target = enemy; }
        }

        if (h.type === 'warrior') {
          if (target) {
            const ang = Math.atan2(target.y - h.y, target.x - h.x);
            const dist = Math.hypot(target.x - h.x, target.y - h.y);
            h.facing = target.x < h.x ? 'left' : 'right';
            if (dist > 22) {
              h.x += Math.cos(ang) * 3.0;
              h.y += Math.sin(ang) * 3.0;
              h.walkTimer = (h.walkTimer || 0) + 1;
            } else if (h.cooldown === 0) {
              target.hp -= h.damage;
              target.hitFlash = 5;
              target.vx += Math.cos(ang) * 4;
              target.vy += Math.sin(ang) * 4;
              h.cooldown = 32;
              addEffect(target.x, target.y, `-${h.damage}`, '#ff5252');
              // Slash effect for Warrior
              state.particles.push({
                x: (h.x + target.x) / 2,
                y: (h.y + target.y) / 2,
                vx: 0, vy: 0,
                life: 0.2,
                size: 20,
                color: 'rgba(255, 255, 255, 0.6)',
                type: 'slash'
              });
              if (target.hp <= 0) { state.player.gold += 1; }
            }
          } else {
            const ang = Math.atan2(h.homeY - h.y, h.homeX - h.x);
            const dist = Math.hypot(h.homeX - h.x, h.homeY - h.y);
            if (dist > 3) {
              h.x += Math.cos(ang) * 2.0;
              h.y += Math.sin(ang) * 2.0;
              h.walkTimer = (h.walkTimer || 0) + 1;
              h.facing = h.homeX < h.x ? 'left' : 'right';
            } else {
              h.walkTimer = 0;
            }
          }
        } else if (h.type === 'mage') {
          if (target) {
            h.facing = target.x < h.x ? 'left' : 'right';
            if (h.cooldown === 0) {
              h.cooldown = 60;
              addPulse(h.x, h.y, '#9c27b0');
              // AOE Damage
              for (const e of state.enemies) {
                const ed = Math.hypot(target.x - e.x, target.y - e.y);
                if (ed < 50) {
                  e.hp -= h.damage;
                  e.hitFlash = 5;
                  addEffect(e.x, e.y, `-${h.damage}`, '#ba68c8');
                  if (e.hp <= 0) { state.player.gold += 1; }
                }
              }
              addPulse(target.x, target.y, '#e1bee7');
            }
          }
        } else if (h.type === 'summoner') {
          if (target) h.facing = target.x < h.x ? 'left' : 'right';
          if (h.cooldown === 0) {
            h.cooldown = 240;
            addPulse(h.x, h.y, '#4db6ac');
            state.summons.push({
              x: h.x, y: h.y,
              vx: 0, vy: 0,
              hp: 30,
              damage: 5,
              speed: 1.8,
              life: 600, // 10 seconds
              cooldown: 0
            });
          }
        } else {
          // Archer / Sniper
          if (target && h.cooldown === 0) {
            target.hp -= h.damage;
            target.hitFlash = 5;
            h.cooldown = h.type === 'sniper' ? 110 : 28;
            addEffect(target.x, target.y, `-${h.damage}`, '#ff5252');
            addPulse(target.x, target.y, h.type === 'sniper' ? '#ff4444' : '#f1d28c');
            if (target.hp <= 0) { state.player.gold += 1; }
          }
        }
      }
    }

    function updatePlayerCombat() {
      state.player.idleAttackTimer = Math.max(0, state.player.idleAttackTimer - 1);
      state.player.attackTimer = Math.max(0, state.player.attackTimer - 1);
      state.player.autoAttackTimer = Math.max(0, state.player.autoAttackTimer - 1);

      // Start Attack
      if (state.player.autoAttackTimer <= 0) {
        let nearest = null;
        let bestDist = 100; // Search range slightly larger than hit range
        for (const e of state.enemies) {
          const d = Math.hypot(state.player.x - e.x, state.player.y - e.y);
          if (d < bestDist) {
            bestDist = d;
            nearest = e;
          }
        }

        if (nearest) {
          state.player.autoAttackTimer = state.player.attackCooldown;
          state.player.attackTimer = 14; // Slightly longer animation
          state.player.attackAngle = Math.atan2(nearest.y - state.player.y, nearest.x - state.player.x);
          state.player.hasHitThisAttack = false; // Flag to prevent multiple hits in one swing
          
          // Lunge forward
          const lunge = 4;
          state.player.x += Math.cos(state.player.attackAngle) * lunge;
          state.player.y += Math.sin(state.player.attackAngle) * lunge;
        }
      }

      // Execute Damage (when slash is halfway)
      if (state.player.attackTimer > 0 && state.player.attackTimer <= 7 && !state.player.hasHitThisAttack) {
        state.player.hasHitThisAttack = true;
        let hitAny = false;
        const hitRange = 85;
        const hitArc = 1.4; // Radians (~80 degrees)

        for (const e of state.enemies) {
          const d = Math.hypot(state.player.x - e.x, state.player.y - e.y);
          if (d < hitRange) {
            const angleToEnemy = Math.atan2(e.y - state.player.y, e.x - state.player.x);
            let diff = angleToEnemy - state.player.attackAngle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;

            if (Math.abs(diff) < hitArc / 2) {
              hitAny = true;
              const isCrit = Math.random() < 0.1;
              const dmg = isCrit ? Math.round(state.player.damage * 1.5) : state.player.damage;
              
              e.hp -= dmg;
              e.hitFlash = 6;
              const kb = isCrit ? 12 : 8;
              e.vx += Math.cos(state.player.attackAngle) * kb;
              e.vy += Math.sin(state.player.attackAngle) * kb;
              
              addEffect(e.x, e.y, isCrit ? `¡CRÍTICO! -${dmg}` : `-${dmg}`, isCrit ? '#ffeb3b' : '#ff5252', isCrit);
              
              // Impact particles
              const pCount = isCrit ? 8 : 3;
              for(let i=0; i<pCount; i++) {
                state.particles.push({
                  x: e.x, y: e.y,
                  vx: (Math.random()-0.5)*6, vy: (Math.random()-0.5)*6,
                  life: 0.6, size: isCrit ? 4 : 3, color: isCrit ? '#ffeb3b' : '#fff'
                });
              }
            }
          }
        }

        if (hitAny) {
          triggerShake(4);
          addPulse(state.player.x + Math.cos(state.player.attackAngle) * 40, 
                   state.player.y + Math.sin(state.player.attackAngle) * 40, 
                   'rgba(255,255,255,0.3)');
        }
      }
    }

    function updateEffects() {
      for (const effect of state.effects) {
        effect.life -= 0.02;
        effect.y += effect.vy || 0;
      }
      state.effects = state.effects.filter(e => e.life > 0);

      for (const p of state.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // Gravity
        p.life -= 0.025;
      }
      state.particles = state.particles.filter(p => p.life > 0);

      // Ambient particles (leaves/dust)
      for (const ap of state.ambientParticles) {
        ap.x += ap.vx;
        ap.y += ap.vy;
        if (ap.x > WIDTH + 20) ap.x = -20;
        if (ap.y > HEIGHT + 20) ap.y = -20;
      }

      state.cameraShake *= 0.88;
    }

    function updateGame() {
      if (state.status !== 'playing') return;

      state.timeElapsed += 1/60;
      state.timeOfDay += DAY_SPEED;
      state.pulse = (state.pulse + 0.05) % (Math.PI * 2);
      if (state.timeOfDay >= 1) {
        state.timeOfDay = 0;
        state.day += 1;
      }

      updateWave();
      movePlayer();
      autoCollectResources();
      spawnEnemy();
      updateEnemies();
      updateSummons();
      updateDrops();
      updateDefenders();
      updatePlayerCombat();
      updateEffects();
      state.cameraShake *= 0.88;

      if (state.player.health <= 0 || state.campfire.hp <= 0) {
        state.status = 'gameover';
        if (ui.daysSurvived) ui.daysSurvived.textContent = String(state.wave);
        if (ui.finalGold) ui.finalGold.textContent = String(state.player.gold);
        if (ui.gameOverOverlay) ui.gameOverOverlay.style.display = 'flex';
        closeUpgradePanel();
      }

      updateUI();
    }

    function drawGround() {
      const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      grad.addColorStop(0, '#1e2b1b');
      grad.addColorStop(1, '#111a10');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Grass tufts
      state.grass.forEach(g => {
        ctx.fillStyle = g.type === 0 ? 'rgba(90,115,61,0.15)' : g.type === 1 ? 'rgba(46,62,32,0.12)' : 'rgba(121,169,80,0.08)';
        if (g.type === 2) {
          // Little grass blade
          ctx.beginPath();
          ctx.moveTo(g.x, g.y);
          ctx.lineTo(g.x - 2, g.y - 4);
          ctx.lineTo(g.x + 2, g.y);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.ellipse(g.x, g.y, 12, 4, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Dirt patches
      ctx.fillStyle = 'rgba(79, 54, 33, 0.06)';
      for (let i = 0; i < 15; i++) {
        const x = (i * 137 + 40) % WIDTH;
        const y = (i * 183 + 120) % HEIGHT;
        ctx.beginPath();
        ctx.ellipse(x, y, 60, 22, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Small stones and wood debris
      for (let i = 0; i < 20; i++) {
        const x = (i * 197 + 100) % WIDTH;
        const y = (i * 223 + 50) % HEIGHT;
        if (i % 2 === 0) {
          // Tiny stone
          ctx.fillStyle = 'rgba(128, 128, 116, 0.2)';
          ctx.fillRect(x, y, 4, 3);
        } else {
          // Tiny wood bit
          ctx.fillStyle = 'rgba(108, 70, 44, 0.2)';
          ctx.fillRect(x, y, 6, 2);
        }
      }
    }

    function drawTree(x: number, y: number, s: number) {
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath();
      ctx.ellipse(x, y + 20 * s, 26 * s, 10 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Trunk
      ctx.fillStyle = '#2a1a0f'; // Shadow side
      ctx.fillRect(x - 6 * s, y + 4 * s, 12 * s, 26 * s);
      ctx.fillStyle = '#3a2515'; // Main
      ctx.fillRect(x - 6 * s, y + 4 * s, 9 * s, 26 * s);
      ctx.fillStyle = '#4c301b'; // Highlight
      ctx.fillRect(x - 2 * s, y + 4 * s, 3 * s, 26 * s);
      
      // Leaves (Bottom Layer)
      ctx.fillStyle = '#0f2211'; 
      ctx.beginPath();
      ctx.arc(x, y + 2 * s, 22 * s, 0, Math.PI * 2);
      ctx.arc(x - 16 * s, y + 8 * s, 16 * s, 0, Math.PI * 2);
      ctx.arc(x + 16 * s, y + 8 * s, 16 * s, 0, Math.PI * 2);
      ctx.fill();
      
      // Leaves (Middle Layer)
      ctx.fillStyle = '#1a331c';
      ctx.beginPath();
      ctx.arc(x, y - 4 * s, 19 * s, 0, Math.PI * 2);
      ctx.arc(x - 12 * s, y, 14 * s, 0, Math.PI * 2);
      ctx.arc(x + 12 * s, y, 14 * s, 0, Math.PI * 2);
      ctx.fill();
      
      // Leaves (Top Layer)
      ctx.fillStyle = '#234425';
      ctx.beginPath();
      ctx.arc(x - 5 * s, y - 8 * s, 15 * s, 0, Math.PI * 2);
      ctx.arc(x + 5 * s, y - 8 * s, 15 * s, 0, Math.PI * 2);
      ctx.fill();
      
      // Highlights
      ctx.fillStyle = '#315b31';
      ctx.beginPath();
      ctx.arc(x - 8 * s, y - 12 * s, 10 * s, 0, Math.PI * 2);
      ctx.arc(x + 6 * s, y - 10 * s, 9 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawBush(x: number, y: number, s: number) {
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, y + 10 * s, 20 * s, 7 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Bush layers
      ctx.fillStyle = '#1a331c'; // Darker
      ctx.beginPath();
      ctx.arc(x, y, 14 * s, 0, Math.PI * 2);
      ctx.arc(x - 12 * s, y + 3 * s, 10 * s, 0, Math.PI * 2);
      ctx.arc(x + 12 * s, y + 3 * s, 10 * s, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#33522c'; // Main
      ctx.beginPath();
      ctx.arc(x, y - 2 * s, 11 * s, 0, Math.PI * 2);
      ctx.arc(x - 8 * s, y + 1 * s, 8 * s, 0, Math.PI * 2);
      ctx.arc(x + 8 * s, y + 1 * s, 8 * s, 0, Math.PI * 2);
      ctx.fill();
      
      // Berries?
      if (s > 1.1) {
        ctx.fillStyle = '#8b0000';
        ctx.beginPath();
        ctx.arc(x - 5 * s, y - 4 * s, 2 * s, 0, Math.PI * 2);
        ctx.arc(x + 7 * s, y + 2 * s, 2 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawRock(x: number, y: number, s: number) {
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(x, y + 10 * s, 16 * s, 6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Rock body (shading)
      ctx.fillStyle = '#40403a'; // Darkest
      ctx.beginPath();
      ctx.moveTo(x - 14 * s, y + 6 * s);
      ctx.lineTo(x - 10 * s, y - 8 * s);
      ctx.lineTo(x + 6 * s, y - 11 * s);
      ctx.lineTo(x + 16 * s, y);
      ctx.lineTo(x + 10 * s, y + 12 * s);
      ctx.lineTo(x - 8 * s, y + 13 * s);
      ctx.closePath();
      ctx.fill();
      
      ctx.fillStyle = '#60605a'; // Main
      ctx.beginPath();
      ctx.moveTo(x - 11 * s, y + 4 * s);
      ctx.lineTo(x - 7 * s, y - 5 * s);
      ctx.lineTo(x + 4 * s, y - 7 * s);
      ctx.lineTo(x + 13 * s, y);
      ctx.lineTo(x + 7 * s, y + 9 * s);
      ctx.lineTo(x - 5 * s, y + 10 * s);
      ctx.closePath();
      ctx.fill();
      
      // Highlight
      ctx.fillStyle = '#808074'; 
      ctx.beginPath();
      ctx.moveTo(x - 7 * s, y + 1 * s);
      ctx.lineTo(x - 4 * s, y - 3 * s);
      ctx.lineTo(x + 2 * s, y - 5 * s);
      ctx.lineTo(x + 9 * s, y);
      ctx.lineTo(x + 4 * s, y + 5 * s);
      ctx.closePath();
      ctx.fill();
    }

    function drawMushroom(x: number, y: number) {
      ctx.fillStyle = '#d8cdb5';
      ctx.fillRect(x - 2, y + 3, 4, 6);
      ctx.fillStyle = '#ba6744';
      ctx.beginPath();
      ctx.arc(x, y + 2, 7, Math.PI, 0);
      ctx.fill();
    }

    function drawCampfire() {
      const fire = state.campfire;
      const t = performance.now() * 0.01;
      const flicker = Math.sin(t * 0.95) * 2.1;

      // Glow
      const glow = ctx.createRadialGradient(fire.x, fire.y, 0, fire.x, fire.y, fire.radius + 42 + flicker);
      glow.addColorStop(0, 'rgba(255,180,83,0.32)');
      glow.addColorStop(0.55, 'rgba(229,114,43,0.16)');
      glow.addColorStop(1, 'rgba(229,114,43,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(fire.x, fire.y, fire.radius + 42 + flicker, 0, Math.PI * 2);
      ctx.fill();

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(fire.x, fire.y + 18, 28, 11, 0, 0, Math.PI * 2);
      ctx.fill();

      // Logs
      ctx.fillStyle = '#3a2515'; 
      ctx.save();
      ctx.translate(fire.x, fire.y + 8);
      ctx.rotate(0.75);
      ctx.fillRect(-16, -3, 32, 6);
      ctx.rotate(-1.5);
      ctx.fillRect(-16, -3, 32, 6);
      ctx.restore();

      // Flames (Pixelated style)
      const flameCount = 4;
      for (let i = 0; i < flameCount; i++) {
        const ft = t + i * 1.5;
        const fx = fire.x + Math.sin(ft * 0.6) * 5;
        const fy = fire.y - 4 - i * 7 + Math.cos(ft * 0.9) * 4;
        const fs = 14 - i * 3 + flicker;
        
        ctx.fillStyle = i === 0 ? '#ff4d00' : i === 1 ? '#ff9500' : i === 2 ? '#ffea00' : '#ffffff';
        ctx.beginPath();
        ctx.moveTo(fx - fs, fy);
        ctx.lineTo(fx, fy - fs * 2.2);
        ctx.lineTo(fx + fs, fy);
        ctx.closePath();
        ctx.fill();
      }

      // Sparks
      if (Math.random() > 0.85) {
        addParticles(fire.x + (Math.random() - 0.5) * 20, fire.y, '#ffea00', 1);
      }
    }

    function drawFenceSegment(seg: any) {
      const selected = selectedConstruction && selectedConstruction.ref === seg;
      const isGate = seg.kind === 'gate';
      const level = seg.level || 1;
      
      // Shadow
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = isGate ? 12 : 10;
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1 + 4);
      ctx.lineTo(seg.x2, seg.y2 + 4);
      ctx.stroke();

      // Main structure
      ctx.strokeStyle = isGate ? '#8f5c34' : level >= 2 ? '#846849' : '#a67b50';
      ctx.lineWidth = isGate ? 10 : 8;
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();

      // Details (Posts)
      ctx.fillStyle = level >= 2 ? '#5f4630' : '#8b5a39';
      const dist = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
      const posts = Math.floor(dist / 16);
      for (let i = 0; i <= posts; i++) {
        const t = i / posts;
        const px = seg.x1 + (seg.x2 - seg.x1) * t;
        const py = seg.y1 + (seg.y2 - seg.y1) * t;
        ctx.fillRect(px - 3, py - 12, 6, 14);
        // Post highlight
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(px - 3, py - 12, 2, 14);
        ctx.fillStyle = level >= 2 ? '#5f4630' : '#8b5a39';
      }

      // Level 2+ Extra robustness
      if (level >= 2) {
        ctx.strokeStyle = '#c6b59f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1 - 4);
        ctx.lineTo(seg.x2, seg.y2 - 4);
        ctx.stroke();
      }

      if (selected) {
        ctx.save();
        const pulseScale = 1 + Math.sin(state.pulse) * 0.15;
        ctx.shadowBlur = 18 * pulseScale;
        ctx.shadowColor = 'rgba(242, 140, 40, 0.9)';
        ctx.strokeStyle = 'rgba(242, 140, 40, 0.7)';
        ctx.lineWidth = 14;
        ctx.stroke();
        ctx.strokeStyle = '#fff0b7';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }
      const c = segmentCenter(seg);
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.fillRect(c.x - 18, c.y - 22, 36, 4);
      ctx.fillStyle = '#c95d4e';
      ctx.fillRect(c.x - 18, c.y - 22, 36 * (seg.hp / seg.maxHp), 4);
    }

    function drawTower(t: any) {
      const selected = selectedConstruction && selectedConstruction.ref === t;
      const level = t.level || 1;
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(t.x, t.y + 22, 20, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Base
      ctx.fillStyle = level >= 2 ? '#5a5a54' : '#846849';
      ctx.fillRect(t.x - 14, t.y - 10, 28, 32);
      // Shading
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(t.x + 4, t.y - 10, 10, 32);

      // Top Part
      ctx.fillStyle = level >= 2 ? '#808074' : '#5f4630';
      ctx.fillRect(t.x - 16, t.y - 24, 32, 16);
      
      // Roof
      ctx.fillStyle = level >= 2 ? '#4a3525' : '#a8663f';
      ctx.beginPath();
      ctx.moveTo(t.x - 20, t.y - 24);
      ctx.lineTo(t.x, t.y - 44 - (level - 1) * 10);
      ctx.lineTo(t.x + 20, t.y - 24);
      ctx.closePath();
      ctx.fill();

      // Torch/Light for level 2+
      if (level >= 2) {
        const flicker = Math.sin(performance.now() * 0.01) * 2;
        ctx.fillStyle = '#ffea00';
        ctx.beginPath();
        ctx.arc(t.x - 12, t.y - 18, 3 + flicker * 0.5, 0, Math.PI * 2);
        ctx.arc(t.x + 12, t.y - 18, 3 + flicker * 0.5, 0, Math.PI * 2);
        ctx.fill();
        // Glow
        ctx.fillStyle = 'rgba(255, 200, 50, 0.2)';
        ctx.beginPath();
        ctx.arc(t.x, t.y - 20, 20 + flicker, 0, Math.PI * 2);
        ctx.fill();
      }

      if (selected) {
        ctx.save();
        const pulseScale = 1 + Math.sin(state.pulse) * 0.15;
        ctx.shadowBlur = 22 * pulseScale;
        ctx.shadowColor = 'rgba(242, 140, 40, 0.9)';
        ctx.strokeStyle = 'rgba(242, 140, 40, 0.7)';
        ctx.lineWidth = 8;
        ctx.strokeRect(t.x - 22, t.y - 48, 44, 76);
        ctx.strokeStyle = '#fff0b7';
        ctx.lineWidth = 2;
        ctx.strokeRect(t.x - 20, t.y - 46, 40, 72);
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(t.x - 14, t.y - 54, 28, 4);
      ctx.fillStyle = '#ca6755';
      ctx.fillRect(t.x - 14, t.y - 54, 28 * (t.hp / t.maxHp), 4);
    }

    function drawHelper(h: any) {
      const selected = selectedConstruction && selectedConstruction.ref === h;
      const walkFrame = Math.floor((h.walkTimer || 0) / 8) % 2;
      const bob = walkFrame === 1 ? 2 : 0;
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(h.x, h.y + 14, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body color based on type
      let bodyColor = '#4f6440'; // Archer (Green)
      let hatColor = '#2e2116';
      let toolColor = '#d1d1d1';
      let secondaryColor = '#3e2723';
      let capeColor = '#556b2f';
      
      if (h.type === 'warrior') {
        bodyColor = '#0047AB'; // Blue Tunic like Hero
        hatColor = '#78909c'; // Steel Helmet
        toolColor = '#a0a0a0'; // Sword
        secondaryColor = '#3e2723';
        capeColor = '#b22222'; // Red Cape
      } else if (h.type === 'sniper') {
        bodyColor = '#404a64'; // Bluish
        hatColor = '#2b2e3d';
        toolColor = '#555555'; // Long rifle
        secondaryColor = '#1a1c2b';
        capeColor = '#2b2e3d';
      } else if (h.type === 'mage') {
        bodyColor = '#5c4064'; // Purple
        hatColor = '#362b3d';
        toolColor = '#ba68c8'; // Staff
        secondaryColor = '#2b1a36';
        capeColor = '#4b0082';
      } else if (h.type === 'summoner') {
        bodyColor = '#40645e'; // Teal
        hatColor = '#2b3d3a';
        toolColor = '#4db6ac'; // Staff
        secondaryColor = '#1a2b28';
        capeColor = '#008080';
      }

      // Cape (Behind)
      ctx.fillStyle = capeColor;
      ctx.beginPath();
      ctx.moveTo(h.x - 7, h.y - 5 + bob);
      ctx.lineTo(h.x + 7, h.y - 5 + bob);
      ctx.lineTo(h.x + 10, h.y + 15 + bob);
      ctx.lineTo(h.x - 10, h.y + 15 + bob);
      ctx.fill();

      // Body
      ctx.fillStyle = bodyColor;
      ctx.fillRect(h.x - 8, h.y - 2 + bob, 16, 20);
      
      // Belt
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(h.x - 8, h.y + 6 + bob, 16, 3);

      // Head
      ctx.fillStyle = '#f5d6ba';
      ctx.fillRect(h.x - 6, h.y - 14 + bob, 12, 12);
      
      // Eyes
      ctx.fillStyle = '#000';
      const eyeY = h.y - 8 + bob;
      if (h.facing === 'left') {
        ctx.fillRect(h.x - 4, eyeY, 2, 3);
      } else {
        ctx.fillRect(h.x + 2, eyeY, 2, 3);
      }

      // Hat/Helmet
      ctx.fillStyle = hatColor;
      if (h.type === 'warrior') {
        // Hero-like Helmet
        ctx.beginPath();
        ctx.arc(h.x, h.y - 14 + bob, 8, Math.PI, 0);
        ctx.fill();
        // Horns
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.moveTo(h.x - 6, h.y - 18 + bob);
        ctx.lineTo(h.x - 10, h.y - 24 + bob);
        ctx.lineTo(h.x - 4, h.y - 20 + bob);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(h.x + 6, h.y - 18 + bob);
        ctx.lineTo(h.x + 10, h.y - 24 + bob);
        ctx.lineTo(h.x + 4, h.y - 20 + bob);
        ctx.fill();
      } else if (h.type === 'mage' || h.type === 'summoner') {
        // Pointed Wizard Hat
        ctx.beginPath();
        ctx.moveTo(h.x - 10, h.y - 14 + bob);
        ctx.lineTo(h.x + 10, h.y - 14 + bob);
        ctx.lineTo(h.x, h.y - 32 + bob);
        ctx.fill();
        // Gold band on hat
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(h.x - 6, h.y - 18 + bob, 12, 2);
      } else {
        // Simple Hood/Hat
        ctx.fillRect(h.x - 9, h.y - 16 + bob, 18, 4);
        ctx.fillRect(h.x - 5, h.y - 20 + bob, 10, 4);
      }

      // Shield for Warrior
      if (h.type === 'warrior') {
        ctx.save();
        ctx.translate(h.x + (h.facing === 'left' ? 10 : -10), h.y + 6 + bob);
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Shield for Warrior
      if (h.type === 'warrior') {
        ctx.save();
        ctx.translate(h.x + (h.facing === 'left' ? 10 : -10), h.y + 6 + bob);
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Weapon
      ctx.save();
      const weaponX = h.facing === 'left' ? -12 : 12;
      ctx.translate(h.x + weaponX, h.y + bob);
      if (h.type === 'warrior') {
        ctx.fillStyle = '#8b5a39';
        ctx.fillRect(-1.5, -4, 3, 12);
        ctx.fillStyle = toolColor;
        ctx.fillRect(-4, -6, 10, 4);
      } else if (h.type === 'sniper') {
        ctx.fillStyle = toolColor;
        ctx.fillRect(-2, -8, 4, 18);
        ctx.fillStyle = '#222';
        ctx.fillRect(-1, -10, 2, 4);
      } else if (h.type === 'mage' || h.type === 'summoner') {
        ctx.fillStyle = '#8b5a39';
        ctx.fillRect(-1.5, -10, 3, 22);
        ctx.fillStyle = toolColor;
        ctx.beginPath();
        ctx.arc(0, -12, 5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Archer Bow
        ctx.strokeStyle = '#8b5a39';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 8, -Math.PI/2, Math.PI/2);
        ctx.stroke();
      }
      ctx.restore();

      // Legs
      const legOffset = walkFrame === 1 ? 3 : -3;
      ctx.fillStyle = bodyColor;
      ctx.fillRect(h.x - 6, h.y + 16, 4, 6 + legOffset);
      ctx.fillRect(h.x + 2, h.y + 16, 4, 6 - legOffset);

      if (selected) {
        ctx.save();
        const pulseScale = 1 + Math.sin(state.pulse) * 0.15;
        ctx.shadowBlur = 18 * pulseScale;
        ctx.shadowColor = 'rgba(242, 140, 40, 0.9)';
        ctx.strokeStyle = 'rgba(242, 140, 40, 0.7)';
        ctx.lineWidth = 8;
        ctx.strokeRect(h.x - 14, h.y - 24, 28, 42);
        ctx.strokeStyle = '#fff0b7';
        ctx.lineWidth = 2;
        ctx.strokeRect(h.x - 12, h.y - 22, 24, 38);
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(h.x - 12, h.y - 26, 24, 3);
      ctx.fillStyle = '#ca6755';
      ctx.fillRect(h.x - 12, h.y - 26, 24 * (h.hp / h.maxHp), 3);
    }

    function drawResource(res: any) {
      if (res.respawning) return;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(res.x, res.y + 10, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      if (res.type === 'egg') {
        ctx.save();
        ctx.translate(res.x, res.y);
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.ellipse(0, 0, 8, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        return;
      }
      if (res.type === 'wood') {
        ctx.fillStyle = '#6c462c';
        ctx.fillRect(res.x - 10, res.y - 1, 20, 8);
        ctx.fillStyle = '#8c5a39';
        ctx.fillRect(res.x - 6, res.y - 5, 14, 8);
      }
      if (res.type === 'stone') drawRock(res.x, res.y, 0.75);
      if (res.type === 'fiber') {
        ctx.strokeStyle = '#79a950';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(res.x, res.y + 8);
        ctx.quadraticCurveTo(res.x - 10, res.y - 4, res.x - 7, res.y - 12);
        ctx.moveTo(res.x, res.y + 8);
        ctx.quadraticCurveTo(res.x + 10, res.y - 4, res.x + 7, res.y - 12);
        ctx.stroke();
      }
      if (res.type === 'gold') {
        ctx.fillStyle = '#d8b548';
        ctx.beginPath();
        ctx.arc(res.x, res.y, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawPlayer() {
      const p = state.player;
      if (p.hitFlash > 0) p.hitFlash--;
      
      const bob = p.frame === 1 ? 2 : 0;
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 18, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      if (p.hitFlash > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(p.x - 12, p.y - 22 + bob, 24, 50);
        return;
      }

      // Red Cape (Behind)
      ctx.fillStyle = p.equipment.armor ? '#455a64' : '#b22222'; // Armor changes cape to steel
      ctx.beginPath();
      ctx.moveTo(p.x - 10, p.y - 5 + bob);
      ctx.lineTo(p.x + 10, p.y - 5 + bob);
      ctx.lineTo(p.x + 16, p.y + 20 + bob);
      ctx.lineTo(p.x - 16, p.y + 20 + bob);
      ctx.fill();

      // Body (Cobalt Blue Tunic)
      ctx.fillStyle = p.equipment.armor ? '#78909c' : '#0047AB'; 
      ctx.fillRect(p.x - 10, p.y - 2 + bob, 20, 24);
      
      // Belt & Details
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(p.x - 10, p.y + 8 + bob, 20, 4);
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(p.x - 2, p.y + 8 + bob, 4, 4);
      
      // Shield (DQ Style)
      ctx.save();
      ctx.translate(p.x + (p.facing === 'left' ? -12 : 12), p.y + 8 + bob);
      ctx.fillStyle = '#ffd700'; // Gold border
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0047AB'; // Blue center
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd700'; // Crest
      ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();

      // Head
      ctx.fillStyle = '#f5d6ba'; // Skin
      ctx.fillRect(p.x - 8, p.y - 18 + bob, 16, 16);
      
      // Hair (Classic DQ Spiky Hair)
      ctx.fillStyle = '#ffcc00'; // Golden Blonde
      ctx.beginPath();
      ctx.moveTo(p.x - 8, p.y - 18 + bob);
      ctx.lineTo(p.x - 12, p.y - 24 + bob);
      ctx.lineTo(p.x - 4, p.y - 18 + bob);
      ctx.lineTo(p.x, p.y - 26 + bob);
      ctx.lineTo(p.x + 4, p.y - 18 + bob);
      ctx.lineTo(p.x + 12, p.y - 24 + bob);
      ctx.lineTo(p.x + 8, p.y - 18 + bob);
      ctx.fill();
      
      // Helmet (DQ Style)
      ctx.fillStyle = p.equipment.accessory ? '#ffd700' : '#78909c'; // Accessory makes helmet golden
      ctx.beginPath();
      ctx.arc(p.x, p.y - 18 + bob, 10, Math.PI, 0);
      ctx.fill();
      // Horns/Wings on helmet
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(p.x - 8, p.y - 22 + bob);
      ctx.lineTo(p.x - 14, p.y - 30 + bob);
      ctx.lineTo(p.x - 6, p.y - 26 + bob);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(p.x + 8, p.y - 22 + bob);
      ctx.lineTo(p.x + 14, p.y - 30 + bob);
      ctx.lineTo(p.x + 6, p.y - 26 + bob);
      ctx.fill();
      
      // Eyes (DQ Style dots)
      ctx.fillStyle = '#000';
      const eyeY = p.y - 10 + bob;
      if (p.facing === 'left') {
        ctx.fillRect(p.x - 6, eyeY, 2, 3);
      } else if (p.facing === 'right') {
        ctx.fillRect(p.x + 4, eyeY, 2, 3);
      } else {
        ctx.fillRect(p.x - 4, eyeY, 2, 3);
        ctx.fillRect(p.x + 2, eyeY, 2, 3);
      }
      
      // Legs
      const legOffset = p.frame === 1 ? 4 : -4;
      ctx.fillStyle = '#0047AB';
      ctx.fillRect(p.x - 7, p.y + 22, 5, 8 + legOffset);
      ctx.fillRect(p.x + 2, p.y + 22, 5, 8 - legOffset);

      // Weapon Visual
      if (p.equipment.weapon) {
        ctx.save();
        ctx.translate(p.x + (p.facing === 'left' ? -18 : 18), p.y + 10 + bob);
        ctx.rotate(p.facing === 'left' ? -Math.PI/4 : Math.PI/4);
        ctx.fillStyle = '#cfd8dc'; // Steel
        ctx.fillRect(-2, -15, 4, 15);
        ctx.fillStyle = '#ffd700'; // Gold hilt
        ctx.fillRect(-4, 0, 8, 2);
        ctx.restore();
      }

      // Attack Animation (Slash Arc)
      if (p.attackTimer > 0) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.attackAngle);
        
        const arcProgress = (1 - p.attackTimer / 14);
        
        // Slash Arc (White with glow)
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255, 255, 255, ${Math.sin(arcProgress * Math.PI)})`;
        ctx.lineWidth = 8 - arcProgress * 4;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#fff';
        ctx.arc(0, 0, 42 + arcProgress * 12, -1.4, 1.4);
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Sword (DQ Style)
        ctx.rotate(arcProgress * 3.2 - 1.6);
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(15, -3, 35, 6);
        ctx.fillStyle = '#ffd700'; // Hilt
        ctx.fillRect(10, -6, 6, 12);
        ctx.fillStyle = '#b22222'; // Pommel
        ctx.beginPath();
        ctx.arc(8, 0, 3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      }
    }

    function drawEnemy(e: any) {
      const s = e.size || 1;
      const bob = Math.sin(performance.now() * 0.01) * 3;
      
      if (e.dying !== undefined) {
        ctx.save();
        const progress = (30 - e.dying) / 30;
        ctx.globalAlpha = 1 - progress;
        ctx.translate(e.x, e.y);
        ctx.rotate(progress * 0.5);
        
        // Squash and stretch effect
        const scaleX = 1 + progress * 0.5;
        const scaleY = 1 - progress * 0.8;
        ctx.scale(scaleX, scaleY);
        
        // White flash during death
        if (e.dying > 15) {
          ctx.fillStyle = '#fff';
        } else {
          ctx.fillStyle = e.color || '#fff';
        }
        
        ctx.beginPath();
        ctx.arc(0, 0, 14 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + 16 * s, 14 * s, 6 * s, 0, 0, Math.PI * 2);
      ctx.fill();

      if (e.hitFlash > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(e.x, e.y, 18 * s, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      if (e.type === 'fast') {
        // DRACKEE (Purple Bat)
        ctx.fillStyle = '#6a1b9a';
        // Wings
        ctx.beginPath();
        const wingW = 24 * s;
        const wingH = 18 * s;
        ctx.moveTo(e.x - 8 * s, e.y + bob);
        ctx.lineTo(e.x - 8 * s - wingW, e.y - wingH + bob);
        ctx.lineTo(e.x - 8 * s, e.y + 8 * s + bob);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(e.x + 8 * s, e.y + bob);
        ctx.lineTo(e.x + 8 * s + wingW, e.y - wingH + bob);
        ctx.lineTo(e.x + 8 * s, e.y + 8 * s + bob);
        ctx.fill();
        // Body
        ctx.beginPath();
        ctx.arc(e.x, e.y + bob, 14 * s, 0, Math.PI * 2);
        ctx.fill();
        // Ears (Pointy)
        ctx.beginPath();
        ctx.moveTo(e.x - 12 * s, e.y - 10 * s + bob);
        ctx.lineTo(e.x - 18 * s, e.y - 28 * s + bob);
        ctx.lineTo(e.x - 4 * s, e.y - 14 * s + bob);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(e.x + 12 * s, e.y - 10 * s + bob);
        ctx.lineTo(e.x + 18 * s, e.y - 28 * s + bob);
        ctx.lineTo(e.x + 4 * s, e.y - 14 * s + bob);
        ctx.fill();
        // Eyes (Large White)
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(e.x - 6 * s, e.y - 2 * s + bob, 5 * s, 0, Math.PI * 2);
        ctx.arc(e.x + 6 * s, e.y - 2 * s + bob, 5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(e.x - 6 * s, e.y - 1 * s + bob, 2 * s, 0, Math.PI * 2);
        ctx.arc(e.x + 6 * s, e.y - 1 * s + bob, 2 * s, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === 'armored') {
        // GOLEM (Brick/Stone)
        ctx.fillStyle = '#5d4037'; // Dark stone
        ctx.fillRect(e.x - 20 * s, e.y - 20 * s, 40 * s, 40 * s);
        ctx.fillStyle = '#8d6e63'; // Stone color
        ctx.fillRect(e.x - 17 * s, e.y - 17 * s, 34 * s, 34 * s);
        // Brick patterns
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(e.x - 14 * s, e.y - 12 * s + i * 10 * s, 10 * s, 4 * s);
          ctx.fillRect(e.x + 2 * s, e.y - 7 * s + i * 10 * s, 10 * s, 4 * s);
        }
        // Eyes (Glowing Yellow)
        ctx.fillStyle = '#ffeb3b';
        ctx.fillRect(e.x - 10 * s, e.y - 10 * s, 6 * s, 6 * s);
        ctx.fillRect(e.x + 4 * s, e.y - 10 * s, 6 * s, 6 * s);
      } else if (e.type === 'skeleton') {
        // SKELETON
        ctx.fillStyle = '#e0e0e0';
        // Skull
        ctx.beginPath();
        ctx.arc(e.x, e.y - 10 * s + bob, 10 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(e.x - 6 * s, e.y - 2 * s + bob, 12 * s, 8 * s);
        // Eyes (Dark Sockets)
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(e.x - 4 * s, e.y - 12 * s + bob, 3 * s, 0, Math.PI * 2);
        ctx.arc(e.x + 4 * s, e.y - 12 * s + bob, 3 * s, 0, Math.PI * 2);
        ctx.fill();
        // Ribs
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(e.x - 2 * s, e.y + bob, 4 * s, 20 * s);
        for (let i = 0; i < 3; i++) {
          ctx.fillRect(e.x - 10 * s, e.y + 4 * s + i * 6 * s + bob, 20 * s, 2 * s);
        }
        // Sword
        ctx.fillStyle = '#90a4ae';
        ctx.fillRect(e.x + 8 * s, e.y + 5 * s + bob, 4 * s, 15 * s);
        ctx.fillStyle = '#546e7a';
        ctx.fillRect(e.x + 6 * s, e.y + 18 * s + bob, 8 * s, 2 * s);
      } else {
        // SLIME (Dynamic Color)
        ctx.fillStyle = e.color || '#2196f3';
        ctx.beginPath();
        ctx.moveTo(e.x - 15 * s, e.y + 15 * s + bob);
        ctx.quadraticCurveTo(e.x - 15 * s, e.y - 15 * s + bob, e.x, e.y - 15 * s + bob);
        ctx.quadraticCurveTo(e.x + 15 * s, e.y - 15 * s + bob, e.x + 15 * s, e.y + 15 * s + bob);
        ctx.fill();
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(e.x - 6 * s, e.y - 2 * s + bob, 4 * s, 0, Math.PI * 2);
        ctx.arc(e.x + 6 * s, e.y - 2 * s + bob, 4 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(e.x - 6 * s, e.y - 2 * s + bob, 2 * s, 0, Math.PI * 2);
        ctx.arc(e.x + 6 * s, e.y - 2 * s + bob, 2 * s, 0, Math.PI * 2);
        ctx.fill();
        // Smile
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(e.x, e.y + 4 * s + bob, 4 * s, 0.2, Math.PI - 0.2);
        ctx.stroke();

        // Crown for Boss
        if (e.type === 'boss') {
          ctx.fillStyle = '#ffd700';
          ctx.beginPath();
          ctx.moveTo(e.x - 10 * s, e.y - 20 * s + bob);
          ctx.lineTo(e.x - 15 * s, e.y - 35 * s + bob);
          ctx.lineTo(e.x - 5 * s, e.y - 25 * s + bob);
          ctx.lineTo(e.x, e.y - 35 * s + bob);
          ctx.lineTo(e.x + 5 * s, e.y - 25 * s + bob);
          ctx.lineTo(e.x + 15 * s, e.y - 35 * s + bob);
          ctx.lineTo(e.x + 10 * s, e.y - 20 * s + bob);
          ctx.fill();
        }
      }
      
      // Health Bar
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - 12 * s, e.y - 25 * s, 24 * s, 4);
      ctx.fillStyle = '#ca6755';
      ctx.fillRect(e.x - 12 * s, e.y - 25 * s, 24 * s * (e.hp / e.maxHp), 4);
    }

    function drawEffects() {
      for (const p of state.particles) {
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        if (p.type === 'slash') {
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-p.size / 2, -2, p.size, 4);
        } else if (p.type === 'cloud' || p.color === '#ffffff') {
          // Death smoke puff
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      for (const e of state.effects) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, e.life);
        if (e.pulse) {
          ctx.strokeStyle = e.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(e.x, e.y, (1 - e.life) * 34, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = e.color;
          ctx.font = e.isCrit ? 'bold 20px Arial' : 'bold 14px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(e.text, e.x, e.y);
        }
        ctx.restore();
      }
    }

    function drawAmbientParticles() {
      for (const ap of state.ambientParticles) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = ap.color;
        ctx.translate(ap.x, ap.y);
        ctx.rotate(performance.now() * 0.002);
        ctx.fillRect(-ap.size / 2, -ap.size / 2, ap.size, ap.size);
        ctx.restore();
      }
    }

    function drawWeather() {
      ctx.fillStyle = 'rgba(228, 237, 255, 0.25)';
      for (const p of weatherParticles) {
        p.y += p.speedY;
        p.x += p.drift;
        if (p.y > HEIGHT + 10) p.y = -10;
        if (p.x < -10) p.x = WIDTH + 10;
        if (p.x > WIDTH + 10) p.x = -10;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }

    function drawDrop(d: any) {
      ctx.save();
      ctx.translate(d.x, d.y);
      const bob = Math.sin(performance.now() * 0.005) * 5;
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(0, 5, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Icon
      ctx.fillStyle = d.type === 'sword' ? '#c0c0c0' : d.type === 'ring' ? '#ffd700' : d.type === 'boot' ? '#8b4513' : '#32cd32';
      ctx.beginPath();
      ctx.arc(0, bob, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      ctx.restore();
    }

    function updateSummons() {
      for (let i = state.summons.length - 1; i >= 0; i--) {
        const s = state.summons[i];
        s.life--;
        s.cooldown = Math.max(0, s.cooldown - 1);
        
        if (s.life <= 0) {
          state.summons.splice(i, 1);
          continue;
        }

        let target = null;
        let best = Infinity;
        for (const enemy of state.enemies) {
          const d = Math.hypot(s.x - enemy.x, s.y - enemy.y);
          if (d < 300 && d < best) { best = d; target = enemy; }
        }

        if (target) {
          const ang = Math.atan2(target.y - s.y, target.x - s.x);
          const dist = Math.hypot(target.x - s.x, target.y - s.y);
          if (dist > 15) {
            s.x += Math.cos(ang) * s.speed;
            s.y += Math.sin(ang) * s.speed;
          } else if (s.cooldown === 0) {
            target.hp -= s.damage;
            target.hitFlash = 5;
            s.cooldown = 40;
            addEffect(target.x, target.y, `-${s.damage}`, '#4db6ac');
            if (target.hp <= 0) { state.player.gold += 1; }
          }
        }
      }
    }

    function drawSummon(s: any) {
      const bob = Math.sin(performance.now() * 0.01) * 3;
      ctx.fillStyle = 'rgba(77, 182, 172, 0.4)';
      ctx.beginPath();
      ctx.arc(s.x, s.y + bob, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(s.x - 2, s.y - 2 + bob, 1.5, 0, Math.PI * 2);
      ctx.arc(s.x + 2, s.y - 2 + bob, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawForestEdges() {
      const darkness = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 130, WIDTH / 2, HEIGHT / 2, 510);
      darkness.addColorStop(0, 'rgba(0,0,0,0)');
      darkness.addColorStop(1, 'rgba(2, 7, 3, 0.44)');
      ctx.fillStyle = darkness;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    function drawDayNight() {
      const t = Math.sin(state.timeOfDay * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(12, 22, 28, ${t * 0.5})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    function render() {
      if (!gameState) return;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.save();
      
      // Draw Ground
      ctx.fillStyle = '#1a2418';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      
      // Draw Resources
      gameState.resources.forEach((res: any) => {
        if (res.respawning) return;
        ctx.fillStyle = res.type === 'wood' ? '#8b4513' : res.type === 'stone' ? '#808080' : res.type === 'fiber' ? '#32cd32' : '#ffd700';
        ctx.beginPath();
        ctx.arc(res.x, res.y, 10, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw Campfire
      const cf = gameState.campfire;
      ctx.fillStyle = '#ff4500';
      ctx.beginPath();
      ctx.arc(cf.x, cf.y, 20, 0, Math.PI * 2);
      ctx.fill();

      // Draw Enemies
      gameState.enemies.forEach((e: any) => {
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 15, 0, Math.PI * 2);
        ctx.fill();
        
        // Health bar
        ctx.fillStyle = 'red';
        ctx.fillRect(e.x - 10, e.y - 20, 20, 4);
        ctx.fillStyle = 'green';
        ctx.fillRect(e.x - 10, e.y - 20, 20 * (e.hp / e.maxHp), 4);
      });

      // Draw Players
      Object.values(gameState.players).forEach((p: any) => {
        ctx.save();
        ctx.translate(p.x, p.y);
        
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(0, 15, 12, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body (DQ Style)
        ctx.fillStyle = p.id === socketRef.current?.id ? '#4dabf7' : '#ff8787';
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();

        // Armor Visuals
        if (p.equipment.armor) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Helmet Visuals
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(0, -10, 8, Math.PI, 0);
        ctx.fill();

        // Weapon Visuals
        if (p.equipment.weapon) {
          ctx.fillStyle = '#c0c0c0';
          ctx.fillRect(10, -10, 5, 20);
        }

        // Name tag
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, 0, -25);
        
        ctx.restore();

        // Attack animation
        if (p.attackTimer > 0) {
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 40, p.attackAngle - 0.5, p.attackAngle + 0.5);
          ctx.stroke();
        }
      });

      // Draw Drops
      gameState.drops.forEach((d: any) => {
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(d.x, d.y, 8, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();
      updateUI();
    }

    function gameLoop() {
      if (socketRef.current && isJoined) {
        const dx = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
        const dy = (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0) - (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0);
        
        if (dx !== 0 || dy !== 0 || joystick.active) {
          socketRef.current.emit('playerInput', roomId || 'default', { 
            dx: joystick.active ? joystick.dx : dx, 
            dy: joystick.active ? joystick.dy : dy 
          });
        }
      }

      if (gameState) {
        render();
      }
      requestRef.current = requestAnimationFrame(gameLoop);
    }

    window.addEventListener('resize', updateUI);
    updateUI();
    render();
    requestRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', updateUI);
    };
  }, [isJoined, gameState !== null]);

  if (!isJoined) {
    return (
      <div className="lobby-container dq-window">
        <div className="lobby-card">
          <h1 className="title">As Crônicas de Hero</h1>
          <p className="subtitle">Multiplayer Cooperativo</p>
          
          <div className="input-group">
            <label><User size={16} /> Nome do Herói</label>
            <input 
              type="text" 
              placeholder="Ex: Erdrick" 
              value={playerName} 
              onChange={(e) => setPlayerName(e.target.value)}
            />
          </div>
          
          <div className="input-group">
            <label><Shield size={16} /> Código da Sala</label>
            <input 
              type="text" 
              placeholder="Ex: SALA-123" 
              value={roomId} 
              onChange={(e) => setRoomId(e.target.value)}
            />
          </div>
          
          <button className="btn-start" onClick={() => setIsJoined(true)}>
            <Play size={20} /> ENTRAR NA AVENTURA
          </button>
          
          <div className="lobby-info">
            <p>Até 4 jogadores • Ondas de 60s • IA Dinâmica</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sound Toggle Button */}
      <button 
        id="soundBtn"
        onClick={() => setIsAudioOn(!isAudioOn)}
        className="fixed top-4 right-4 z-[500] w-12 h-12 bg-black/80 border-2 border-white text-white flex items-center justify-center text-2xl cursor-pointer hover:bg-white hover:text-black transition-colors"
        title="Alternar Som"
      >
        {isAudioOn ? '🔊' : '🔇'}
      </button>

      {/* Start Wave Button (Prep Phase) */}
      {gameState && gameState.isPrepPhase && (
        <button 
          id="startWaveBtn"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[500] dq-window px-8 py-3 text-xl font-bold hover:bg-white hover:text-blue-900 transition-colors"
          onClick={() => socketRef.current?.emit('startWave', roomId || 'default')}
        >
          INICIAR ONDA
        </button>
      )}

      {/* Upgrade Menu (Multiplayer) */}
      {hasStarted && gameState && gameState.isPrepPhase && (
        <div className="upgrade-menu-multi dq-window">
          <h3>MELHORIAS DO HERÓI</h3>
          <div className="upgrade-grid">
            <button onClick={() => socketRef.current?.emit('upgradePlayer', roomId || 'default', 'damage')}>
              Ataque (+5) <br/> <span>50 Ouro</span>
            </button>
            <button onClick={() => socketRef.current?.emit('upgradePlayer', roomId || 'default', 'health')}>
              Vida (+20) <br/> <span>50 Ouro</span>
            </button>
            <button onClick={() => socketRef.current?.emit('upgradePlayer', roomId || 'default', 'speed')}>
              Velocidade (+0.2) <br/> <span>50 Ouro</span>
            </button>
            <button onClick={() => socketRef.current?.emit('upgradePlayer', roomId || 'default', 'cooldown')}>
              Recarga (-4) <br/> <span>50 Ouro</span>
            </button>
          </div>
        </div>
      )}

      <div className="game-wrap">
        {gameState && (
          <div className="player-list">
            {Object.values(gameState.players).map((p: any) => (
              <div key={p.id} className="player-tag dq-window">
                <span className="name">{p.name}</span>
                <div className="hp-mini">
                  <div className="hp-mini-fill" style={{ width: `${p.health}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
        <canvas ref={canvasRef} width={860} height={640} />

        {/* Dragon Quest HUD */}
        <div className="hud-top">
          <div className="hud-stats dq-window">
            <div className="hud-stat-item">
              <Heart size={16} color="#ff4d4d" fill="#ff4d4d" />
              <div className="hp-bar-container">
                <div id="healthFill" className="hp-bar-fill" style={{ width: '100%' }} />
              </div>
              <span id="healthText">100%</span>
            </div>
            <div className="hud-stat-item">
              <Coins size={16} color="#ffd700" />
              <span id="goldCount">0</span>
            </div>
          </div>

          <div className="hud-stats dq-window">
            <div className="hud-stat-item">
              <Trees size={16} color="#8c5a39" />
              <span id="woodCount">0</span>
            </div>
            <div className="hud-stat-item">
              <Shield size={16} color="#808074" />
              <span id="stoneCount">0</span>
            </div>
            <div className="hud-stat-item">
              <Gem size={16} color="#79a950" />
              <span id="fiberCount">0</span>
            </div>
          </div>
        </div>

        {/* Hotbar / Shop Menu */}
        <div className="hotbar">
          <div className="hotbar-item dq-window">
            <div className="key-hint">1</div>
            <Shield className="icon" />
            <div className="label">Cerca</div>
          </div>
          <div className="hotbar-item dq-window">
            <div className="key-hint">2</div>
            <ArrowUpCircle className="icon" />
            <div className="label">Torre</div>
          </div>
          <div className="hotbar-item dq-window">
            <div className="key-hint">3</div>
            <Users className="icon" />
            <div className="label">Soldado</div>
          </div>
        </div>

        {/* Mobile Controls Overlay */}
        <div className="mobile-controls">
          <div id="joystickBase" className="joystick-area">
            <div id="joystickStick" className="joystick-stick" />
          </div>
          <div className="action-buttons">
            <button className="action-btn" onPointerDown={() => (window as any).playerAttack?.()}>ATAQUE</button>
            <button className="action-btn" onClick={() => (window as any).closeUpgradePanel?.()}>FECHAR</button>
          </div>
        </div>

        {/* HUD Top */}
        <div className="hud-top" id="hudTop">
          <div className="hud-left">
            <div className="stat-card health">
              <div className="stat-icon"><Heart size={18} fill="#ff5252" color="#ff5252" /></div>
              <div className="stat-bar-bg"><div className="stat-bar-fill health" id="healthFill"></div></div>
              <span id="healthText">100 / 100</span>
            </div>
            <div className="wave-card">
              <div className="day-badge" id="dayBadge">ONDA 1</div>
              <div className="wave-timer" id="waveTimer">Tempo: 60s</div>
            </div>
          </div>
          
          <div className="hud-right">
            <div className="resource-grid">
              <div className="res-item"><Trees size={16} color="#79a950" /> <span id="woodCount">0</span></div>
              <div className="res-item"><Gem size={16} color="#808074" /> <span id="stoneCount">0</span></div>
              <div className="res-item"><Hammer size={16} color="#a67b50" /> <span id="fiberCount">0</span></div>
              <div className="res-item"><Coins size={16} color="#ffd700" /> <span id="goldCount">0</span></div>
            </div>
            <button className="sound-btn" id="soundBtn">🔊</button>
          </div>
        </div>

        {/* Prep Overlay */}
        <div id="prepOverlay" className="overlay" style={{ display: 'none' }}>
          <div className="card dq-window">
            <h1 style={{ color: '#ffd700' }}>FASE DE PREPARAÇÃO</h1>
            <p id="prepTimer">Preparação: 15s</p>
            <p>Escolha seus upgrades e reorganize sua estratégia antes da próxima onda!</p>
            <button id="startWaveBtn" className="btn-start" onClick={() => socketRef.current?.emit('startWave', roomId || 'default')}>INICIAR ONDA</button>
          </div>
        </div>
        <div id="questMessage" className="quest-message">Um Slime se aproxima!</div>
        <div id="messageBox" className="message" />

        <div id="upgradePanel" className="upgrade-panel dq-window" onClick={(e) => e.stopPropagation()}>
          <h3 id="panelTitle">Torre</h3>
          <p id="panelDesc">Nível 1 • Vida 100/100</p>
          <div className="panel-buttons">
            <button id="upgradeBtn" className="panel-btn">Melhorar</button>
            <button id="repairBtn" className="panel-btn">Reparar</button>
            <button id="closePanelBtn" className="panel-btn">Fechar</button>
          </div>
        </div>

        {/* Overlays */}
        <div id="titleOverlay" className="overlay" style={{ display: hasStarted ? 'none' : 'flex' }}>
          <div className="card dq-window">
            <h1>NOBRE NA FLORESTA</h1>
            <p>Defenda seu acampamento dos monstros da floresta! Colete recursos durante o dia e prepare-se para a noite.</p>
            <button id="startBtn" className="btn-start" onClick={handleStart}>INICIAR AVENTURA</button>
            <div style={{ marginTop: '20px', fontSize: '12px', color: '#888' }}>
              PC: WASD para mover, Clique para atacar, 1-4 para construir<br/>
              Mobile: Joystick e botões na tela
            </div>
          </div>
        </div>

        <div id="gameOverOverlay" className="overlay" style={{ display: 'none' }}>
          <div className="card dq-window">
            <h1 style={{ color: '#ff4d4d' }}>FIM DE JOGO</h1>
            <div className="summary">
              <div className="summary-box">
                <div className="summary-label">Dias Sobrevividos</div>
                <div id="daysSurvived" className="summary-value">0</div>
              </div>
              <div className="summary-box">
                <div className="summary-label">Ouro Acumulado</div>
                <div id="finalGold" className="summary-value">0</div>
              </div>
            </div>
            <button id="restartBtn" className="btn-start" onClick={handleRestart}>TENTAR NOVAMENTE</button>
          </div>
        </div>
      </div>
    </div>
  );
}
