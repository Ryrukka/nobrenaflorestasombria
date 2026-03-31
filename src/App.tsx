import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Heart, Coins, Trees, Gem, Hammer, Shield, Users, X, ArrowUpCircle, Wrench, Play, Plus, LogIn, Globe } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);
  const socketRef = useRef<Socket | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [remotePlayers, setRemotePlayers] = useState<Record<string, any>>({});
  const [roomsList, setRoomsList] = useState<{ id: string; playerCount: number }[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const stateRef = useRef<any>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const socket = io({
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to server:', socket.id);
      setIsConnected(true);
      // If we were already in a room, re-join it on reconnection
      const currentRoomId = stateRef.current?.roomId;
      if (currentRoomId && stateRef.current?.isJoined) {
        socket.emit('join-room', currentRoomId);
      }
    });

    socket.on('connect_error', (err) => {
      console.error('Connection error:', err);
      setIsConnected(false);
    });

    socket.on('rooms-list', (list) => {
      console.log('Received rooms list:', list);
      setRoomsList(list);
    });

    socket.on('room-joined', (data) => {
      setIsHost(data.isHost);
      if (stateRef.current) {
        stateRef.current.isHost = data.isHost;
        stateRef.current.roomId = data.roomId;
        stateRef.current.isJoined = true;
        // If we are joining an existing room as a client, clear local state
        // to ensure we only see what the host syncs.
        if (!data.isHost) {
          stateRef.current.enemies = [];
          stateRef.current.drops = [];
          stateRef.current.constructions = {
            fenceBuilt: false,
            fenceSegments: [],
            towers: [],
            helpers: []
          };
        }
      }
      console.log('Joined room:', data.roomId, 'Host:', data.isHost);
    });

    socket.on('player-joined', (id) => {
      console.log('Player joined:', id);
      if (stateRef.current) {
        stateRef.current.remotePlayers[id] = { x: 430, y: 320, health: 100, maxHealth: 100 };
        setRemotePlayers({ ...stateRef.current.remotePlayers });
      }
    });

    socket.on('player-moved', (data) => {
      const { id, ...playerData } = data;
      if (stateRef.current) {
        stateRef.current.remotePlayers[id] = { ...stateRef.current.remotePlayers[id], ...playerData };
        setRemotePlayers({ ...stateRef.current.remotePlayers });
      }
    });

    socket.on('remote-attack', (data) => {
      const { id, x, y, ang } = data;
      if (stateRef.current) {
        stateRef.current.particles.push({
          x: x + Math.cos(ang) * 20,
          y: y + Math.sin(ang) * 20,
          vx: 0, vy: 0,
          life: 0.2,
          size: 25,
          color: 'rgba(255, 255, 255, 0.4)',
          type: 'slash'
        });

        if (stateRef.current.isHost) {
          const range = 65;
          for (const enemy of stateRef.current.enemies) {
            const d = Math.hypot(x - enemy.x, y - enemy.y);
            if (d < range) {
              const angToEnemy = Math.atan2(enemy.y - y, enemy.x - x);
              let diff = Math.abs(angToEnemy - ang);
              if (diff > Math.PI) diff = Math.PI * 2 - diff;
              if (diff < 1.1) {
                const dmg = Math.random() < 0.15 ? 24 : 12;
                enemy.hp -= dmg;
                enemy.hitFlash = 5;
                const kx = enemy.x - x;
                const ky = enemy.y - y;
                const kd = Math.hypot(kx, ky) || 1;
                enemy.vx = (kx / kd) * 9;
                enemy.vy = (ky / kd) * 9;
              }
            }
          }
        }
      }
    });

    socket.on('game-state-synced', (gameState) => {
      if (stateRef.current && !stateRef.current.isHost) {
        stateRef.current.enemies = gameState.enemies;
        stateRef.current.drops = gameState.drops;
        stateRef.current.resources = gameState.resources;
        stateRef.current.constructions = gameState.constructions;
        stateRef.current.projectiles = gameState.projectiles || [];
        stateRef.current.timeOfDay = gameState.timeOfDay;
        stateRef.current.day = gameState.day;
      }
    });

    socket.on('became-host', () => {
      setIsHost(true);
      if (stateRef.current) stateRef.current.isHost = true;
      console.log('You are now the host');
    });

    socket.on('player-left', (id) => {
      if (stateRef.current) {
        delete stateRef.current.remotePlayers[id];
        setRemotePlayers({ ...stateRef.current.remotePlayers });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!gameStarted || !isJoined) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Adjust canvas dimensions for mobile
    const isMobileNow = window.innerWidth < 1024;
    if (isMobileNow) {
      canvas.width = 640;
      canvas.height = 960; // More vertical for mobile
    } else {
      canvas.width = 860;
      canvas.height = 640;
    }

    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    // Multiplayer Socket Setup
    if (isJoined && socketRef.current) {
      console.log('Attempting to join room:', roomId);
      if (stateRef.current) {
        stateRef.current.roomId = roomId;
        stateRef.current.isJoined = true;
      }
      socketRef.current.emit('join-room', roomId);
    }

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
    };

    const keys: Record<string, boolean> = {};
    const pointer = { x: 0, y: 0 };
    const joystick = { active: false, dx: 0, dy: 0 };
    let mobileMovement = { x: 0, y: 0 };
    let joystickActive = false;
    let joystickStart = { x: 0, y: 0 };
    let selectedConstruction: any = null;
    let messageTimer: any = null;
    let forceMobile = false;

    const DAY_SPEED = 0.00028;
    const AUTO_COLLECT_RADIUS = 34;
    const PC_BUILD_KEYS: Record<string, string> = { '1': 'fence', '2': 'tower', '3': 'helper' };

    function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
    function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
    function distance(a: {x:number, y:number}, b: {x:number, y:number}) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function canPay(inv: any, cost: any) { return Object.entries(cost).every(([k, v]) => inv[k] >= (v as number)); }
    function pay(inv: any, cost: any) { Object.entries(cost).forEach(([k, v]) => inv[k] -= (v as number)); }
    function isMobileLayout() { return forceMobile || window.innerWidth < 1024; }

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

    interface GameState {
      status: string;
      day: number;
      timeElapsed: number;
      spawnTimer: number;
      timeOfDay: number;
      cameraShake: number;
      pulse: number;
      effects: any[];
      particles: any[];
      drops: any[];
      ambientParticles: any[];
      grass: any[];
      wave: number;
      dayTime: number;
      player: any;
      campfire: any;
      resources: any[];
      enemies: any[];
      summons: any[];
      trees: any[];
      rocks: any[];
      bushes: any[];
      mushrooms: any[];
      constructions: any;
      towerSlots: any[];
      helperSlots: any[];
      projectiles: any[];
      gameOver?: boolean;
      // Multiplayer
      isJoined: boolean;
      isHost: boolean;
      roomId: string;
      remotePlayers: Record<string, any>;
      frame: number;
    }

    function initialState(): GameState {
      const campfire = { x: WIDTH / 2, y: HEIGHT / 2, radius: 122 };
      return {
        status: gameStarted ? 'playing' : 'title',
        day: 1,
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
        wave: 1,
        dayTime: 0.42,
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
          slowed: 0,
          idleAttackTimer: 0,
          attackTimer: 0,
          attackAngle: 0,
          hitFlash: 0,
          attackCooldown: 48, // 0.8s
          autoAttackTimer: 0,
          damage: 15,
          hasHitThisAttack: false,
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
        isJoined: isJoined,
        isHost: isHost,
        roomId: roomId,
        remotePlayers: {},
        projectiles: [] as any[],
        frame: 0,
      };
    }

    let state: GameState = initialState();
    stateRef.current = state;

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
      if (ui.healthText) ui.healthText.textContent = `${Math.round(state.player.health)} / ${state.player.maxHealth}`;
      if (ui.healthFill) ui.healthFill.style.width = (state.player.health / state.player.maxHealth * 100) + '%';
      if (ui.woodCount) ui.woodCount.textContent = String(state.player.wood);
      if (ui.stoneCount) ui.stoneCount.textContent = String(state.player.stone);
      if (ui.fiberCount) ui.fiberCount.textContent = String(state.player.fiber);
      if (ui.goldCount) ui.goldCount.textContent = String(state.player.gold);
      
      const isNight = state.timeOfDay > 0.25 && state.timeOfDay < 0.75;
      if (ui.dayBadge) ui.dayBadge.textContent = `Dia ${state.day} — ${isNight ? 'Noite' : 'Dia'}`;
      
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
      
      if (ui.panelDesc) ui.panelDesc.textContent = info;
      if (ui.upgradePanel) {
        ui.upgradePanel.style.display = 'block';
        // Force reflow
        ui.upgradePanel.offsetHeight;
        ui.upgradePanel.classList.add('active');
        if (target.type === 'house') {
          // Hide upgrade button for houses
          const upBtn = ui.upgradeBtn as HTMLElement;
          if (upBtn) upBtn.style.display = 'none';
        } else {
          const upBtn = ui.upgradeBtn as HTMLElement;
          if (upBtn) upBtn.style.display = 'flex';
        }
        triggerShake(6);
      }
    }

    const handleUpgrade = (e: any) => {
      e.preventDefault();
      if (selectedConstruction) {
        upgradeConstruction(selectedConstruction);
        if (selectedConstruction) openUpgradePanel(selectedConstruction);
      }
    };

    const handleRepair = (e: any) => {
      e.preventDefault();
      if (selectedConstruction) {
        repairConstruction(selectedConstruction);
        if (selectedConstruction) openUpgradePanel(selectedConstruction);
      }
    };

    const handleStart = (e: any) => {
      e.preventDefault();
      state.status = 'playing';
      if (ui.titleOverlay) ui.titleOverlay.style.display = 'none';
      setGameStarted(true);
      updateUI();
    };

    const handleRestart = () => {
      state = initialState();
      state.status = 'playing';
      if (ui.gameOverOverlay) ui.gameOverOverlay.style.display = 'none';
      closeUpgradePanel();
      updateUI();
    };

    const handleToggleMobile = () => {
      forceMobile = !forceMobile;
      updateUI();
      showMessage(forceMobile ? 'Simulação Android Ativa' : 'Modo PC Ativo');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keys[key] = true;
      if (PC_BUILD_KEYS[key] && state.status === 'playing') {
        buyConstruction(PC_BUILD_KEYS[key]);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };

    const handleCanvasMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = (e.clientX - rect.left) * (canvas.width / rect.width);
      pointer.y = (e.clientY - rect.top) * (canvas.height / rect.height);
    };

    const handleCanvasPointerDown = (e: PointerEvent) => {
      if (state.status !== 'playing') return;
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (canvas.width / rect.width);
      const py = (e.clientY - rect.top) * (canvas.height / rect.height);
      
      const target = getConstructionAt(px, py);
      if (target) {
        openUpgradePanel(target);
      } else {
        if (!isMobileLayout()) closeUpgradePanel();
        playerAttack(px, py);
      }
    };

    const handleCanvasClick = (e: MouseEvent) => {
      if (state.status !== 'playing' || isMobileLayout()) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = (e.clientX - rect.left) * (canvas.width / rect.width);
      pointer.y = (e.clientY - rect.top) * (canvas.height / rect.height);
      const target = getConstructionAt(pointer.x, pointer.y);
      if (target) openUpgradePanel(target);
      else closeUpgradePanel();
    };

    const handleClosePanel = (e: any) => {
      if (e.type === 'touchstart') e.preventDefault();
      closeUpgradePanel();
    };

    const hotbarItems = document.querySelectorAll('.hotbar-item');
    const hotbarHandlers = Array.from(hotbarItems).map((item, index) => {
      return () => {
        const types = ['fence', 'tower', 'house', 'helper'];
        buyConstruction(types[index]);
        addParticles(state.player.x, state.player.y, '#ffd700', 4);
      };
    });

    // Add listeners
    ui.closePanelBtn?.addEventListener('touchstart', handleClosePanel);
    ui.closePanelBtn?.addEventListener('click', handleClosePanel);
    ui.upgradeBtn?.addEventListener('touchstart', handleUpgrade);
    ui.upgradeBtn?.addEventListener('click', handleUpgrade);
    ui.repairBtn?.addEventListener('touchstart', handleRepair);
    ui.repairBtn?.addEventListener('click', handleRepair);
    document.getElementById('startBtn')?.addEventListener('touchstart', handleStart);
    document.getElementById('startBtn')?.addEventListener('click', handleStart);
    document.getElementById('restartBtn')?.addEventListener('click', handleRestart);
    document.getElementById('toggleMobileMode')?.addEventListener('click', handleToggleMobile);
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('pointerdown', handleCanvasPointerDown);
    canvas.addEventListener('click', handleCanvasClick);

    hotbarItems.forEach((item, index) => {
      item.addEventListener('click', hotbarHandlers[index]);
    });

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

      if (target.type === 'tower') {
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

    // Joystick Logic
    const handleJoystickStart = (e: any) => {
      if (!gameStarted) return;
      const touch = e.touches ? e.touches[0] : e;
      joystick.active = true;
      joystickStart.x = touch.clientX;
      joystickStart.y = touch.clientY;
      if (ui.joystickBase) {
        ui.joystickBase.style.display = 'block';
        ui.joystickBase.style.left = `${touch.clientX - 50}px`;
        ui.joystickBase.style.top = `${touch.clientY - 50}px`;
      }
    };

    const handleJoystickMove = (e: any) => {
      if (!joystick.active) return;
      const touch = e.touches ? e.touches[0] : e;
      const dx = touch.clientX - joystickStart.x;
      const dy = touch.clientY - joystickStart.y;
      const dist = Math.hypot(dx, dy);
      const maxDist = 40;
      
      const angle = Math.atan2(dy, dx);
      const moveX = Math.cos(angle) * Math.min(dist, maxDist);
      const moveY = Math.sin(angle) * Math.min(dist, maxDist);

      if (ui.joystickStick) {
        ui.joystickStick.style.transform = `translate(${moveX}px, ${moveY}px)`;
      }

      joystick.dx = moveX / maxDist;
      joystick.dy = moveY / maxDist;
    };

    const handleJoystickEnd = () => {
      joystick.active = false;
      joystick.dx = 0;
      joystick.dy = 0;
      if (ui.joystickBase) ui.joystickBase.style.display = 'none';
      if (ui.joystickStick) ui.joystickStick.style.transform = 'translate(0, 0)';
    };

    window.addEventListener('touchstart', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.joystick-area') || target.closest('canvas')) {
        handleJoystickStart(e);
      }
    }, { passive: false });
    window.addEventListener('touchmove', handleJoystickMove, { passive: false });
    window.addEventListener('touchend', handleJoystickEnd);

    function movePlayer(speed: number) {
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
        state.player.x += xAxis * speed * speedMult;
        state.player.y += yAxis * speed * speedMult;
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

    function playerAttack(tx: number, ty: number) {
      if (state.player.idleAttackTimer > 0) return;
      
      state.player.idleAttackTimer = 25; // Cooldown
      state.player.attackTimer = 10; // Animation duration
      state.player.attackAngle = Math.atan2(ty - state.player.y, tx - state.player.x);

      // Multiplayer Emit Attack
      if (socketRef.current && state.isJoined) {
        socketRef.current.emit('player-attack', {
          roomId: state.roomId,
          x: state.player.x,
          y: state.player.y,
          ang: state.player.attackAngle
        });
      }
      
      const range = 65;
      // If host, apply damage directly. If not, the host will handle it via 'remote-attack' event.
      // Actually, to make it feel responsive, we can apply it locally too, but the host is the source of truth.
      for (const enemy of state.enemies) {
        const d = Math.hypot(state.player.x - enemy.x, state.player.y - enemy.y);
        if (d < range) {
          const angToEnemy = Math.atan2(enemy.y - state.player.y, enemy.x - state.player.x);
          let diff = Math.abs(angToEnemy - state.player.attackAngle);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          
          if (diff < 1.1) { // ~60 degree cone
            const isCrit = Math.random() < 0.15;
            const dmg = isCrit ? 24 : 12;
            
            // Only apply actual damage if host or if we want local prediction
            enemy.hp -= dmg;
            enemy.hitFlash = 5;
            
            // Knockback
            const kx = enemy.x - state.player.x;
            const ky = enemy.y - state.player.y;
            const kd = Math.hypot(kx, ky) || 1;
            enemy.vx = (kx / kd) * 9;
            enemy.vy = (ky / kd) * 9;
            
            triggerShake(isCrit ? 8 : 4);
            addEffect(enemy.x, enemy.y, isCrit ? 'CRÍTICO!' : `-${dmg}`, isCrit ? '#ffff00' : '#ffffff');
            addParticles(enemy.x, enemy.y, '#ff0000', 8);
            
            if (enemy.hp <= 0 && state.isHost) {
              const isChest = Math.random() < 0.10;
              if (isChest) {
                state.player.gold += 5;
                addEffect(enemy.x, enemy.y - 12, 'COFRE! +5 ouro', '#ffd700');
                addParticles(enemy.x, enemy.y, '#ffd700', 12);
              } else {
                state.player.gold += 1;
                addEffect(enemy.x, enemy.y - 12, '+1 ouro', '#e0c055');
              }
            }
          }
        }
      }
    }

    function playerAttackDirectional() {
      let tx = state.player.x;
      let ty = state.player.y;
      
      if (state.player.facing === 'left') tx -= 50;
      else if (state.player.facing === 'right') tx += 50;
      else if (state.player.facing === 'up') ty -= 50;
      else ty += 50;
      
      playerAttack(tx, ty);
    }

    // Expose to window for JSX
    (window as any).buyConstruction = buyConstruction;
    (window as any).playerAttack = playerAttackDirectional;
    (window as any).closeUpgradePanel = () => { if (ui.upgradePanel) ui.upgradePanel.style.display = 'none'; };

    function spawnEnemy() {
      state.spawnTimer = Math.max(0, state.spawnTimer - 1);
      if (state.spawnTimer > 0) return;

      const minutes = state.timeElapsed / 60;
      let spawnCount = 1;
      let spawnInterval = 300; // 5s
      let possibleTypes = ['normal'];

      if (minutes >= 10) {
        spawnCount = 8;
        spawnInterval = 120; // 2s
        possibleTypes = ['normal', 'green', 'fast', 'armored', 'skeleton', 'archer', 'shaman', 'boss'];
      } else if (minutes >= 5) {
        spawnCount = 6;
        spawnInterval = 150; // 2.5s
        possibleTypes = ['normal', 'green', 'fast', 'armored', 'skeleton', 'archer', 'shaman'];
      } else if (minutes >= 2) {
        spawnCount = 5;
        spawnInterval = 180; // 3s
        possibleTypes = ['normal', 'green', 'skeleton', 'archer'];
      }

      state.spawnTimer = spawnInterval;

      for (let i = 0; i < spawnCount; i++) {
        const side = Math.floor(Math.random() * 4);
        let x = 0, y = 0;
        if (side === 0) { x = rand(0, WIDTH); y = -20; }
        if (side === 1) { x = WIDTH + 20; y = rand(0, HEIGHT); }
        if (side === 2) { x = rand(0, WIDTH); y = HEIGHT + 20; }
        if (side === 3) { x = -20; y = rand(0, HEIGHT); }

        const r = Math.random();
        let type = 'normal';
        if (possibleTypes.includes('boss') && r < 0.05) {
          type = 'boss';
          showQuestMessage('¡O Rei Slime apareceu!', 4000);
        }
        else if (possibleTypes.includes('shaman') && r < 0.10) type = 'shaman';
        else if (possibleTypes.includes('archer') && r < 0.20) type = 'archer';
        else if (possibleTypes.includes('armored') && r < 0.30) type = 'armored';
        else if (possibleTypes.includes('skeleton') && r < 0.40) type = 'skeleton';
        else if (possibleTypes.includes('fast') && r < 0.50) type = 'fast';
        else if (possibleTypes.includes('green') && r < 0.70) type = 'green';

        const hpMult = 1 + (state.day - 1) * 0.2;
        const dmgMult = 1 + (state.day - 1) * 0.1;

        let baseHp = (45 + state.day * 3) * hpMult;
        let speed = 0.35 + state.day * 0.01;
        let damage = 0.12 * dmgMult;
        let size = 1;
        let color = '#8b5046'; // Slime Azul (default)
        let focusFences = false;

        if (type === 'boss') {
          baseHp *= 10;
          speed *= 0.4;
          damage *= 4;
          size = 2.5;
          color = '#ffd700'; // Gold for King Slime
        } else if (type === 'armored') {
          baseHp *= 3;
          speed *= 0.5;
          damage *= 2;
          size = 1.5;
          color = '#b35d44'; // Golem
          focusFences = true;
        } else if (type === 'fast') {
          baseHp *= 0.6;
          speed *= 2.0;
          damage *= 0.8;
          size = 0.8;
          color = '#8a2be2'; // Drackee
        } else if (type === 'green') {
          baseHp *= 1.5;
          speed *= 0.8;
          damage *= 1.2;
          size = 1.1;
          color = '#2e8b57'; // Slime Verde
        } else if (type === 'skeleton') {
          baseHp *= 1.2;
          speed *= 1.1;
          damage *= 1.4;
          size = 1.2;
          color = '#e0e0e0'; // Skeleton Bone
        } else if (type === 'archer') {
          baseHp *= 0.8;
          speed *= 0.7;
          damage *= 1.0;
          size = 1.0;
          color = '#ff8c00'; // Dark Orange Archer
        } else if (type === 'shaman') {
          baseHp *= 1.5;
          speed *= 0.6;
          damage *= 0.5;
          size = 1.1;
          color = '#9932cc'; // Dark Orchid Shaman
        }

        state.enemies.push({
          x, y,
          vx: 0, vy: 0,
          hp: baseHp, maxHp: baseHp,
          speed, damage,
          cooldown: 0, hitFlash: 0,
          type, size, color, focusFences,
          strategyOffset: { x: rand(-30, 30), y: rand(-30, 30) },
          stuckTimer: 0
        });
      }
    }

    function segmentCenter(seg: any) { return { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 }; }

    function updateEnemies() {
      for (let i = 0; i < state.enemies.length; i++) {
        const enemy = state.enemies[i];
        if (enemy.hitFlash > 0) enemy.hitFlash--;
        enemy.cooldown = Math.max(0, enemy.cooldown - 1);
        
        // Apply knockback/velocity
        enemy.x += enemy.vx;
        enemy.y += enemy.vy;
        enemy.vx *= 0.85;
        enemy.vy *= 0.85;

        // Separation (enemies push each other away)
        for (let j = i + 1; j < state.enemies.length; j++) {
          const other = state.enemies[j];
          const dist = Math.hypot(enemy.x - other.x, enemy.y - other.y);
          if (dist < 18) {
            const ang = Math.atan2(enemy.y - other.y, enemy.x - other.x);
            const force = (18 - dist) * 0.05;
            enemy.vx += Math.cos(ang) * force;
            enemy.vy += Math.sin(ang) * force;
            other.vx -= Math.cos(ang) * force;
            other.vy -= Math.sin(ang) * force;
          }
        }

        // Construction collision (Optimized: direct loop)
        for (const c of state.constructions.towers) {
          const d = Math.hypot(enemy.x - c.x, enemy.y - c.y);
          if (d < 24) {
            const ang = Math.atan2(enemy.y - c.y, enemy.x - c.x);
            enemy.x = c.x + Math.cos(ang) * 24;
            enemy.y = c.y + Math.sin(ang) * 24;
          }
        }

        let target: any = { x: state.campfire.x, y: state.campfire.y, type: 'campfire' };

        if (state.constructions.fenceBuilt && state.constructions.fenceSegments.length) {
          let bestSeg = null;
          let bestDist = Infinity;
          
          // Armored enemies focus on fences
          if (enemy.focusFences) {
            for (const seg of state.constructions.fenceSegments) {
              const c = segmentCenter(seg);
              const d = Math.hypot(enemy.x - c.x, enemy.y - c.y);
              if (d < bestDist) { bestDist = d; bestSeg = seg; }
            }
          } else {
            // Prioritize gates if they are relatively close
            const gate = state.constructions.fenceSegments.find(s => s.kind === 'gate');
            if (gate) {
              const gc = segmentCenter(gate);
              const gd = Math.hypot(enemy.x - gc.x, enemy.y - gc.y);
              if (gd < 180) { // If within "detection" range of gate
                bestSeg = gate;
                bestDist = gd;
              }
            }

            if (!bestSeg) {
              for (const seg of state.constructions.fenceSegments) {
                const c = segmentCenter(seg);
                const d = Math.hypot(enemy.x - c.x, enemy.y - c.y);
                if (d < bestDist) { bestDist = d; bestSeg = seg; }
              }
            }
          }

          if (bestSeg) {
            const c = segmentCenter(bestSeg);
            target = { x: c.x, y: c.y, type: 'segment', ref: bestSeg };
          }
        }

        // Apply strategic offset to surround target
        const tx = target.x + (enemy.strategyOffset?.x || 0);
        const ty = target.y + (enemy.strategyOffset?.y || 0);
        
        const dx = tx - enemy.x;
        const dy = ty - enemy.y;
        const d = Math.hypot(dx, dy) || 1;
        
        // Only move if not being knocked back significantly
        if (Math.hypot(enemy.vx, enemy.vy) < 0.5) {
          const prevX = enemy.x;
          const prevY = enemy.y;

          if (enemy.type === 'archer') {
            const distToPlayer = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
            if (distToPlayer > 180) {
              enemy.x += (dx / d) * enemy.speed;
              enemy.y += (dy / d) * enemy.speed;
            } else if (distToPlayer < 120) {
              enemy.x -= (dx / d) * enemy.speed;
              enemy.y -= (dy / d) * enemy.speed;
            }

            if (enemy.cooldown <= 0 && distToPlayer < 250) {
              enemy.cooldown = 120; // 2s between shots
              const ang = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
              state.projectiles.push({
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(ang) * 3,
                vy: Math.sin(ang) * 3,
                damage: enemy.damage * 10,
                life: 180,
                color: '#ff8c00'
              });
            }
          } else if (enemy.type === 'shaman') {
            enemy.x += (dx / d) * enemy.speed;
            enemy.y += (dy / d) * enemy.speed;

            const distToPlayer = Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y);
            if (distToPlayer < 80 && enemy.cooldown <= 0) {
              enemy.cooldown = 180; // 3s between debuffs
              state.player.slowed = 120; // 2s slow
              addEffect(state.player.x, state.player.y - 20, 'LENTO!', '#9932cc');
              triggerShake(2);
            }
          } else {
            if (d > 14) {
              enemy.x += (dx / d) * enemy.speed;
              enemy.y += (dy / d) * enemy.speed;
            } else if (enemy.cooldown <= 0) {
              enemy.cooldown = 48;
              if (target.type === 'segment' && target.ref) {
                target.ref.hp -= 8;
                target.ref.hitFlash = 5;
                triggerShake(2);
                addEffect(target.ref.x1 || target.ref.x, target.ref.y1 || target.ref.y, '-8', '#ff5252');
                addEffect(target.x, target.y - 6, '-8', '#d86b60');
              } else {
                state.player.health = clamp(state.player.health - enemy.damage * 8, 0, 100);
                state.player.hitFlash = 5;
                triggerShake(4);
              }
            }
          }

          // Stuck detection
          if (Math.hypot(enemy.x - prevX, enemy.y - prevY) < 0.1) {
            enemy.stuckTimer = (enemy.stuckTimer || 0) + 1;
            if (enemy.stuckTimer > 60) {
              enemy.vx += (Math.random() - 0.5) * 2;
              enemy.vy += (Math.random() - 0.5) * 2;
              enemy.stuckTimer = 0;
            }
          } else {
            enemy.stuckTimer = 0;
          }
        }
      }

      state.constructions.fenceSegments = state.constructions.fenceSegments.filter(seg => seg.hp > 0);
      if (state.constructions.fenceBuilt && state.constructions.fenceSegments.length === 0) {
        state.constructions.fenceBuilt = false;
        showMessage('A cerca caiu!');
        closeUpgradePanel();
      }

      state.enemies = state.enemies.filter(e => {
        if (e.hp <= 0 && !e.dying) {
          e.dying = 30; // 30 frames of death animation
          
          // Loot drop (18% chance)
          if (Math.random() < 0.18) {
            const r = Math.random();
            let lootType = 'herb';
            let lootName = 'Erva Medicinal';
            if (r < 0.05) { lootType = 'chalice'; lootName = 'Cálice de Vida'; }
            else if (r < 0.15) { lootType = 'sword'; lootName = 'Espada de Bronze'; }
            else if (r < 0.30) { lootType = 'ring'; lootName = 'Anel de Velocidade'; }
            else if (r < 0.45) { lootType = 'boot'; lootName = 'Bota de Mercúrio'; }
            else if (r < 0.65) { lootType = 'gem'; lootName = 'Gema de Liderança'; }
            
            state.drops.push({
              x: e.x, y: e.y,
              type: lootType,
              name: lootName,
              life: 600 // 10s
            });
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
        
        return e.x > -80 && e.x < WIDTH + 80 && e.y > -80 && e.y < HEIGHT + 80;
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
            state.player.damage += 5;
            addEffect(state.player.x, state.player.y - 40, '+5 Dano!', '#ff4d4d');
          }
          if (d.type === 'ring') {
            state.player.attackCooldown = Math.max(10, state.player.attackCooldown - 5);
            addEffect(state.player.x, state.player.y - 40, 'Ataque Rápido!', '#ffd700');
          }
          if (d.type === 'boot') {
            state.player.speed += 0.3;
            addEffect(state.player.x, state.player.y - 40, '+0.3 Velocidade!', '#8b4513');
          }
          if (d.type === 'herb') {
            const heal = state.player.maxHealth * 0.3;
            state.player.health = Math.min(state.player.maxHealth, state.player.health + heal);
            addEffect(state.player.x, state.player.y - 40, `+${Math.round(heal)} HP`, '#32cd32');
          }
          if (d.type === 'chalice') {
            state.player.maxHealth += 25;
            state.player.health = state.player.maxHealth;
            addEffect(state.player.x, state.player.y - 40, '+25 HP Máximo!', '#00bcd4');
          }
          if (d.type === 'gem') {
            state.constructions.helpers.forEach(h => {
              h.maxHp += 20;
              h.hp += 20;
              h.damage += 4;
              addEffect(h.x, h.y - 20, 'Soldado Buff!', '#9c27b0');
            });
            addEffect(state.player.x, state.player.y - 40, 'Exército Fortalecido!', '#9c27b0');
          }
          addPulse(state.player.x, state.player.y, '#fff');
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
              // Magical Fireball Effect
              state.particles.push({
                x: h.x, y: h.y,
                vx: (target.x - h.x) * 0.05,
                vy: (target.y - h.y) * 0.05,
                life: 0.5,
                size: 15,
                color: '#ba68c8',
                type: 'cloud'
              });
              // AOE Damage
              for (const e of state.enemies) {
                const ed = Math.hypot(target.x - e.x, target.y - e.y);
                if (ed < 65) {
                  e.hp -= h.damage * 1.5;
                  e.hitFlash = 5;
                  addEffect(e.x, e.y, `-${Math.round(h.damage * 1.5)}`, '#ba68c8');
                  if (e.hp <= 0) { state.player.gold += 1; }
                }
              }
              addPulse(target.x, target.y, '#e1bee7');
              triggerShake(2);
            }
          }
        } else if (h.type === 'summoner') {
          if (target) h.facing = target.x < h.x ? 'left' : 'right';
          if (h.cooldown === 0) {
            h.cooldown = 240;
            addPulse(h.x, h.y, '#4db6ac');
            // Summon a stronger Golem
            state.summons.push({
              x: h.x, y: h.y,
              vx: 0, vy: 0,
              hp: 100,
              maxHp: 100,
              damage: 12,
              speed: 1.2,
              life: 1200, // 20 seconds
              cooldown: 0,
              type: 'golem'
            });
            showQuestMessage('¡Golem Invocado!', 2000);
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

    function updateProjectiles() {
      for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const p = state.projectiles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;

        const d = Math.hypot(p.x - state.player.x, p.y - state.player.y);
        if (d < 15) {
          state.player.health = Math.max(0, state.player.health - p.damage);
          state.player.hitFlash = 5;
          triggerShake(3);
          state.projectiles.splice(i, 1);
          continue;
        }

        if (p.life <= 0) {
          state.projectiles.splice(i, 1);
        }
      }
    }

    function updateGame() {
      state.frame++;
      if (state.status !== 'playing') return;

      state.timeElapsed += 1/60;
      state.player.slowed = Math.max(0, state.player.slowed - 1);
      const currentSpeed = state.player.slowed > 0 ? state.player.speed * 0.5 : state.player.speed;
      state.timeOfDay += DAY_SPEED;
      state.pulse = (state.pulse + 0.05) % (Math.PI * 2);
      
      if (state.timeOfDay >= 1) {
        state.timeOfDay = 0;
        state.day += 1;
      }

      movePlayer(currentSpeed);
      updateProjectiles();
      updatePlayerCombat();
      updateEffects();
      state.cameraShake *= 0.88;

      // Multiplayer Sync
      if (socketRef.current && state.isJoined) {
        socketRef.current.emit('player-update', {
          roomId: state.roomId,
          x: state.player.x,
          y: state.player.y,
          health: state.player.health,
          maxHealth: state.player.maxHealth,
          facing: state.player.facing,
          frame: state.player.frame
        });

        if (state.isHost && state.frame % 10 === 0) {
          socketRef.current.emit('sync-game-state', {
            roomId: state.roomId,
            enemies: state.enemies,
            drops: state.drops,
            resources: state.resources,
            constructions: state.constructions,
            projectiles: state.projectiles,
            timeOfDay: state.timeOfDay,
            day: state.day
          });
        }
      }

      autoCollectResources();
      
      // Only host handles spawning and world updates (or single player)
      if (!state.isJoined || state.isHost) {
        spawnEnemy();
        updateEnemies();
        updateDrops();
        updateDefenders();
      }
      
      updateSummons();

      if (state.player.health <= 0) {
        state.status = 'gameover';
        if (ui.daysSurvived) ui.daysSurvived.textContent = String(state.day);
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
      ctx.fillStyle = '#b22222'; // Firebrick
      ctx.beginPath();
      ctx.moveTo(p.x - 10, p.y - 5 + bob);
      ctx.lineTo(p.x + 10, p.y - 5 + bob);
      ctx.lineTo(p.x + 16, p.y + 20 + bob);
      ctx.lineTo(p.x - 16, p.y + 20 + bob);
      ctx.fill();

      // Body (Cobalt Blue Tunic)
      ctx.fillStyle = '#0047AB'; // Cobalt Blue
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
      ctx.fillStyle = '#78909c'; // Steel blue
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

    function drawOtherPlayer(p: any) {
      const bob = p.frame === 1 ? 2 : 0;
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 18, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body (Blue Tunic for others)
      ctx.fillStyle = '#1565c0'; 
      ctx.fillRect(p.x - 10, p.y - 2 + bob, 20, 24);
      
      // Belt
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(p.x - 10, p.y + 8 + bob, 20, 4);

      // Head
      ctx.fillStyle = '#f5d6ba';
      ctx.fillRect(p.x - 8, p.y - 18 + bob, 16, 16);
      
      // Helmet
      ctx.fillStyle = '#78909c';
      ctx.beginPath();
      ctx.arc(p.x, p.y - 18 + bob, 10, Math.PI, 0);
      ctx.fill();

      // Eyes
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

      // Name tag
      ctx.fillStyle = '#fff';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(p.name || 'Aliado', p.x, p.y - 30 + bob);
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
      } else if (e.type === 'archer') {
        // ARCHER (Orange Slime with Bow)
        ctx.fillStyle = '#ff8c00';
        ctx.beginPath();
        ctx.arc(e.x, e.y + bob, 15 * s, 0, Math.PI * 2);
        ctx.fill();
        // Bow
        ctx.strokeStyle = '#5d4037';
        ctx.lineWidth = 3 * s;
        ctx.beginPath();
        ctx.arc(e.x + 10 * s, e.y + bob, 12 * s, -Math.PI/2, Math.PI/2);
        ctx.stroke();
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(e.x - 4 * s, e.y - 2 * s + bob, 3 * s, 0, Math.PI * 2);
        ctx.arc(e.x + 4 * s, e.y - 2 * s + bob, 3 * s, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === 'shaman') {
        // SHAMAN (Purple Slime with Staff)
        ctx.fillStyle = '#9932cc';
        ctx.beginPath();
        ctx.arc(e.x, e.y + bob, 16 * s, 0, Math.PI * 2);
        ctx.fill();
        // Staff
        ctx.strokeStyle = '#4e342e';
        ctx.lineWidth = 4 * s;
        ctx.beginPath();
        ctx.moveTo(e.x + 12 * s, e.y - 15 * s + bob);
        ctx.lineTo(e.x + 12 * s, e.y + 15 * s + bob);
        ctx.stroke();
        // Staff Gem
        ctx.fillStyle = '#e91e63';
        ctx.beginPath();
        ctx.arc(e.x + 12 * s, e.y - 18 * s + bob, 5 * s, 0, Math.PI * 2);
        ctx.fill();
        // Eyes (Glowing)
        ctx.fillStyle = '#ffeb3b';
        ctx.beginPath();
        ctx.arc(e.x - 5 * s, e.y - 3 * s + bob, 4 * s, 0, Math.PI * 2);
        ctx.arc(e.x + 5 * s, e.y - 3 * s + bob, 4 * s, 0, Math.PI * 2);
        ctx.fill();
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

    function drawProjectile(p: any) {
      ctx.fillStyle = p.color || '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      // Glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color || '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
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

      // Icon colors
      ctx.fillStyle = d.type === 'sword' ? '#c0c0c0' : 
                      d.type === 'ring' ? '#ffd700' : 
                      d.type === 'boot' ? '#8b4513' : 
                      d.type === 'gem' ? '#9c27b0' : 
                      d.type === 'chalice' ? '#00bcd4' : '#32cd32';
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
      if (s.type === 'golem') {
        // Golem Drawing
        ctx.fillStyle = '#78909c'; // Stone color
        ctx.fillRect(s.x - 12, s.y - 20 + bob, 24, 24);
        ctx.fillStyle = '#546e7a'; // Darker stone
        ctx.fillRect(s.x - 10, s.y - 18 + bob, 20, 20);
        // Eyes (Glowing Cyan)
        ctx.fillStyle = '#00bcd4';
        ctx.fillRect(s.x - 6, s.y - 12 + bob, 3, 3);
        ctx.fillRect(s.x + 3, s.y - 12 + bob, 3, 3);
        // Health Bar for Golem
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(s.x - 10, s.y - 28 + bob, 20, 3);
        ctx.fillStyle = '#4db6ac';
        ctx.fillRect(s.x - 10, s.y - 28 + bob, 20 * (s.hp / s.maxHp), 3);
      } else {
        // Default Spirit
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
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.save();
      if (state.cameraShake > 0) {
        ctx.translate((Math.random() - 0.5) * state.cameraShake, (Math.random() - 0.5) * state.cameraShake);
      }

      drawGround();
      drawAmbientParticles();

      // Collect all objects for depth sorting
      const objects: any[] = [
        ...state.bushes.map(b => ({ y: b.y, draw: () => drawBush(b.x, b.y, b.size) })),
        ...state.mushrooms.map(m => ({ y: m.y, draw: () => drawMushroom(m.x, m.y) })),
        ...state.rocks.map(r => ({ y: r.y, draw: () => drawRock(r.x, r.y, r.size) })),
        ...state.trees.map(t => ({ y: t.y, draw: () => drawTree(t.x, t.y, t.size) })),
        { y: state.campfire.y, draw: () => drawCampfire() },
        ...state.constructions.fenceSegments.map(seg => ({ y: (seg.y1 + seg.y2) / 2, draw: () => drawFenceSegment(seg) })),
        ...state.constructions.towers.map(t => ({ y: t.y, draw: () => drawTower(t) })),
        ...state.constructions.helpers.map(h => ({ y: h.y, draw: () => drawHelper(h) })),
        ...state.summons.map(s => ({ y: s.y, draw: () => drawSummon(s) })),
        ...state.resources.map(res => ({ y: res.y, draw: () => drawResource(res) })),
        ...state.drops.map(d => ({ y: d.y, draw: () => drawDrop(d) })),
        { y: state.player.y, draw: () => drawPlayer() },
        ...state.enemies.map(e => ({ y: e.y, draw: () => drawEnemy(e) })),
        ...state.projectiles.map(p => ({ y: p.y, draw: () => drawProjectile(p) })),
      ];

      // Sort by Y coordinate
      objects.sort((a, b) => a.y - b.y);

      // Draw sorted objects
      objects.forEach(obj => obj.draw());

      // Draw Remote Players
      Object.entries(state.remotePlayers).forEach(([id, p]: [string, any]) => {
        drawOtherPlayer({ ...p, id });
      });

      drawEffects();
      drawWeather();
      drawForestEdges();
      drawDayNight();
      ctx.restore();
    }

    function gameLoop() {
      updateGame();
      render();
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
      
      ui.closePanelBtn?.removeEventListener('touchstart', handleClosePanel);
      ui.closePanelBtn?.removeEventListener('click', handleClosePanel);
      ui.upgradeBtn?.removeEventListener('touchstart', handleUpgrade);
      ui.upgradeBtn?.removeEventListener('click', handleUpgrade);
      ui.repairBtn?.removeEventListener('touchstart', handleRepair);
      ui.repairBtn?.removeEventListener('click', handleRepair);
      document.getElementById('startBtn')?.removeEventListener('touchstart', handleStart);
      document.getElementById('startBtn')?.removeEventListener('click', handleStart);
      document.getElementById('restartBtn')?.removeEventListener('click', handleRestart);
      document.getElementById('toggleMobileMode')?.removeEventListener('click', handleToggleMobile);
      
      canvas.removeEventListener('mousemove', handleCanvasMouseMove);
      canvas.removeEventListener('pointerdown', handleCanvasPointerDown);
      canvas.removeEventListener('click', handleCanvasClick);

      hotbarItems.forEach((item, index) => {
        item.removeEventListener('click', hotbarHandlers[index]);
      });

      ui.joystickBase?.removeEventListener('pointerdown', startJoystick);
      ui.joystickBase?.removeEventListener('pointermove', moveJoystick);
      ui.joystickBase?.removeEventListener('pointerup', endJoystick);
      ui.joystickBase?.removeEventListener('pointercancel', endJoystick);
      ui.joystickBase?.removeEventListener('lostpointercapture', endJoystick);
    };
  }, [gameStarted, isJoined]);

  return (
    <div className="app-container">
      <div className="game-wrap">
        <canvas ref={canvasRef} width={860} height={640} />

        {/* New Responsive HUD */}
        <div className="hud-top">
          <div className="flex flex-col gap-1">
            <div className="health-container-top">
              <div id="healthFill" className="hp-bar-fill" style={{ width: '100%' }} />
            </div>
            {isJoined && (
              <div className="flex items-center gap-2 px-2 py-0.5 bg-black/40 rounded-full border border-blue-500/30 w-fit">
                <div className={`w-1.5 h-1.5 rounded-full ${isHost ? 'bg-yellow-400' : 'bg-blue-400'} animate-pulse`} />
                <span className="text-[10px] text-white/80 font-mono uppercase tracking-wider">
                  {isHost ? 'Host' : 'Client'} • Sala {roomId}
                </span>
              </div>
            )}
          </div>
          
          <div className="hud-main-row">
            <div className="hud-resources">
              <div className="hud-stat-item">
                <Heart size={14} color="#ff4d4d" fill="#ff4d4d" className="md:w-4 md:h-4" />
                <span id="healthText">100%</span>
              </div>
              <div className="hud-stat-item">
                <Coins size={14} color="#ffd700" className="md:w-4 md:h-4" />
                <span id="goldCount">0</span>
              </div>
              <div className="hud-stat-item">
                <Trees size={14} color="#8c5a39" className="md:w-4 md:h-4" />
                <span id="woodCount">0</span>
              </div>
              <div className="hud-stat-item">
                <Shield size={14} color="#808074" className="md:w-4 md:h-4" />
                <span id="stoneCount">0</span>
              </div>
              <div className="hud-stat-item">
                <Gem size={14} color="#79a950" className="md:w-4 md:h-4" />
                <span id="fiberCount">0</span>
              </div>
            </div>

            <div className="day-info">
              <span id="dayBadge">Dia 1 — Dia</span>
            </div>
          </div>
        </div>

        {/* Hotbar / Shop Menu */}
        <div className="hotbar">
          <div className="hotbar-item dq-window" onClick={() => (window as any).buyConstruction?.('fence')}>
            <div className="key-hint">1</div>
            <Shield className="icon" />
            <div className="label">Cerca</div>
          </div>
          <div className="hotbar-item dq-window" onClick={() => (window as any).buyConstruction?.('tower')}>
            <div className="key-hint">2</div>
            <ArrowUpCircle className="icon" />
            <div className="label">Torre</div>
          </div>
          <div className="hotbar-item dq-window" onClick={() => (window as any).buyConstruction?.('helper')}>
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
        </div>

        <div id="questMessage" className="quest-message">Um Slime se aproxima!</div>
        <div id="messageBox" className="message" />

        <div id="upgradePanel" className="upgrade-panel dq-window">
          <h3 id="panelTitle">Torre</h3>
          <p id="panelDesc">Nível 1 • Vida 100/100</p>
          <div className="panel-buttons">
            <button id="upgradeBtn" className="panel-btn">Melhorar</button>
            <button id="repairBtn" className="panel-btn">Reparar</button>
            <button id="closePanelBtn" className="panel-btn">Fechar</button>
          </div>
        </div>

        {/* Room Selection Overlay */}
      {!isJoined && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="dq-window w-full max-w-md p-8 text-center space-y-6 shadow-2xl border-4 border-blue-400/30">
            {!gameStarted ? (
              <div className="space-y-6">
                <div className="flex justify-center mb-4">
                  <div className="p-6 bg-blue-500/20 rounded-full border-4 border-blue-400/50 shadow-[0_0_20px_rgba(96,165,250,0.3)]">
                    <Play className="w-16 h-16 text-blue-400 fill-blue-400/20" />
                  </div>
                </div>
                <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic">Nobre na Floresta</h1>
                <p className="text-blue-200/70 text-sm leading-relaxed">
                  Defenda seu acampamento dos monstros da floresta!<br/>
                  Colete recursos de dia e sobreviva à noite.
                </p>
                
                <button 
                  onClick={() => setGameStarted(true)}
                  className="w-full py-5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xl rounded-xl shadow-[0_6px_0_rgb(30,58,138)] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-3 group"
                >
                  <Play className="w-6 h-6 group-hover:scale-110 transition-transform" />
                  INICIAR JOGO
                </button>

                <div className="pt-4 border-t border-white/10 flex justify-center gap-6 opacity-40 text-[10px] uppercase tracking-widest font-bold text-blue-300">
                  <span>WASD: MOVER</span>
                  <span>CLIQUE: ATACAR</span>
                  <span>1-3: CONSTRUIR</span>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                    <Users className="w-6 h-6 text-blue-400" />
                    Multiplayer
                  </h2>
                  <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                    <span className="text-[10px] font-bold text-blue-200/50 uppercase tracking-tighter">
                      {isConnected ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] text-left">Salas Ativas</p>
                      <button 
                        onClick={() => socketRef.current?.emit('request-rooms')}
                        className="p-1.5 hover:bg-white/10 rounded-full transition-all group active:scale-90"
                        title="Atualizar Lista"
                      >
                        <Globe className="w-4 h-4 text-blue-400/50 group-hover:text-blue-400 group-hover:rotate-180 transition-all duration-700" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar min-h-[100px]">
                      {roomsList.length > 0 ? (
                        roomsList.map((room) => (
                          <button
                            key={room.id}
                            onClick={() => {
                              setRoomId(room.id);
                              setIsJoined(true);
                            }}
                            className="flex items-center justify-between p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl hover:bg-blue-500/15 hover:border-blue-400/40 transition-all group text-left"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                              <div>
                                <span className="text-white font-bold block">Sala {room.id}</span>
                                <span className="text-[10px] text-blue-300/40 uppercase font-black">Clique para entrar</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 px-2 py-1 bg-blue-500/10 rounded-lg text-blue-300 font-bold text-xs">
                              <Users className="w-3 h-3" />
                              <span>{room.playerCount}</span>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="flex flex-col items-center justify-center p-8 bg-white/5 border border-dashed border-white/10 rounded-xl text-center space-y-2">
                          <Globe className="w-8 h-8 text-white/5" />
                          <p className="text-blue-300/30 text-xs font-medium italic">Nenhuma sala ativa encontrada</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-white/10">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="ID DA SALA..."
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        className="flex-1 bg-black/40 border-2 border-blue-900/50 rounded-xl px-4 py-3 text-white font-bold placeholder:text-blue-900/50 focus:border-blue-500/50 outline-none transition-all uppercase"
                      />
                      <button
                        onClick={() => {
                          const randomId = Math.floor(Math.random() * 9000 + 1000).toString();
                          setRoomId(randomId);
                          setIsJoined(true);
                        }}
                        className="px-5 py-3 bg-blue-600/20 border-2 border-blue-500/30 rounded-xl text-blue-400 hover:bg-blue-600/30 hover:border-blue-400 transition-all flex items-center gap-2 font-bold"
                        title="Criar Nova Sala"
                      >
                        <Plus className="w-5 h-5" />
                        NOVA
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => {
                          if (roomId.trim()) {
                            setIsJoined(true);
                          } else {
                            alert('Digite um ID de sala.');
                          }
                        }}
                        className="py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl shadow-[0_4px_0_rgb(30,58,138)] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2 group"
                      >
                        <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        ENTRAR
                      </button>
                      <button
                        onClick={() => {
                          const soloId = "SOLO-" + Math.floor(Math.random() * 100000);
                          setRoomId(soloId);
                          setIsJoined(true);
                        }}
                        className="py-4 bg-zinc-800 hover:bg-zinc-700 text-white font-black rounded-xl shadow-[0_4px_0_rgb(39,39,42)] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-2"
                      >
                        JOGAR SOLO
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
            <button id="restartBtn" className="btn-start">TENTAR NOVAMENTE</button>
          </div>
        </div>
      </div>
    </div>
  );
}
