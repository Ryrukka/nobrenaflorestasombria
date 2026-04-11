import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Heart, Coins, Trees, Gem, Hammer, Shield, Users, X, ArrowUpCircle, Wrench, Play, Plus, LogIn, Globe, PawPrint, Trophy, Sword, Pickaxe } from 'lucide-react';

const DIALOGUES = {
  ENEMY_SIGHTED: ["Inimigos à vista!", "Defendam a base!", "Alerta!", "Invasores!"],
  ATTACKING: ["Eu cuido desse!", "Avançando!", "Pela fogueira!", "Ataquem!", "Não passarão!"],
  COLLECTING: ["Pegando recursos!", "Isso vai ajudar a base.", "Coletando...", "Trabalho duro!"],
  RETURNING: ["Voltando pra base!", "Carga cheia!", "Missão cumprida.", "Suprimentos chegando!"],
  IDLE: ["Tudo tranquilo por enquanto...", "Vamos manter a guarda.", "Vigilância total.", "Nada a relatar."]
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const stateRef = useRef<any>({
    particles: [],
    enemies: [],
    drops: [],
    resources: [],
    constructions: {
      fenceBuilt: false,
      fenceSegments: [],
      towers: [],
      helpers: [],
      wolves: [],
      falcons: []
    },
    projectiles: [],
    summons: [],
    effects: [],
    timeOfDay: 0.42,
    day: 1,
    frame: 0,
    spawnTimer: 0,
    timeElapsed: 0,
    status: 'playing',
    player: {
      x: 700, y: 550,
      health: 100, maxHealth: 100,
      gold: 50, wood: 20, stone: 10, fiber: 5,
      speed: 2.2, damage: 12,
      attackCooldown: 30, attackTimer: 0,
      facing: 'right', frame: 0,
      hitFlash: 0, slowed: 0,
      idleAttackTimer: 0,
      damageMult: 1.0, healthMult: 1.0, resourceMult: 1.0
    },
    campfire: { x: 700, y: 550, hp: 100, maxHp: 100, level: 1, radius: 20 },
    pulse: 0
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!gameStarted) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const MAP_WIDTH = 1400;
    const MAP_HEIGHT = 1100;

    // Spatial Grid Optimization (O(N) instead of O(N^2))
    // This divides the map into regions to check only nearby entities
    const GRID_CELL_SIZE = 120;
    const gridCols = Math.ceil(MAP_WIDTH / GRID_CELL_SIZE);
    const gridRows = Math.ceil(MAP_HEIGHT / GRID_CELL_SIZE);
    const spatialGrid: any[][] = Array.from({ length: gridCols * gridRows }, () => []);

    function updateSpatialGrid() {
      // Clear grid efficiently
      for (let i = 0; i < spatialGrid.length; i++) {
        spatialGrid[i].length = 0;
      }
      
      // Add all active enemies to their respective grid cells
      for (const enemy of state.enemies) {
        if (enemy.dying !== undefined) continue; // Skip dying enemies
        const col = Math.floor(enemy.x / GRID_CELL_SIZE);
        const row = Math.floor(enemy.y / GRID_CELL_SIZE);
        if (col >= 0 && col < gridCols && row >= 0 && row < gridRows) {
          spatialGrid[row * gridCols + col].push(enemy);
        }
      }
    }

    // Returns a list of enemies within the grid cells covered by the radius
    function getNearbyEnemies(x: number, y: number, radius: number) {
      const minCol = Math.max(0, Math.floor((x - radius) / GRID_CELL_SIZE));
      const maxCol = Math.min(gridCols - 1, Math.floor((x + radius) / GRID_CELL_SIZE));
      const minRow = Math.max(0, Math.floor((y - radius) / GRID_CELL_SIZE));
      const maxRow = Math.min(gridRows - 1, Math.floor((y + radius) / GRID_CELL_SIZE));
      
      const nearby = [];
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const cell = spatialGrid[r * gridCols + c];
          for (let i = 0; i < cell.length; i++) {
            nearby.push(cell[i]);
          }
        }
      }
      return nearby;
    }

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

    let messageTimer: any = null;
    let questMessageTimer: any = null;
    let forceMobile = false;
    
    // Internal systems for Intensity & Balance
    let eventCooldown = 0;
    let activeHunters = 0;
    let activeInfiltrators = 0;

    const DAY_SPEED = 0.00028;
    const AUTO_COLLECT_RADIUS = 34;
    const PC_BUILD_KEYS: Record<string, string> = { 'u': 'campfire' };

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
      clearTimeout(questMessageTimer);
      questMessageTimer = setTimeout(() => { if (ui.questMessage) ui.questMessage.style.display = 'none'; }, duration);
    }

    // --- Milestone & Boss Systems ---
    
    function spawnBoss(wave: number) {
      const isMilestone = wave % 10 === 0;
      // Controlled boss scaling
      const hpMult = 1 + (wave - 1) * 0.2;
      const dmgMult = 1 + (wave - 1) * 0.15;
      
      const baseHp = (500 + wave * 120) * hpMult;
      const damage = 0.75 * dmgMult;
      const size = isMilestone ? 4.2 : 3.0;
      const color = isMilestone ? '#ff00ff' : '#ffd700'; // Magenta for milestones, Gold for bosses
      
      // Spawn from a random side
      const side = Math.floor(Math.random() * 4);
      let x = 0, y = 0;
      if (side === 0) { x = MAP_WIDTH / 2; y = -100; }
      else if (side === 1) { x = MAP_WIDTH + 100; y = MAP_HEIGHT / 2; }
      else if (side === 2) { x = MAP_WIDTH / 2; y = MAP_HEIGHT + 100; }
      else if (side === 3) { x = -100; y = MAP_HEIGHT / 2; }

      state.enemies.push({
        x, y,
        vx: 0, vy: 0,
        hp: baseHp, maxHp: baseHp,
        speed: 0.35, damage,
        cooldown: 0, hitFlash: 0,
        type: 'boss', size, color, focusFences: true,
        behavior: 0,
        strategyOffset: { x: 0, y: 0 },
        stuckTimer: 0,
        isMilestone
      });
      
      const msg = isMilestone ? "O GRANDE GUARDIÃO SURGIU!" : "O CHEFE DA HORDA CHEGOU!";
      showQuestMessage(msg, 4500);
      triggerShake(25);
    }

    function giveWaveRewards(wave: number) {
      const isBossWave = wave % 5 === 0;
      const isMilestone = wave % 10 === 0;
      
      if (isBossWave) {
        // Balanced resource bonuses
        const goldBonus = 40 + wave * 10;
        const woodBonus = 20 + wave * 6;
        const stoneBonus = 10 + wave * 3;
        
        state.player.gold += goldBonus;
        state.player.wood += woodBonus;
        state.player.stone += stoneBonus;
        
        // Balanced healing
        state.player.health = Math.min(state.player.maxHealth, state.player.health + 20);
        state.campfire.hp = Math.min(state.campfire.maxHp, state.campfire.hp + 15);
        
        const msg = isMilestone ? `MARCO CONCLUÍDO! +${goldBonus} Ouro, +${woodBonus} Madeira` : `VITÓRIA! +${goldBonus} Ouro, +${woodBonus} Madeira`;
        showQuestMessage(msg, 4500);
        
        // Visual feedback
        for (let i = 0; i < 15; i++) {
          state.particles.push({
            x: state.player.x, y: state.player.y,
            vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.8) * 10,
            life: 1.0, size: rand(3, 6), color: '#ffd700'
          });
        }
        addEffect(state.player.x, state.player.y - 50, 'RECOMPENSA DE BOSS!', '#ffd700', true);

        // Trigger Reward Choice UI
        setTimeout(() => {
          if (ui.rewardOverlay) {
            ui.rewardOverlay.style.display = 'flex';
            state.status = 'paused';
          }
        }, 2000);
      }
    }

    function handleReward(type: 'atk' | 'def' | 'eco') {
      // Diminishing returns formula: increment = base / multiplier
      // This ensures that as you get stronger, further upgrades are less explosive
      
      if (type === 'atk') {
        const currentMult = state.player.damageMult || 1.0;
        const increment = 0.25 / currentMult; 
        state.player.damageMult = currentMult + increment;
        state.player.damage = Math.round(12 * state.player.damageMult);
        
        // Trade-off: Focus on power reduces max health slightly
        state.player.healthMult = Math.max(0.8, (state.player.healthMult || 1.0) - 0.05);
        state.player.maxHealth = Math.round(100 * state.player.healthMult);
        state.player.health = Math.min(state.player.health, state.player.maxHealth);
        
        addEffect(state.player.x, state.player.y - 40, 'DANO++, VIDA-', '#ff5252', true);
      } else if (type === 'def') {
        const currentMult = state.player.healthMult || 1.0;
        const increment = 0.25 / currentMult;
        state.player.healthMult = currentMult + increment;
        const oldMax = state.player.maxHealth;
        state.player.maxHealth = Math.round(100 * state.player.healthMult);
        state.player.health += (state.player.maxHealth - oldMax);
        
        // Trade-off: Focus on defense reduces damage slightly
        state.player.damageMult = Math.max(0.8, (state.player.damageMult || 1.0) - 0.05);
        state.player.damage = Math.round(12 * state.player.damageMult);
        
        addEffect(state.player.x, state.player.y - 40, 'VIDA++, DANO-', '#2196f3', true);
      } else if (type === 'eco') {
        const currentMult = state.player.resourceMult || 1.0;
        const increment = 0.25 / currentMult;
        state.player.resourceMult = currentMult + increment;
        
        // Trade-off: Focus on economy reduces max health slightly
        state.player.healthMult = Math.max(0.8, (state.player.healthMult || 1.0) - 0.05);
        state.player.maxHealth = Math.round(100 * state.player.healthMult);
        state.player.health = Math.min(state.player.health, state.player.maxHealth);
        
        addEffect(state.player.x, state.player.y - 40, 'COLETA++, VIDA-', '#4caf50', true);
      }
      
      if (ui.rewardOverlay) ui.rewardOverlay.style.display = 'none';
      state.status = 'playing';
      triggerShake(10);
      
      // Level up effect
      for (let i = 0; i < 20; i++) {
        state.particles.push({
          x: state.player.x, y: state.player.y,
          vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10,
          life: 1.2, size: rand(4, 8), color: type === 'atk' ? '#ff5252' : type === 'def' ? '#2196f3' : '#4caf50'
        });
      }
    }

    function showMessage(text: string) {
      if (!ui.messageBox) return;
      ui.messageBox.textContent = text;
      ui.messageBox.style.display = 'block';
      clearTimeout(messageTimer);
      messageTimer = setTimeout(() => { if (ui.messageBox) ui.messageBox.style.display = 'none'; }, 1500);
    }

    const isInCenter = (x: number, y: number) => {
      const clearRadius = 380; // Área limpa ao redor da fogueira (MAP_WIDTH/2, MAP_HEIGHT/2)
      const dist = Math.hypot(x - MAP_WIDTH / 2, y - MAP_HEIGHT / 2);
      return dist < clearRadius;
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

    function nextResourceType(currentTime?: number) {
      const timeOfDay = currentTime !== undefined ? currentTime : state.timeOfDay;
      const isNight = timeOfDay > 0.25 && timeOfDay < 0.75;
      const r = Math.random();
      
      if (isNight) {
        // More gold and fiber at night
        if (r < 0.30) return 'wood';
        if (r < 0.55) return 'stone';
        if (r < 0.80) return 'fiber';
        return 'gold';
      } else {
        if (r < 0.42) return 'wood';
        if (r < 0.74) return 'stone';
        if (r < 0.94) return 'fiber';
        return 'gold';
      }
    }

    function makeResource(type: string) {
      const margin = 56;
      const pos = getPos(margin, MAP_WIDTH - margin, margin, MAP_HEIGHT - margin);
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

    let state: GameState = initialState();
    stateRef.current = state;

    // Camera state
    const camera = {
      x: state.player.x - WIDTH / 2,
      y: state.player.y - HEIGHT / 2
    };

    function updateCamera() {
      const targetX = state.player.x - WIDTH / 2;
      const targetY = state.player.y - HEIGHT / 2;
      
      // Smooth follow
      camera.x += (targetX - camera.x) * 0.1;
      camera.y += (targetY - camera.y) * 0.1;
      
      // Clamp to map boundaries
      camera.x = clamp(camera.x, 0, MAP_WIDTH - WIDTH);
      camera.y = clamp(camera.y, 0, MAP_HEIGHT - HEIGHT);
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
      rewardOverlay: document.getElementById('rewardOverlay'),
      rewardAtk: document.getElementById('rewardAtk'),
      rewardDef: document.getElementById('rewardDef'),
      rewardEco: document.getElementById('rewardEco'),
    };

    const keys: Record<string, boolean> = {};
    const pointer = { x: 0, y: 0 };
    const joystick = { active: false, dx: 0, dy: 0 };
    let mobileMovement = { x: 0, y: 0 };
    let joystickActive = false;
    let joystickStart = { x: 0, y: 0 };
    let selectedConstruction: any = null;
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
      isWaveActive: boolean;
      waveTimer: number;
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
      frame: number;
    }

    const CAMPFIRE_LEVELS = [
      { level: 1, name: "Acampamento Inicial", cost: { wood: 0, stone: 0, gold: 0 }, towers: 0, helpers: 0, wolves: 0, falcons: 0, fence: false, lightRadius: 300 },
      { level: 2, name: "Posto de Vigia", cost: { wood: 20, stone: 10, gold: 0 }, towers: 1, helpers: 0, wolves: 0, falcons: 0, fence: true, lightRadius: 350 },
      { level: 3, name: "Pequena Vila", cost: { wood: 40, stone: 20, gold: 10 }, towers: 2, helpers: 1, wolves: 0, falcons: 0, fence: true, lightRadius: 400 },
      { level: 4, name: "Forte de Madeira", cost: { wood: 80, stone: 45, gold: 25 }, towers: 3, helpers: 2, wolves: 1, falcons: 1, fence: true, lightRadius: 450 },
      { level: 5, name: "Cidadela", cost: { wood: 160, stone: 90, gold: 50 }, towers: 4, helpers: 4, wolves: 2, falcons: 1, fence: true, lightRadius: 500 },
      { level: 6, name: "Fortaleza Real", cost: { wood: 300, stone: 180, gold: 100 }, towers: 5, helpers: 6, wolves: 3, falcons: 2, fence: true, lightRadius: 550 },
      { level: 7, name: "Reino Próspero", cost: { wood: 600, stone: 400, gold: 250 }, towers: 6, helpers: 8, wolves: 4, falcons: 3, fence: true, lightRadius: 600 },
      { level: 8, name: "Império Eterno", cost: { wood: 1200, stone: 800, gold: 500 }, towers: 8, helpers: 10, wolves: 6, falcons: 4, fence: true, lightRadius: 700 },
    ];

    /**
     * Sincroniza as defesas da base com o nível atual da fogueira.
     * Garante que as estruturas surjam automaticamente e sejam melhoradas.
     */
    function syncBaseDefenses(state: any) {
      const cfLevel = state.campfire.level;
      const levelData = CAMPFIRE_LEVELS.find(l => l.level === cfLevel);
      if (!levelData) return;

      // Campfire Evolution: Impactful changes
      state.campfire.maxHp = 100 + (cfLevel - 1) * 50;
      state.campfire.hp = Math.min(state.campfire.maxHp, state.campfire.hp + 20);
      
      // Visual feedback for upgrade
      addPulse(state.campfire.x, state.campfire.y, '#ffd700');
      triggerShake(8);
      addEffect(state.campfire.x, state.campfire.y - 60, `CAMPFIRE NÍVEL ${cfLevel}!`, '#ffd700', true);
      
      // Boost existing defenses based on level (with soft caps)
      for (const t of state.constructions.towers) {
        t.damage = Math.min(45, 15 + cfLevel * 2.5);
        t.fireRate = Math.max(25, 60 - cfLevel * 4);
      }
      for (const h of state.constructions.helpers) {
        h.damage = Math.min(25, 8 + cfLevel * 1.5);
      }

      // 1. Sincronizar e Melhorar Cerca
      if (levelData.fence && !state.constructions.fenceBuilt) {
        state.constructions.fenceBuilt = true;
        state.constructions.fenceSegments = createFenceSegments(state.campfire);
      }
      if (state.constructions.fenceBuilt) {
        state.constructions.fenceSegments.forEach((seg: any) => {
          if (seg.level < cfLevel) {
            const diff = cfLevel - seg.level;
            seg.level = cfLevel;
            seg.maxHp += 100 * diff;
            seg.hp = seg.maxHp;
          }
        });
      }

      // 2. Sincronizar e Melhorar Torres
      state.constructions.towers.forEach((t: any) => {
        if (t.level < cfLevel) {
          const diff = cfLevel - t.level;
          t.level = cfLevel;
          t.damage += 6 * diff;
          t.range += 15 * diff;
          t.maxHp += 60 * diff;
          t.hp = t.maxHp;
        }
      });
      while (state.constructions.towers.length < levelData.towers) {
        const slot = state.towerSlots.find(s => !s.used);
        if (slot) {
          slot.used = true;
          const t = { x: slot.x, y: slot.y, level: 1, hp: 120, maxHp: 120, damage: 12, range: 140, cooldown: 0 };
          // Se a fogueira já estiver em nível alto, a torre nasce forte
          if (cfLevel > 1) {
            const diff = cfLevel - 1;
            t.level = cfLevel;
            t.damage += 6 * diff;
            t.range += 15 * diff;
            t.maxHp += 60 * diff;
            t.hp = t.maxHp;
          }
          state.constructions.towers.push(t);
        } else break;
      }

      // 3. Sincronizar e Melhorar Lobos (Guardas)
      state.constructions.wolves.forEach((w: any) => {
        if (w.level < cfLevel) {
          const diff = cfLevel - w.level;
          w.level = cfLevel;
          w.damage += 15 * diff;
          w.maxHp += 60 * diff;
          w.hp = w.maxHp;
        }
      });
      while (state.constructions.wolves.length < levelData.wolves) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 80;
        const dx = state.campfire.x + Math.cos(angle) * dist;
        const dy = state.campfire.y + Math.sin(angle) * dist;
        const w = {
          x: dx, y: dy, homeX: dx, homeY: dy,
          level: 1, hp: 120, maxHp: 120, damage: 30, speed: 5.0,
          cooldown: 0, facing: 'right', walkTimer: 0,
          isSitting: false, howlTimer: 0
        };
        if (cfLevel > 1) {
          const diff = cfLevel - 1;
          w.level = cfLevel;
          w.damage += 15 * diff;
          w.maxHp += 60 * diff;
          w.hp = w.maxHp;
        }
        state.constructions.wolves.push(w);
      }

      // 4. Sincronizar e Melhorar Falcões (Vigilantes)
      state.constructions.falcons.forEach((f: any) => {
        if (f.level < cfLevel) {
          const diff = cfLevel - f.level;
          f.level = cfLevel;
          f.damage += 10 * diff;
          f.maxHp += 40 * diff;
          f.hp = f.maxHp;
        }
      });
      while (state.constructions.falcons.length < levelData.falcons) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 100;
        const dx = state.campfire.x + Math.cos(angle) * dist;
        const dy = state.campfire.y + Math.sin(angle) * dist;
        const f = {
          x: dx, y: dy, homeX: dx, homeY: dy,
          level: 1, hp: 80, maxHp: 80, damage: 20, speed: 6.5,
          cooldown: 0, facing: 'right', flapTimer: 0,
          altitude: 45, target: null
        };
        if (cfLevel > 1) {
          const diff = cfLevel - 1;
          f.level = cfLevel;
          f.damage += 10 * diff;
          f.maxHp += 40 * diff;
          f.hp = f.maxHp;
        }
        state.constructions.falcons.push(f);
      }

      // 5. Sincronizar e Melhorar Soldados (Aliados)
      state.constructions.helpers.forEach((h: any) => {
        if (h.level < cfLevel) {
          const diff = cfLevel - h.level;
          h.level = cfLevel;
          h.damage += 5 * diff;
          h.range += 12 * diff;
          h.maxHp += 50 * diff;
          h.hp = h.maxHp;
        }
      });
      while (state.constructions.helpers.length < levelData.helpers) {
        const slot = state.helperSlots.find(s => !s.used);
        if (slot) {
          slot.used = true;
          const types = ['warrior', 'archer', 'mage', 'sniper', 'summoner'];
          const hType = types[state.constructions.helpers.length % types.length];
          const h: any = {
            x: slot.x, y: slot.y, homeX: slot.x, homeY: slot.y,
            level: 1, type: hType, hp: 120, maxHp: 120,
            damage: 10, range: 130, cooldown: 0, summonTimer: 0,
            state: 'idle', target: null as any, attackCooldown: 0,
            speechCooldown: rand(100, 300), speechText: '', speechTimer: 0
          };
          if (hType === 'warrior') { h.hp = 200; h.maxHp = 200; h.damage = 20; h.range = 140; }
          if (hType === 'sniper') { h.hp = 100; h.maxHp = 100; h.damage = 40; h.range = 280; h.cooldown = 100; }
          if (hType === 'mage') { h.hp = 110; h.maxHp = 110; h.damage = 15; h.range = 200; h.cooldown = 60; }
          if (hType === 'summoner') { h.hp = 120; h.maxHp = 120; h.damage = 0; h.range = 220; h.cooldown = 180; }
          
          if (cfLevel > 1) {
            const diff = cfLevel - 1;
            h.level = cfLevel;
            h.damage += 5 * diff;
            h.range += 12 * diff;
            h.maxHp += 50 * diff;
            h.hp = h.maxHp;
          }
          state.constructions.helpers.push(h);
        } else break;
      }
    }

function initialState(): GameState {
      const campfire = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2, hp: 100, maxHp: 100, level: 1, radius: 122 };
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
        ambientParticles: Array.from({ length: 40 }, () => ({
          x: rand(0, MAP_WIDTH),
          y: rand(0, MAP_HEIGHT),
          vx: rand(0.2, 0.8),
          vy: rand(0.1, 0.4),
          size: rand(2, 4),
          color: Math.random() > 0.5 ? '#79a950' : '#4e7a33', // Leaf colors
          type: 'leaf'
        })),
        grass: Array.from({ length: 250 }, () => {
          const pos = getPos(0, MAP_WIDTH, 0, MAP_HEIGHT);
          return {
            x: pos.x,
            y: pos.y,
            type: Math.floor(rand(0, 3))
          };
        }),
        wave: 1,
        isWaveActive: true,
        waveTimer: 60 * 60, // 60 seconds at 60fps
        dayTime: 0.42,
        player: {
          x: MAP_WIDTH / 2,
          y: MAP_HEIGHT / 2 + 66,
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
        resources: Array.from({ length: 180 }, () => makeResource(nextResourceType(0.42))),
        enemies: [] as any[],
        summons: [] as any[],
        trees: Array.from({ length: 400 }, () => {
          const pos = getPos(-50, MAP_WIDTH + 50, -50, MAP_HEIGHT + 50);
          return { x: pos.x, y: pos.y, size: rand(0.9, 1.4) };
        }),
        rocks: Array.from({ length: 180 }, () => {
          const pos = getPos(20, MAP_WIDTH - 20, 20, MAP_HEIGHT - 20);
          return { x: pos.x, y: pos.y, size: rand(0.8, 1.3) };
        }),
        bushes: Array.from({ length: 300 }, () => {
          const pos = getPos(20, MAP_WIDTH - 20, 20, MAP_HEIGHT - 20);
          return { x: pos.x, y: pos.y, size: rand(0.7, 1.2) };
        }),
        mushrooms: Array.from({ length: 200 }, () => {
          const pos = getPos(30, MAP_WIDTH - 30, 30, MAP_HEIGHT - 30);
          return { x: pos.x, y: pos.y };
        }),
        constructions: {
          fenceBuilt: false,
          fenceSegments: [] as any[],
          towers: [] as any[],
          helpers: [] as any[],
          wolves: [] as any[],
          falcons: [] as any[]
        },
        towerSlots: [
          { x: MAP_WIDTH / 2 - 142, y: MAP_HEIGHT / 2 - 140, used: false },
          { x: MAP_WIDTH / 2 + 142, y: MAP_HEIGHT / 2 - 140, used: false },
          { x: MAP_WIDTH / 2 - 142, y: MAP_HEIGHT / 2 + 142, used: false },
          { x: MAP_WIDTH / 2 + 142, y: MAP_HEIGHT / 2 + 142, used: false },
          { x: MAP_WIDTH / 2 - 200, y: MAP_HEIGHT / 2, used: false },
          { x: MAP_WIDTH / 2 + 200, y: MAP_HEIGHT / 2, used: false },
          { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 - 200, used: false },
          { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 + 200, used: false },
        ],
        helperSlots: [
          { x: MAP_WIDTH / 2 - 80, y: MAP_HEIGHT / 2 + 26, used: false },
          { x: MAP_WIDTH / 2 + 80, y: MAP_HEIGHT / 2 + 26, used: false },
          { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 - 56, used: false },
          { x: MAP_WIDTH / 2 - 120, y: MAP_HEIGHT / 2 - 40, used: false },
          { x: MAP_WIDTH / 2 + 120, y: MAP_HEIGHT / 2 - 40, used: false },
          { x: MAP_WIDTH / 2 - 160, y: MAP_HEIGHT / 2 + 60, used: false },
          { x: MAP_WIDTH / 2 + 160, y: MAP_HEIGHT / 2 + 60, used: false },
          { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 + 100, used: false },
          { x: MAP_WIDTH / 2 - 100, y: MAP_HEIGHT / 2 + 120, used: false },
          { x: MAP_WIDTH / 2 + 100, y: MAP_HEIGHT / 2 + 120, used: false },
        ],
        projectiles: [] as any[],
        frame: 0,
      };
    }

    const weatherParticles = Array.from({ length: 55 }, () => ({
      x: rand(0, WIDTH), y: rand(0, HEIGHT), size: rand(1, 3), speedY: rand(0.16, 0.5), drift: rand(-0.12, 0.12)
    }));

    const fogParticles = Array.from({ length: 12 }, () => ({
      x: rand(0, WIDTH), y: rand(0, HEIGHT), size: rand(140, 260), speedX: rand(0.08, 0.2), opacity: rand(0.02, 0.06)
    }));

    function addEffect(x: number, y: number, text: string, color: string, isCrit = false) {
      state.effects.push({ x, y, text, color, life: 1, vy: -0.45, isCrit });
    }

    function addParticles(x: number, y: number, color: string, count = 5) {
      // Limit total particles for mobile performance
      if (state.particles.length > 120) return;
      
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

    let lastUIUpdate = {
      health: -1,
      wood: -1,
      stone: -1,
      fiber: -1,
      gold: -1,
      day: -1,
      timeOfDay: -1,
      wave: -1,
      isWaveActive: false,
      waveTimer: -1
    };

    function updateUI() {
      const p = state.player;
      const isNight = state.timeOfDay > 0.25 && state.timeOfDay < 0.75;
      const timerSec = Math.ceil(state.waveTimer / 60);

      // Only update DOM if values changed
      if (Math.round(p.health) !== lastUIUpdate.health) {
        if (ui.healthText) ui.healthText.textContent = `${Math.round(p.health)} / ${p.maxHealth}`;
        if (ui.healthFill) ui.healthFill.style.width = (p.health / p.maxHealth * 100) + '%';
        lastUIUpdate.health = Math.round(p.health);
      }
      
      if (p.wood !== lastUIUpdate.wood) {
        if (ui.woodCount) ui.woodCount.textContent = String(p.wood);
        lastUIUpdate.wood = p.wood;
      }
      if (p.stone !== lastUIUpdate.stone) {
        if (ui.stoneCount) ui.stoneCount.textContent = String(p.stone);
        lastUIUpdate.stone = p.stone;
      }
      if (p.fiber !== lastUIUpdate.fiber) {
        if (ui.fiberCount) ui.fiberCount.textContent = String(p.fiber);
        lastUIUpdate.fiber = p.fiber;
      }
      if (p.gold !== lastUIUpdate.gold) {
        if (ui.goldCount) ui.goldCount.textContent = String(p.gold);
        lastUIUpdate.gold = p.gold;
      }

      if (state.day !== lastUIUpdate.day || 
          isNight !== (lastUIUpdate.timeOfDay > 0.25 && lastUIUpdate.timeOfDay < 0.75) ||
          state.wave !== lastUIUpdate.wave ||
          state.isWaveActive !== lastUIUpdate.isWaveActive ||
          timerSec !== lastUIUpdate.waveTimer) {
        
        const levelData = CAMPFIRE_LEVELS.find(l => l.level === state.campfire.level);
        const levelName = levelData ? levelData.name : `Nível ${state.campfire.level}`;
        const isBossWave = state.wave % 5 === 0;
        const waveStatus = state.isWaveActive 
          ? (isBossWave ? `👑 CHEFE: Onda ${state.wave}` : `Onda ${state.wave}`) 
          : 'Preparação';
        
        if (ui.dayBadge) {
          ui.dayBadge.textContent = `${levelName} — Dia ${state.day} (${isNight ? 'Noite' : 'Dia'}) | ${waveStatus} (${timerSec}s)`;
        }
        
        lastUIUpdate.day = state.day;
        lastUIUpdate.timeOfDay = state.timeOfDay;
        lastUIUpdate.wave = state.wave;
        lastUIUpdate.isWaveActive = state.isWaveActive;
        lastUIUpdate.waveTimer = timerSec;
      }
      
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
      
      const upBtn = ui.upgradeBtn as HTMLElement;
      if (upBtn) {
        if (target.type === 'campfire') {
          const nextLevelData = CAMPFIRE_LEVELS.find(l => l.level === target.ref.level + 1);
          if (nextLevelData) {
            const cost = nextLevelData.cost;
            let costStr = '';
            if (cost.wood > 0) costStr += `${cost.wood}W `;
            if (cost.stone > 0) costStr += `${cost.stone}S `;
            if (cost.gold > 0) costStr += `${cost.gold}G `;
            upBtn.textContent = `Evoluir Base (${costStr})`;
            upBtn.style.display = 'flex';
          } else {
            upBtn.style.display = 'none';
          }
        } else {
          upBtn.style.display = 'none';
        }
      }

      if (ui.upgradePanel) {
        ui.upgradePanel.style.display = 'block';
        // Force reflow
        ui.upgradePanel.offsetHeight;
        ui.upgradePanel.classList.add('active');
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

    // Hotbar logic handled via React onClick
    const hotbarItems = document.querySelectorAll('.hotbar-item');
    
    // Add listeners
    ui.closePanelBtn?.addEventListener('touchstart', handleClosePanel);
    ui.closePanelBtn?.addEventListener('click', handleClosePanel);
    ui.upgradeBtn?.addEventListener('touchstart', handleUpgrade);
    ui.upgradeBtn?.addEventListener('click', handleUpgrade);
    ui.repairBtn?.addEventListener('touchstart', handleRepair);
    ui.repairBtn?.addEventListener('click', handleRepair);

    // Reward Choice Listeners
    const handleRewardAtk = (e: any) => { if (e.type === 'touchstart') e.preventDefault(); handleReward('atk'); };
    const handleRewardDef = (e: any) => { if (e.type === 'touchstart') e.preventDefault(); handleReward('def'); };
    const handleRewardEco = (e: any) => { if (e.type === 'touchstart') e.preventDefault(); handleReward('eco'); };

    ui.rewardAtk?.addEventListener('click', handleRewardAtk);
    ui.rewardAtk?.addEventListener('touchstart', handleRewardAtk);
    ui.rewardDef?.addEventListener('click', handleRewardDef);
    ui.rewardDef?.addEventListener('touchstart', handleRewardDef);
    ui.rewardEco?.addEventListener('click', handleRewardEco);
    ui.rewardEco?.addEventListener('touchstart', handleRewardEco);

    document.getElementById('startBtn')?.addEventListener('touchstart', handleStart);
    document.getElementById('startBtn')?.addEventListener('click', handleStart);
    document.getElementById('restartBtn')?.addEventListener('click', handleRestart);
    document.getElementById('toggleMobileMode')?.addEventListener('click', handleToggleMobile);
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('pointerdown', handleCanvasPointerDown);
    canvas.addEventListener('click', handleCanvasClick);

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
      if (Math.hypot(x - state.campfire.x, y - state.campfire.y) < 30) return { type: 'campfire', label: 'Fogueira', ref: state.campfire };
      for (const tower of state.constructions.towers) {
        if (Math.hypot(x - tower.x, y - tower.y) < 26) return { type: 'tower', label: 'Torre', ref: tower };
      }
      for (const wolf of state.constructions.wolves) {
        if (Math.hypot(x - wolf.x, y - wolf.y) < 20) return { type: 'wolf', label: 'Lobo', ref: wolf };
      }
      for (const falcon of state.constructions.falcons) {
        if (Math.hypot(x - falcon.x, y - falcon.y) < 18) return { type: 'falcon', label: 'Falcão', ref: falcon };
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
      
      if (target.type === 'campfire') {
        const nextLevelData = CAMPFIRE_LEVELS.find(l => l.level === level + 1);
        if (!nextLevelData) return showMessage('Nível máximo da fogueira atingido!');
        
        const cost = nextLevelData.cost;
        if (!canPay(p, cost)) {
          let costMsg = 'Faltam recursos: ';
          if (cost.wood > p.wood) costMsg += `${cost.wood - p.wood} Madeira `;
          if (cost.stone > p.stone) costMsg += `${cost.stone - p.stone} Pedra `;
          if (cost.gold > p.gold) costMsg += `${cost.gold - p.gold} Ouro `;
          return showMessage(costMsg);
        }
        
        pay(p, cost);
        target.ref.level = level + 1;
        target.ref.maxHp += 250;
        target.ref.hp = target.ref.maxHp;
        state.cameraShake = 15;
        
        syncBaseDefenses(state);
        
        // Feedback Visual Épico
        addPulse(target.ref.x, target.ref.y, '#ff9800');
        addPulse(target.ref.x, target.ref.y, '#ffffff');
        addParticles(target.ref.x, target.ref.y, '#ffd700', 30);
        addEffect(target.ref.x, target.ref.y - 60, `EVOLUÇÃO: ${nextLevelData.name.toUpperCase()}!`, '#ffd700');
        showMessage(`Base evoluída para: ${nextLevelData.name}!`);
        
        // Flash de tela
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.restore();
        
        updateUI();
        return;
      }
    }

    function repairConstruction(target: any) {
      const p = state.player;
      const missing = target.ref.maxHp - target.ref.hp;
      if (missing <= 0) return showMessage('Já está inteira!');
      
      const cost = { wood: 10, stone: 5 };
      if (!canPay(p, cost)) return showMessage(`Reparar: 10 madeira, 5 pedra`);
      
      pay(p, cost);
      state.cameraShake = 4;
      target.ref.hp = Math.min(target.ref.maxHp, target.ref.hp + 100);
      addEffect(target.ref.x || ((target.ref.x1 + target.ref.x2) / 2), (target.ref.y || ((target.ref.y1 + target.ref.y2) / 2)) - 16, '+100 HP!', '#89c36a');
    }

    function buyConstruction(type: string) {
      // Redireciona para o upgrade da fogueira se for o botão de evoluir base
      if (type === 'campfire') {
        upgradeConstruction({ type: 'campfire', ref: state.campfire, label: 'Fogueira' });
        return;
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

      state.player.x = clamp(state.player.x, 22, MAP_WIDTH - 22);
      state.player.y = clamp(state.player.y, 22, MAP_HEIGHT - 22);

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
      const playerX = state.player.x;
      const playerY = state.player.y;
      const collectRadiusSq = AUTO_COLLECT_RADIUS * AUTO_COLLECT_RADIUS;
      
      state.resources = state.resources.filter(res => {
        if (res.respawning) return true;
        
        const dxP = playerX - res.x;
        const dyP = playerY - res.y;
        const distSqP = dxP * dxP + dyP * dyP;
        
        let collectedBy = null;
        if (distSqP <= collectRadiusSq) {
          collectedBy = state.player;
        } else {
          for (const h of state.constructions.helpers) {
            const dxH = h.x - res.x;
            const dyH = h.y - res.y;
            if (dxH * dxH + dyH * dyH <= 625) { // 25^2
              collectedBy = h;
              break;
            }
          }
          if (!collectedBy) {
            for (const w of state.constructions.wolves) {
              const dxW = w.x - res.x;
              const dyW = w.y - res.y;
              if (dxW * dxW + dyW * dyW <= 1225) { // 35^2
                collectedBy = w;
                break;
              }
            }
          }
          if (!collectedBy) {
            for (const f of state.constructions.falcons) {
              const dxF = f.x - res.x;
              const dyF = f.y - res.y;
              if (dxF * dxF + dyF * dyF <= 1600) { // 40^2
                collectedBy = f;
                break;
              }
            }
          }
        }

        if (collectedBy) {
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
          const amount = Math.round(3 * (state.player.resourceMult || 1.0));
          if (type === 'wood') state.player.wood += amount;
          else if (type === 'stone') state.player.stone += amount;
          else if (type === 'fiber') state.player.fiber += amount;
          else if (type === 'gold') state.player.gold += amount;
          
          addEffect(res.x, res.y - 16, `+${amount} ${type === 'wood' ? 'madeira' : type === 'stone' ? 'pedra' : type === 'fiber' ? 'fibra' : 'ouro'}`, '#e4d0a4');
          res.x = -9999;
          res.y = -9999;
          setTimeout(() => {
            res.type = nextResourceType();
            const pos = getPos(60, MAP_WIDTH - 60, 60, MAP_HEIGHT - 60);
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

            // Boss damage feedback
            if (enemy.type === 'boss') {
              addParticles(enemy.x, enemy.y, '#ffd700', 12);
              triggerShake(isCrit ? 12 : 6);
            }
            
            // Knockback
            const kx = enemy.x - state.player.x;
            const ky = enemy.y - state.player.y;
            const kd = Math.hypot(kx, ky) || 1;
            enemy.vx = (kx / kd) * 9;
            enemy.vy = (ky / kd) * 9;
            
            triggerShake(isCrit ? 8 : 4);
            addEffect(enemy.x, enemy.y, isCrit ? 'CRÍTICO!' : `-${dmg}`, isCrit ? '#ffff00' : '#ffffff');
            addParticles(enemy.x, enemy.y, '#ff0000', 8);
            
            if (enemy.hp <= 0) {
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

    // Helper to check if a position is clear of major obstacles
    function isSpawnPositionValid(x: number, y: number) {
      // Check trees (main obstacles) with a slightly larger buffer for better pathing
      for (const t of state.trees) {
        const dx = x - t.x;
        const dy = y - t.y;
        if (dx * dx + dy * dy < 1600) return false; // 40^2 (increased from 35)
      }
      // Check rocks
      for (const r of state.rocks) {
        const dx = x - r.x;
        const dy = y - r.y;
        if (dx * dx + dy * dy < 1225) return false; // 35^2 (increased from 30)
      }
      
      // Ensure it's not too close to constructions
      for (const t of state.constructions.towers) {
        const dx = x - t.x;
        const dy = y - t.y;
        if (dx * dx + dy * dy < 2500) return false; // 50^2
      }

      return true;
    }

    function spawnEnemy() {
      if (!state.isWaveActive) return; // Only spawn during wave combat phase
      state.spawnTimer = Math.max(0, state.spawnTimer - 1);
      if (state.spawnTimer > 0) return;

      const wave = state.wave;
      const isBossWave = wave % 5 === 0;
      const isNight = state.timeOfDay > 0.25 && state.timeOfDay < 0.75;
      
      // Difficulty scaling based on wave
      let spawnCount = 1 + Math.floor(wave / 3);
      let spawnInterval = Math.max(60, 300 - (wave * 15)); 
      
      // 1. Progressive Pressure & Variable Rhythm (Balanced)
      // Calculate wave progress (0 to 1)
      const totalWaveTime = wave % 5 === 0 ? 5400 : 3600; 
      const waveProgress = Math.min(1, (totalWaveTime - state.waveTimer) / totalWaveTime);
      
      // Rhythm: Balanced factors
      const rhythmFactor = (wave % 4 === 0) ? 1.3 : 1.0; 
      const speedFactor = (wave % 3 === 0) ? 0.8 : 1.0; 
      
      // Capped intensity scaling to avoid explosion
      const intensityScale = 1 + waveProgress * 0.4; 
      spawnInterval = Math.max(40, (spawnInterval * speedFactor) / intensityScale);
      spawnCount = Math.floor(spawnCount * rhythmFactor * intensityScale);

      let possibleTypes = ['normal'];
      const nightMult = isNight ? 1.4 : 1.0; // Reduced from 1.5

      // Unlock new enemy types based on wave
      if (wave >= 15) {
        possibleTypes = ['normal', 'green', 'fast', 'armored', 'skeleton', 'archer', 'shaman'];
      } else if (wave >= 10) {
        possibleTypes = ['normal', 'green', 'fast', 'armored', 'skeleton', 'archer'];
      } else if (wave >= 6) {
        possibleTypes = ['normal', 'green', 'fast', 'skeleton'];
      } else if (wave >= 3) {
        possibleTypes = ['normal', 'green', 'skeleton'];
      }
      
      if (isNight && !possibleTypes.includes('skeleton')) {
        possibleTypes.push('skeleton');
      }

      // Adjust spawn count for night
      spawnCount = Math.floor(spawnCount * nightMult);
      state.spawnTimer = spawnInterval;

      // Special Boss Spawn Logic (Milestones every 5 waves)
      const hasBoss = state.enemies.some((e: any) => e.type === 'boss');
      if (isBossWave) {
        // Randomized spawn window based on wave seed
        const spawnThreshold = 0.1 + ((wave * 7) % 15) / 100; 
        
        if (!hasBoss && waveProgress > spawnThreshold && waveProgress < spawnThreshold + 0.1) {
          spawnBoss(wave);
        }
        // Reduce normal enemy count during boss waves to focus on the boss
        spawnCount = Math.floor(spawnCount * 0.4);
      }
      
      // Determine primary attack direction for this wave (0: Top, 1: Right, 2: Bottom, 3: Left)
      const primarySide = wave % 4;
      const isPincerWave = wave >= 8 && wave % 3 === 0;
      const secondarySide = (primarySide + 2) % 4; // Opposite side
      
      // Grouping logic: spawn in small clusters (squads)
      const squadSize = Math.max(1, Math.min(4, Math.floor(spawnCount / 2) + 1));
      const numSquads = Math.ceil(spawnCount / squadSize);

      // 2. In-wave Events (Balanced with Cooldown)
      if (eventCooldown > 0) eventCooldown--;
      
      let eventType = 'none';
      // Trigger event only if cooldown is off and wave is high enough
      if (eventCooldown <= 0 && wave >= 2 && state.frame % 60 === 0) {
        if (Math.random() < 0.12) { // 12% chance every second
          const rEvent = Math.random();
          if (rEvent < 0.4) eventType = 'rush';
          else if (rEvent < 0.7) eventType = 'elite';
          else eventType = 'ambush';
          
          eventCooldown = 1200; // 20 seconds cooldown between events
          
          // Improved visual feedback
          const eventMsgs: Record<string, string> = {
            'rush': 'EVENTO: CORRIDA DE VELOCIDADE!',
            'elite': 'EVENTO: INIMIGO DE ELITE!',
            'ambush': 'EVENTO: EMBOSCADA LATERAL!'
          };
          showQuestMessage(eventMsgs[eventType], 3500);
          triggerShake(6);
        }
      }

      // Count special behaviors to enforce limits
      let currentHunters = 0;
      let currentInfiltrators = 0;
      for (const e of state.enemies) {
        if (e.behavior === 1) currentHunters++;
        if (e.behavior === 2) currentInfiltrators++;
      }

      for (let s = 0; s < numSquads; s++) {
        if (state.enemies.length >= 100) break; // Performance safety cap

        // Pick a side for this squad
        let side = primarySide;
        if (eventType === 'ambush') {
          side = Math.floor(Math.random() * 4); // Random side for ambush
          spawnCount += 2; // Extra enemies for ambush
        } else if (isPincerWave) {
          side = Math.random() < 0.5 ? primarySide : secondarySide;
        } else {
          // 80% chance for primary side, 20% random for variety
          side = Math.random() < 0.8 ? primarySide : Math.floor(Math.random() * 4);
        }
        
        // Base position for the squad (outside the map)
        let baseX = 0, baseY = 0;
        if (side === 0) { baseX = rand(100, MAP_WIDTH - 100); baseY = -60; }
        if (side === 1) { baseX = MAP_WIDTH + 60; baseY = rand(100, MAP_HEIGHT - 100); }
        if (side === 2) { baseX = rand(100, MAP_WIDTH - 100); baseY = MAP_HEIGHT + 60; }
        if (side === 3) { baseX = -60; baseY = rand(100, MAP_HEIGHT - 100); }

        const currentSquadSize = eventType === 'rush' ? squadSize + 2 : squadSize;

        for (let i = 0; i < currentSquadSize; i++) {
          let x = baseX + rand(-50, 50);
          let y = baseY + rand(-50, 50);
          
          // Validation: Try to find a clear spot
          let attempts = 0;
          while (!isSpawnPositionValid(x, y) && attempts < 8) {
            x = baseX + rand(-80, 80);
            y = baseY + rand(-80, 80);
            attempts++;
          }

          const r = Math.random();
          let type = 'normal';
          
          // Force boss if it's a boss wave and none exists
          if (isBossWave && !hasBoss && s === 0 && i === 0) {
            type = 'boss';
          } else if (eventType === 'elite' && s === 0 && i === 0) {
            type = 'armored'; // Elite is an armored enemy
          } else if (eventType === 'rush') {
            type = 'fast'; // Rush event spawns fast enemies
          } else {
            // Normal random type selection
            if (possibleTypes.includes('shaman') && r < 0.08) type = 'shaman';
            else if (possibleTypes.includes('archer') && r < 0.15) type = 'archer';
            else if (possibleTypes.includes('armored') && r < 0.25) type = 'armored';
            else if (possibleTypes.includes('skeleton') && r < 0.35) type = 'skeleton';
            else if (possibleTypes.includes('fast') && r < 0.45) type = 'fast';
            else if (possibleTypes.includes('green') && r < 0.65) type = 'green';
          }

          const cfLevel = state.campfire.level || 1;
          // Scaling HP and Damage with wave
          // Adjusted to follow player power slightly
          const playerPowerFactor = ((state.player.damageMult || 1.0) - 1.0) * 0.4;
          let hpMult = 1 + (wave - 1) * 0.12 + (cfLevel - 1) * 0.08 + playerPowerFactor;
          let dmgMult = 1 + (wave - 1) * 0.08 + (cfLevel - 1) * 0.04;
          let speedMult = 1.0;

          // Event modifiers
          if (eventType === 'elite' && type === 'armored') {
            hpMult *= 2;
            dmgMult *= 1.5;
          }

          // 1. Progressive Pressure: Speed up as wave ends
          speedMult *= (1 + waveProgress * 0.3);

          let baseHp = (50 + wave * 5) * hpMult;
          let speed = (0.4 + wave * 0.01 + (cfLevel * 0.01)) * speedMult;
          let damage = 0.15 * dmgMult;
          let size = 1;
          let color = '#8b5046'; 
          let focusFences = false;

          // 3. Behavioral Variation (Balanced Limits)
          let behavior = 0; 
          const rBeh = Math.random();
          // Hunters: Max 4, Infiltrators: Max 2
          if (rBeh < 0.15 && currentHunters < 4) { 
            behavior = 1; 
            currentHunters++;
          } else if (rBeh < 0.25 && currentInfiltrators < 2) { 
            behavior = 2; 
            currentInfiltrators++;
          }

          if (type === 'boss') {
            baseHp *= (8 + wave * 0.5); 
            speed *= 0.5;
            damage *= 5;
            size = 3.0;
            color = '#ffd700'; 
            focusFences = true;
          } else if (type === 'armored') {
            baseHp *= 3;
            speed *= 0.6;
            damage *= 2;
            size = 1.6;
            color = '#b35d44'; 
            focusFences = true;
          } else if (type === 'fast') {
            baseHp *= 0.7;
            speed *= 1.8;
            damage *= 0.8;
            size = 0.8;
            color = '#8a2be2'; 
          } else if (type === 'green') {
            baseHp *= 1.4;
            speed *= 0.9;
            damage *= 1.1;
            size = 1.1;
            color = '#2e8b57'; 
          } else if (type === 'skeleton') {
            baseHp *= 1.1;
            speed *= 1.1;
            damage *= 1.3;
            size = 1.2;
            color = '#e0e0e0'; 
          } else if (type === 'archer') {
            baseHp *= 0.8;
            speed *= 0.8;
            damage *= 1.0;
            size = 1.0;
            color = '#ff8c00'; 
          } else if (type === 'shaman') {
            baseHp *= 1.4;
            speed *= 0.7;
            damage *= 0.6;
            size = 1.1;
            color = '#9932cc'; 
          }

          state.enemies.push({
            x, y,
            vx: 0, vy: 0,
            hp: baseHp, maxHp: baseHp,
            speed, damage,
            cooldown: 0, hitFlash: 0,
            type, size, color, focusFences,
            behavior,
            strategyOffset: { x: rand(-40, 40), y: rand(-40, 40) },
            stuckTimer: 0
          });
        }
      }
    }

    function segmentCenter(seg: any) { return { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 }; }

    function updateEnemies() {
      const enemies = state.enemies;
      const numEnemies = enemies.length;
      
      for (let i = 0; i < numEnemies; i++) {
        const enemy = enemies[i];
        if (enemy.hitFlash > 0) enemy.hitFlash--;
        enemy.cooldown = Math.max(0, enemy.cooldown - 1);
        enemy.slowTimer = Math.max(0, (enemy.slowTimer || 0) - 1);
        
        let currentSpeed = enemy.slowTimer > 0 ? enemy.speed * 0.4 : enemy.speed;

        // Boss Logic (Telegraph, Phases, Behavior)
        let moveSpeed = currentSpeed;
        if (enemy.type === 'boss') {
          // 1. Phases (Enraged below 50% HP)
          const isEnraged = enemy.hp < enemy.maxHp * 0.5;
          const attackCooldown = isEnraged ? 150 : 240; 
          const speedMult = isEnraged ? 1.3 : 1.0;
          
          // 2. Behavior Switching
          if (enemy.phaseTimer === undefined) enemy.phaseTimer = 0;
          enemy.phaseTimer--;
          if (enemy.phaseTimer <= 0) {
            enemy.phaseTimer = 180 + Math.random() * 120; 
            const r = Math.random();
            if (r < 0.5) enemy.behavior = 1; // Focus Player
            else if (r < 0.8) enemy.behavior = 0; // Focus Campfire
            else enemy.behavior = 3; // Aggressive Dash
          }
          
          moveSpeed = enemy.behavior === 3 ? currentSpeed * 2.2 * speedMult : currentSpeed * speedMult;

          // 3. Telegraph for Stomp
          if (enemy.cooldown <= 0) {
            const dxP = enemy.x - state.player.x;
            const dyP = enemy.y - state.player.y;
            const distToPlayerSq = dxP * dxP + dyP * dyP;
            
            if (distToPlayerSq < 14400) { // 120px
              if (enemy.prepStomp === undefined) enemy.prepStomp = 0;
              enemy.prepStomp++;
              
              // Stop moving while prepping
              moveSpeed = 0;

              if (enemy.prepStomp >= 45) { // 0.75s telegraph
                enemy.prepStomp = 0;
                enemy.cooldown = attackCooldown;
                triggerShake(15);
                addPulse(enemy.x, enemy.y, 'rgba(255, 0, 0, 0.6)');
                
                const ang = Math.atan2(dyP, dxP);
                state.player.x += Math.cos(ang) * 60;
                state.player.y += Math.sin(ang) * 60;
                state.player.health = Math.max(0, state.player.health - 18);
                state.player.hitFlash = 12;
                addEffect(state.player.x, state.player.y - 20, 'PISOTÃO!', '#ff0000', true);
              }
            } else {
              enemy.prepStomp = 0;
            }
          }
          // Apply boss-specific speed to currentSpeed for the rest of the loop
          currentSpeed = moveSpeed;
        }

        // Apply knockback/velocity
        enemy.x += enemy.vx;
        enemy.y += enemy.vy;
        enemy.vx *= 0.85;
        enemy.vy *= 0.85;

        // Separation (enemies push each other away) - Optimized with Spatial Grid
        const nearby = getNearbyEnemies(enemy.x, enemy.y, 20);
        for (let j = 0; j < nearby.length; j++) {
          const other = nearby[j];
          if (enemy === other) continue;
          const dx = enemy.x - other.x;
          const dy = enemy.y - other.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < 324) { // 18^2
            const dist = Math.sqrt(distSq) || 1;
            const ang = Math.atan2(dy, dx);
            const force = (18 - dist) * 0.05;
            const fx = Math.cos(ang) * force;
            const fy = Math.sin(ang) * force;
            enemy.vx += fx;
            enemy.vy += fy;
          }
        }

        // Construction collision
        for (const c of state.constructions.towers) {
          const dx = enemy.x - c.x;
          const dy = enemy.y - c.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < 576) { // 24^2
            const ang = Math.atan2(dy, dx);
            enemy.x = c.x + Math.cos(ang) * 24;
            enemy.y = c.y + Math.sin(ang) * 24;
          }
        }

        let target: any = { x: state.campfire.x, y: state.campfire.y, type: 'campfire' };

        // 3. Behavioral Variation & Safety Fallbacks
        // behavior 1: Focus Player (with fallback if player is dead/too far)
        if (enemy.behavior === 1) {
          const dxP = enemy.x - state.player.x;
          const dyP = enemy.y - state.player.y;
          const distSq = dxP * dxP + dyP * dyP;
          
          if (state.player.health > 0 && distSq < 250000) { // Within 500px
            target = { x: state.player.x, y: state.player.y, type: 'player' };
          } else {
            target = { x: state.campfire.x, y: state.campfire.y, type: 'campfire' };
          }
        } else if (enemy.behavior === 2) {
          // behavior 2: Infiltrator (Focus campfire, ignore fences unless blocked)
          target = { x: state.campfire.x, y: state.campfire.y, type: 'campfire' };
        } else if (state.constructions.fenceBuilt && state.constructions.fenceSegments.length) {
          let bestSeg = null;
          let bestDistSq = Infinity;
          
          if (enemy.focusFences) {
            for (const seg of state.constructions.fenceSegments) {
              const c = segmentCenter(seg);
              const dx = enemy.x - c.x;
              const dy = enemy.y - c.y;
              const dSq = dx * dx + dy * dy;
              if (dSq < bestDistSq) { bestDistSq = dSq; bestSeg = seg; }
            }
          } else {
            const gate = state.constructions.fenceSegments.find(s => s.kind === 'gate');
            if (gate) {
              const gc = segmentCenter(gate);
              const dx = enemy.x - gc.x;
              const dy = enemy.y - gc.y;
              const dSq = dx * dx + dy * dy;
              if (dSq < 32400) { // 180^2
                bestSeg = gate;
                bestDistSq = dSq;
              }
            }

            if (!bestSeg) {
              for (const seg of state.constructions.fenceSegments) {
                const c = segmentCenter(seg);
                const dx = enemy.x - c.x;
                const dy = enemy.y - c.y;
                const dSq = dx * dx + dy * dy;
                if (dSq < bestDistSq) { bestDistSq = dSq; bestSeg = seg; }
              }
            }
          }

          if (bestSeg) {
            const c = segmentCenter(bestSeg);
            target = { x: c.x, y: c.y, type: 'segment', ref: bestSeg };
          }
        }

        const tx = target.x + (enemy.strategyOffset?.x || 0);
        const ty = target.y + (enemy.strategyOffset?.y || 0);
        
        const dx = tx - enemy.x;
        const dy = ty - enemy.y;
        const dSq = dx * dx + dy * dy;
        const d = Math.sqrt(dSq) || 1;
        
        if (enemy.vx * enemy.vx + enemy.vy * enemy.vy < 0.25) {
          const prevX = enemy.x;
          const prevY = enemy.y;

          if (enemy.type === 'archer') {
            const dxP = enemy.x - state.player.x;
            const dyP = enemy.y - state.player.y;
            const distToPlayerSq = dxP * dxP + dyP * dyP;
            
            if (distToPlayerSq > 32400) { // 180^2
              enemy.x += (dx / d) * currentSpeed;
              enemy.y += (dy / d) * currentSpeed;
            } else if (distToPlayerSq < 14400) { // 120^2
              enemy.x -= (dx / d) * currentSpeed;
              enemy.y -= (dy / d) * currentSpeed;
            }

            if (enemy.cooldown <= 0 && distToPlayerSq < 62500) { // 250^2
              enemy.cooldown = 120;
              const ang = Math.atan2(-dyP, -dxP);
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
            enemy.x += (dx / d) * currentSpeed;
            enemy.y += (dy / d) * currentSpeed;

            const dxP = enemy.x - state.player.x;
            const dyP = enemy.y - state.player.y;
            const distToPlayerSq = dxP * dxP + dyP * dyP;
            if (distToPlayerSq < 6400 && enemy.cooldown <= 0) { // 80^2
              enemy.cooldown = 180;
              state.player.slowed = 120;
              addEffect(state.player.x, state.player.y - 20, 'LENTO!', '#9932cc');
              triggerShake(2);
            }
          } else {
            if (dSq > 196) { // 14^2
              enemy.x += (dx / d) * currentSpeed;
              enemy.y += (dy / d) * currentSpeed;
            } else if (enemy.cooldown <= 0) {
              enemy.cooldown = 48;
              if (target.type === 'segment' && target.ref) {
                target.ref.hp -= 8;
                target.ref.hitFlash = 5;
                triggerShake(2);
                addEffect(target.ref.x1 || target.ref.x, target.ref.y1 || target.ref.y, '-8', '#ff5252');
              } else {
                state.player.health = clamp(state.player.health - enemy.damage * 8, 0, 100);
                state.player.hitFlash = 5;
                triggerShake(4);
              }
            }
          }

          const dxMoved = enemy.x - prevX;
          const dyMoved = enemy.y - prevY;
          if (dxMoved * dxMoved + dyMoved * dyMoved < 0.01) {
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
          
          // Boss Reward
          if (e.type === 'boss') {
            const goldBonus = 50 + state.wave * 10;
            const woodBonus = 20 + state.wave * 5;
            const stoneBonus = 10 + state.wave * 3;
            
            state.player.gold += goldBonus;
            state.player.wood += woodBonus;
            state.player.stone += stoneBonus;
            
            showQuestMessage(`CHEFE DERROTADO! +${goldBonus} ouro, +${woodBonus} madeira, +${stoneBonus} pedra`, 5000);
            triggerShake(20);
            
            // Extra explosion particles for boss
            for (let i = 0; i < 20; i++) {
              state.particles.push({
                x: e.x, y: e.y,
                vx: (Math.random() - 0.5) * 6,
                vy: (Math.random() - 0.5) * 6,
                life: 1.5,
                size: rand(5, 12),
                color: '#ffd700'
              });
            }
          }
          
          // Loot drop (18% chance for normal enemies, 100% for boss)
          if (Math.random() < 0.18 || e.type === 'boss') {
            const r = Math.random();
            let lootType = 'herb';
            let lootName = 'Erva Medicinal';
            
            // Boss always drops something good
            if (e.type === 'boss') {
              const bossR = Math.random();
              if (bossR < 0.33) { lootType = 'sword'; lootName = 'Espada Lendária'; }
              else if (bossR < 0.66) { lootType = 'ring'; lootName = 'Anel de Poder'; }
              else { lootType = 'boot'; lootName = 'Botas de Hermes'; }
            } else {
              if (r < 0.05) { lootType = 'chalice'; lootName = 'Cálice de Vida'; }
              else if (r < 0.15) { lootType = 'sword'; lootName = 'Espada de Bronze'; }
              else if (r < 0.30) { lootType = 'ring'; lootName = 'Anel de Velocidade'; }
              else if (r < 0.45) { lootType = 'boot'; lootName = 'Bota de Mercúrio'; }
              else if (r < 0.65) { lootType = 'gem'; lootName = 'Gema de Liderança'; }
            }
            
            state.drops.push({
              x: e.x, y: e.y,
              type: lootType,
              name: lootName,
              life: 1200 // 20s for boss loot or rare loot
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
        
        return e.x > -100 && e.x < MAP_WIDTH + 100 && e.y > -100 && e.y < MAP_HEIGHT + 100;
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

    function collectDrop(drop: any, collector: any) {
      if (drop.type === 'gold') state.player.gold += (drop.amount || 1);
      else if (drop.type === 'wood') state.player.wood += (drop.amount || 3);
      else if (drop.type === 'stone') state.player.stone += (drop.amount || 3);
      else if (drop.type === 'fiber') state.player.fiber += (drop.amount || 3);
      else if (drop.type === 'herb') {
        const heal = state.player.maxHealth * 0.25;
        state.player.health = Math.min(state.player.maxHealth, state.player.health + heal);
        addEffect(state.player.x, state.player.y - 40, `+${Math.round(heal)} HP`, '#32cd32');
      } else if (drop.type === 'chalice') {
        state.player.maxHealth += 25;
        state.player.health = state.player.maxHealth;
        addEffect(state.player.x, state.player.y - 40, '+25 HP Máximo!', '#00bcd4');
      } else if (drop.type === 'gem') {
        state.constructions.helpers.forEach((h: any) => {
          h.maxHp += 20;
          h.hp += 20;
          h.damage += 4;
          addEffect(h.x, h.y - 20, 'Soldado Buff!', '#9c27b0');
        });
        addEffect(state.player.x, state.player.y - 40, 'Exército Fortalecido!', '#9c27b0');
      } else if (drop.type === 'sword') {
        state.player.damage += 5;
        addEffect(state.player.x, state.player.y - 40, '+5 Dano!', '#ff9800');
      } else if (drop.type === 'ring') {
        state.player.speed += 0.2;
        addEffect(state.player.x, state.player.y - 40, '+Velocidade!', '#2196f3');
      } else if (drop.type === 'boot') {
        state.player.speed += 0.3;
        addEffect(state.player.x, state.player.y - 40, 'Super Velocidade!', '#4caf50');
      }
      addPulse(collector.x, collector.y, '#ffd700');
    }

    function updateDefenders() {
      // Wolves
      for (const wolf of state.constructions.wolves) {
        wolf.cooldown = Math.max(0, wolf.cooldown - 1);
        wolf.howlTimer = Math.max(0, (wolf.howlTimer || 0) - 1);
        
        // Wolves - Optimized with Spatial Grid
        let target = null;
        let bestDistSq = 160000; // 400^2
        const nearbyEnemies = getNearbyEnemies(wolf.x, wolf.y, 400);
        for (let j = 0; j < nearbyEnemies.length; j++) {
          const enemy = nearbyEnemies[j];
          const dx = wolf.x - enemy.x;
          const dy = wolf.y - enemy.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDistSq) { bestDistSq = dSq; target = enemy; }
        }

        if (target) {
          const dx = target.x - wolf.x;
          const dy = target.y - wolf.y;
          const ang = Math.atan2(dy, dx);
          const distSq = dx * dx + dy * dy;
          wolf.facing = target.x < wolf.x ? 'left' : 'right';
          wolf.isSitting = false;
          
          if (distSq > 1600) { // 40^2
            const speed = wolf.speed * (wolf.cooldown > 0 ? 0.7 : 1.5); 
            wolf.x += Math.cos(ang) * speed;
            wolf.y += Math.sin(ang) * speed;
            wolf.walkTimer = (wolf.walkTimer || 0) + 1;
            
            if (Math.random() < 0.01 && wolf.howlTimer === 0) {
              addEffect(wolf.x, wolf.y - 20, "AUUUUU!", "#ccc");
              wolf.howlTimer = 300;
            }
          } else if (wolf.cooldown === 0) {
            // Lunge attack
            wolf.x += Math.cos(ang) * 25;
            wolf.y += Math.sin(ang) * 25;
            
            target.hp -= wolf.damage;
            target.hitFlash = 5;
            target.vx += Math.cos(ang) * 15;
            target.vy += Math.sin(ang) * 15;
            wolf.cooldown = 35;
            addPulse(target.x, target.y, '#757575');
            addEffect(target.x, target.y - 10, "MORDIDA!", "#ff1744");
          }
        } else {
          // Collect Resources
          let bestDrop = null;
          let bestDropDistSq = 250000; // 500^2
          for (const drop of state.drops) {
            if (drop.claimedBy && drop.claimedBy !== wolf) continue;
            const dx = wolf.x - drop.x;
            const dy = wolf.y - drop.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < bestDropDistSq) {
              bestDropDistSq = dSq;
              bestDrop = drop;
            }
          }

          if (bestDrop) {
            bestDrop.claimedBy = wolf;
            const dx = bestDrop.x - wolf.x;
            const dy = bestDrop.y - wolf.y;
            const ang = Math.atan2(dy, dx);
            const distSq = dx * dx + dy * dy;
            wolf.facing = bestDrop.x < wolf.x ? 'left' : 'right';
            wolf.isSitting = false;

            if (distSq > 100) {
              wolf.x += Math.cos(ang) * (wolf.speed * 1.3);
              wolf.y += Math.sin(ang) * (wolf.speed * 1.3);
              wolf.walkTimer = (wolf.walkTimer || 0) + 1;
            } else {
              collectDrop(bestDrop, wolf);
              addEffect(wolf.x, wolf.y - 20, "PEGUEI!", "#ffd700");
              bestDrop.life = 0;
            }
          } else {
            // Follow Player
            const dx = state.player.x - wolf.x;
            const dy = state.player.y - wolf.y;
            const distSq = dx * dx + dy * dy;

            if (distSq > 14400) { // 120^2
              const ang = Math.atan2(dy, dx);
              wolf.x += Math.cos(ang) * (wolf.speed * 0.9);
              wolf.y += Math.sin(ang) * (wolf.speed * 0.9);
              wolf.facing = state.player.x < wolf.x ? 'left' : 'right';
              wolf.walkTimer = (wolf.walkTimer || 0) + 1;
              wolf.isSitting = false;
            } else {
              wolf.isSitting = true;
            }
          }
        }
      }

      // Falcons
      for (const falcon of state.constructions.falcons) {
        falcon.cooldown = Math.max(0, falcon.cooldown - 1);
        falcon.flapTimer = (falcon.flapTimer || 0) + 1;
        
        // Falcons - Optimized with Spatial Grid
        let target = null;
        let bestDistSq = 360000; // 600^2 (Very high detection)
        const nearbyEnemies = getNearbyEnemies(falcon.x, falcon.y, 600);
        for (let j = 0; j < nearbyEnemies.length; j++) {
          const enemy = nearbyEnemies[j];
          const dx = falcon.x - enemy.x;
          const dy = falcon.y - enemy.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDistSq) { bestDistSq = dSq; target = enemy; }
        }

        if (target) {
          const dx = target.x - falcon.x;
          const dy = target.y - falcon.y;
          const ang = Math.atan2(dy, dx);
          const distSq = dx * dx + dy * dy;
          falcon.facing = target.x < falcon.x ? 'left' : 'right';
          
          if (distSq > 400) { // 20^2
            falcon.x += Math.cos(ang) * falcon.speed;
            falcon.y += Math.sin(ang) * falcon.speed;
          } else if (falcon.cooldown === 0) {
            // Dive attack
            target.hp -= falcon.damage;
            target.hitFlash = 5;
            falcon.cooldown = 25;
            addEffect(target.x, target.y - 10, "RASANTE!", "#ffeb3b");
          }
        } else {
          // Collect Resources (High priority for falcons)
          let bestDrop = null;
          let bestDropDistSq = 490000; // 700^2
          for (const drop of state.drops) {
            if (drop.claimedBy && drop.claimedBy !== falcon) continue;
            const dx = falcon.x - drop.x;
            const dy = falcon.y - drop.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < bestDropDistSq) {
              bestDropDistSq = dSq;
              bestDrop = drop;
            }
          }

          if (bestDrop) {
            bestDrop.claimedBy = falcon;
            const dx = bestDrop.x - falcon.x;
            const dy = bestDrop.y - falcon.y;
            const ang = Math.atan2(dy, dx);
            const distSq = dx * dx + dy * dy;
            falcon.facing = bestDrop.x < falcon.x ? 'left' : 'right';

            if (distSq > 100) {
              falcon.x += Math.cos(ang) * (falcon.speed * 1.5);
              falcon.y += Math.sin(ang) * (falcon.speed * 1.5);
            } else {
              collectDrop(bestDrop, falcon);
              addEffect(falcon.x, falcon.y - 20, "RESGATE!", "#fff");
              bestDrop.life = 0;
            }
          } else {
            // Circle Player
            const t = performance.now() * 0.002;
            const orbitX = state.player.x + Math.cos(t) * 60;
            const orbitY = state.player.y + Math.sin(t) * 60;
            const dx = orbitX - falcon.x;
            const dy = orbitY - falcon.y;
            const ang = Math.atan2(dy, dx);
            falcon.x += Math.cos(ang) * (falcon.speed * 0.7);
            falcon.y += Math.sin(ang) * (falcon.speed * 0.7);
            falcon.facing = Math.cos(t) > 0 ? 'right' : 'left';
          }
        }
      }

      // Static Towers
      for (const tower of state.constructions.towers) {
        tower.cooldown = Math.max(0, tower.cooldown - 1);
        if (tower.cooldown > 0) continue;
        // Static Towers - Optimized with Spatial Grid
        let target = null;
        let bestDistSq = tower.range * tower.range;
        const nearby = getNearbyEnemies(tower.x, tower.y, tower.range);
        for (let i = 0; i < nearby.length; i++) {
          const enemy = nearby[i];
          const dx = tower.x - enemy.x;
          const dy = tower.y - enemy.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDistSq) { bestDistSq = dSq; target = enemy; }
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
      const claimedTargets = new Set();
      for (const h of state.constructions.helpers) {
        h.cooldown = Math.max(0, h.cooldown - 1);
        h.attackCooldown = Math.max(0, h.attackCooldown - 1);
        h.speechTimer = Math.max(0, h.speechTimer - 1);
        h.speechCooldown = Math.max(0, h.speechCooldown - 1);

        let target = null;
        let newState = 'idle';
        
        // Priority 1: Defend Base - Optimized with Spatial Grid
        const baseProtectionRadiusSq = 62500; // 250^2
        let nearestEnemyNearBase = null;
        let minDistSqBase = Infinity;
        const nearbyEnemiesBase = getNearbyEnemies(state.campfire.x, state.campfire.y, 250);
        for (let i = 0; i < nearbyEnemiesBase.length; i++) {
          const enemy = nearbyEnemiesBase[i];
          if (claimedTargets.has(enemy)) continue;
          const dxBase = enemy.x - state.campfire.x;
          const dyBase = enemy.y - state.campfire.y;
          const distSqBase = dxBase * dxBase + dyBase * dyBase;
          if (distSqBase < baseProtectionRadiusSq) {
            const dxHelper = enemy.x - h.x;
            const dyHelper = enemy.y - h.y;
            const distSqHelper = dxHelper * dxHelper + dyHelper * dyHelper;
            if (distSqHelper < minDistSqBase) {
              minDistSqBase = distSqHelper;
              nearestEnemyNearBase = enemy;
            }
          }
        }

        if (nearestEnemyNearBase) {
          target = nearestEnemyNearBase;
          newState = 'defending';
          if (h.state !== 'defending' && h.speechCooldown === 0) {
            h.speechText = DIALOGUES.ENEMY_SIGHTED[Math.floor(Math.random() * DIALOGUES.ENEMY_SIGHTED.length)];
            h.speechTimer = 120;
            h.speechCooldown = 300;
          }
        } else {
          // Priority 2: Attack Enemies on Map - Optimized with Spatial Grid
          let nearestEnemy = null;
          let minDistSqEnemy = Infinity;
          const nearbyEnemiesMap = getNearbyEnemies(h.x, h.y, 600); // Vision radius of 600
          for (let i = 0; i < nearbyEnemiesMap.length; i++) {
            const enemy = nearbyEnemiesMap[i];
            if (claimedTargets.has(enemy)) continue;
            const dx = h.x - enemy.x;
            const dy = h.y - enemy.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < minDistSqEnemy) {
              minDistSqEnemy = dSq;
              nearestEnemy = enemy;
            }
          }

          if (nearestEnemy) {
            target = nearestEnemy;
            newState = 'attacking';
            if (h.state !== 'attacking' && h.speechCooldown === 0) {
              h.speechText = DIALOGUES.ATTACKING[Math.floor(Math.random() * DIALOGUES.ATTACKING.length)];
              h.speechTimer = 120;
              h.speechCooldown = 400;
            }
          } else {
            // Priority 3: Collect Resources
            let nearestRes = null;
            let minDistSqRes = Infinity;
            for (const res of state.resources) {
              if (res.respawning || claimedTargets.has(res)) continue;
              const dx = h.x - res.x;
              const dy = h.y - res.y;
              const dSq = dx * dx + dy * dy;
              if (dSq < minDistSqRes) {
                minDistSqRes = dSq;
                nearestRes = res;
              }
            }

            if (nearestRes) {
              target = nearestRes;
              newState = 'collecting';
              if (h.state !== 'collecting' && h.speechCooldown === 0) {
                h.speechText = DIALOGUES.COLLECTING[Math.floor(Math.random() * DIALOGUES.COLLECTING.length)];
                h.speechTimer = 120;
                h.speechCooldown = 500;
              }
            } else {
              // Idle / Return Home
              target = { x: h.homeX, y: h.homeY };
              newState = 'idle';
              if (h.state !== 'idle' && h.speechCooldown === 0) {
                h.speechText = DIALOGUES.IDLE[Math.floor(Math.random() * DIALOGUES.IDLE.length)];
                h.speechTimer = 120;
                h.speechCooldown = 600;
              }
            }
          }
        }

        h.state = newState;
        h.target = target;
        if (target && target.hp !== undefined) claimedTargets.add(target);
        else if (target && target.type !== undefined) claimedTargets.add(target);

        // Movement and Action
        if (target) {
          const dx = target.x - h.x;
          const dy = target.y - h.y;
          const ang = Math.atan2(dy, dx);
          const distSq = dx * dx + dy * dy;
          h.facing = target.x < h.x ? 'left' : 'right';

          let interactionDist = 25;
          let kitingDist = 0;
          if (h.type === 'archer' || h.type === 'sniper') {
            interactionDist = h.range * 0.8;
            kitingDist = h.range * 0.4;
          }
          if (h.type === 'mage' || h.type === 'summoner') {
            interactionDist = h.range * 0.7;
            kitingDist = h.range * 0.3;
          }
          if (h.state === 'idle') interactionDist = 5;

          const interactionDistSq = interactionDist * interactionDist;
          const kitingDistSq = kitingDist * kitingDist;

          if (distSq > interactionDistSq) {
            const speed = h.state === 'idle' ? 1.5 : 2.5;
            h.x += Math.cos(ang) * speed;
            h.y += Math.sin(ang) * speed;
            h.walkTimer = (h.walkTimer || 0) + 1;
          } else if (distSq < kitingDistSq && (h.state === 'attacking' || h.state === 'defending')) {
            // Kiting: Move away from enemy
            const speed = 1.8;
            h.x -= Math.cos(ang) * speed;
            h.y -= Math.sin(ang) * speed;
            h.walkTimer = (h.walkTimer || 0) + 1;
          } else {
            h.walkTimer = 0;
            // Action logic
            if (h.state === 'defending' || h.state === 'attacking') {
              if (h.type === 'warrior') {
                if (h.cooldown === 0) {
                  // Warrior Lunge
                  h.x += Math.cos(ang) * 10;
                  h.y += Math.sin(ang) * 10;
                  
                  target.hp -= h.damage;
                  target.hitFlash = 5;
                  target.vx += Math.cos(ang) * 4;
                  target.vy += Math.sin(ang) * 4;
                  h.cooldown = h.level >= 4 ? 24 : 32;
                  addEffect(target.x, target.y, `-${h.damage}`, '#ff5252');
                  state.particles.push({
                    x: (h.x + target.x) / 2,
                    y: (h.y + target.y) / 2,
                    vx: 0, vy: 0,
                    life: 0.2,
                    size: 20,
                    color: h.level >= 3 ? 'rgba(255, 215, 0, 0.8)' : 'rgba(255, 255, 255, 0.6)',
                    type: 'slash'
                  });
                  if (target.hp <= 0) { state.player.gold += 1; }
                }
              } else if (h.type === 'mage') {
                if (h.cooldown === 0) {
                  h.cooldown = 60;
                  addPulse(h.x, h.y, '#9c27b0');
                  state.particles.push({
                    x: h.x, y: h.y,
                    vx: (target.x - h.x) * 0.05,
                    vy: (target.y - h.y) * 0.05,
                    life: 0.5,
                    size: 15,
                    color: h.level >= 3 ? '#e1bee7' : '#ba68c8',
                    type: 'cloud'
                  });
                  const aoeRange = h.level >= 3 ? 90 : 65;
                  const aoeRangeSq = aoeRange ** 2;
                  const nearbyEnemies = getNearbyEnemies(target.x, target.y, aoeRange);
                  for (let j = 0; j < nearbyEnemies.length; j++) {
                    const e = nearbyEnemies[j];
                    const edx = target.x - e.x;
                    const edy = target.y - e.y;
                    const edSq = edx * edx + edy * edy;
                    if (edSq < aoeRangeSq) {
                      e.hp -= h.damage * 1.5;
                      e.hitFlash = 5;
                      if (h.level >= 4) {
                        e.slowTimer = (e.slowTimer || 0) + 120;
                        addEffect(e.x, e.y - 10, 'CONGELADO!', '#4fc3f7');
                      }
                      addEffect(e.x, e.y, `-${Math.round(h.damage * 1.5)}`, '#ba68c8');
                      if (e.hp <= 0) { state.player.gold += 1; }
                    }
                  }
                  addPulse(target.x, target.y, h.level >= 3 ? '#ba68c8' : '#e1bee7');
                  triggerShake(2);
                }
              } else if (h.type === 'summoner') {
                if (h.cooldown === 0) {
                  h.cooldown = 240;
                  addPulse(h.x, h.y, '#4db6ac');
                  const summonCount = h.level >= 3 ? 2 : 1;
                  for (let sIdx = 0; sIdx < summonCount; sIdx++) {
                    state.summons.push({
                      x: h.x + rand(-20, 20),
                      y: h.y + rand(-20, 20),
                      hp: 50 + h.level * 10,
                      maxHp: 50 + h.level * 10,
                      damage: 5 + h.level * 2,
                      life: 600,
                      type: h.level >= 4 ? 'golem' : 'spirit',
                      cooldown: 0
                    });
                  }
                }
              } else {
                // Archer / Sniper
                if (h.cooldown === 0) {
                  const isSniper = h.type === 'sniper';
                  let finalDamage = h.damage;
                  if (isSniper && h.level >= 4) finalDamage *= 2;
                  const isCrit = !isSniper && h.level >= 4 && Math.random() < 0.15;
                  if (isCrit) finalDamage *= 2;
                  target.hp -= finalDamage;
                  target.hitFlash = 5;
                  h.cooldown = isSniper ? 110 : 28;
                  if (!isSniper && h.level >= 3 && Math.random() < 0.2) h.cooldown = 5;
                  addEffect(target.x, target.y, `-${Math.round(finalDamage)}`, isCrit ? '#ffd700' : '#ff5252');
                  addPulse(target.x, target.y, isSniper ? '#ff4444' : '#f1d28c');
                  if (target.hp <= 0) { state.player.gold += 1; }
                }
              }
            } else if (h.state === 'collecting') {
              // Actual collection is handled by autoCollectResources
              // We just need to check if it was collected to return to idle
              if (target.respawning) {
                h.state = 'idle';
                if (h.speechCooldown === 0) {
                  h.speechText = DIALOGUES.RETURNING[Math.floor(Math.random() * DIALOGUES.RETURNING.length)];
                  h.speechTimer = 120;
                  h.speechCooldown = 400;
                }
              }
            }
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
        let bestDistSq = 10000; // 100^2
        for (const e of state.enemies) {
          const dx = state.player.x - e.x;
          const dy = state.player.y - e.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
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

        // Player Attack - Optimized with Spatial Grid
        const nearby = getNearbyEnemies(state.player.x, state.player.y, hitRange);
        for (let i = 0; i < nearby.length; i++) {
          const e = nearby[i];
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

              // Boss damage feedback
              if (e.type === 'boss') {
                addParticles(e.x, e.y, '#ffd700', 12);
                triggerShake(isCrit ? 12 : 6);
              }

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

      // Update spatial grid at the start of each frame
      updateSpatialGrid();

      // Wave Timer Logic
      state.waveTimer = Math.max(0, state.waveTimer - 1);
      if (state.waveTimer <= 0) {
        if (state.isWaveActive) {
          // Combat ended, start preparation
          state.isWaveActive = false;
          
          // Give rewards if it was a boss wave
          giveWaveRewards(state.wave);
          
          const nextWave = state.wave + 1;
          const isBossNext = nextWave % 5 === 0;
          const isMilestoneNext = nextWave % 10 === 0;
          
          // 15 seconds prep normally, 30 seconds for boss
          state.waveTimer = isBossNext ? 30 * 60 : 15 * 60; 
          
          if (isBossNext) {
            const warning = isMilestoneNext ? 'ALERTA MÁXIMO: UM GRANDE GUARDIÃO SE APROXIMA!' : 'ALERTA: UMA CRIATURA PODEROSA FOI AVISTADA!';
            showQuestMessage(warning, 6000);
            triggerShake(12);
          } else {
            showQuestMessage('Onda finalizada! Prepare-se para a próxima.', 3000);
          }
        } else {
          // Preparation ended, start combat
          state.isWaveActive = true;
          state.wave += 1;
          
          const isBossWave = state.wave % 5 === 0;
          const isDense = state.wave % 4 === 0;
          const isFast = state.wave % 3 === 0;
          
          // 60 seconds combat normally, 90 seconds for boss
          state.waveTimer = isBossWave ? 90 * 60 : 60 * 60; 
          
          if (isBossWave) {
            showQuestMessage(`ALERTA: CHEFE DA ONDA ${state.wave} SURGIU!`, 5000);
            triggerShake(15);
          } else {
            let msg = `Onda ${state.wave} iniciada!`;
            if (isDense) msg = `Onda ${state.wave}: HORDA DENSA!`;
            else if (isFast) msg = `Onda ${state.wave}: ATAQUE RÁPIDO!`;
            showQuestMessage(msg, 3000);
          }
        }
      }

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
      updateCamera();
      state.cameraShake *= 0.88;

      autoCollectResources();
      
      spawnEnemy();
      updateEnemies();
      updateDrops();
      updateDefenders();
      
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

    function drawShadow(x: number, y: number, radius: number) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath();
      ctx.ellipse(x, y + 2, radius, radius * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    let groundGradient: CanvasGradient | null = null;
    function drawGround() {
      if (!groundGradient) {
        groundGradient = ctx.createLinearGradient(0, 0, 0, MAP_HEIGHT);
        groundGradient.addColorStop(0, '#1e2b1b');
        groundGradient.addColorStop(1, '#111a10');
      }
      ctx.fillStyle = groundGradient;
      ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

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
      for (let i = 0; i < 30; i++) {
        const x = (i * 137 + 40) % MAP_WIDTH;
        const y = (i * 183 + 120) % MAP_HEIGHT;
        ctx.beginPath();
        ctx.ellipse(x, y, 60, 22, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Small stones and wood debris
      for (let i = 0; i < 40; i++) {
        const x = (i * 197 + 100) % MAP_WIDTH;
        const y = (i * 223 + 50) % MAP_HEIGHT;
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
      drawShadow(x, y + 18 * s, 26 * s);
      
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
      drawShadow(x, y + 8 * s, 20 * s);
      
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
      drawShadow(x, y + 8 * s, 16 * s);
      
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
      const level = fire.level || 1;

      // Light Radius Ring (Visual Protection Area)
      const levelData = CAMPFIRE_LEVELS.find(l => l.level === level) || CAMPFIRE_LEVELS[0];
      const lightRadius = levelData.lightRadius;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 200, 100, 0.12)';
      ctx.setLineDash([15, 15]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fire.x, fire.y, lightRadius, 0, Math.PI * 2);
      ctx.stroke();
      
      // Protection Aura Pulse
      const auraPulse = (Math.sin(performance.now() * 0.002) * 0.5 + 0.5) * 0.05;
      ctx.fillStyle = `rgba(255, 200, 100, ${auraPulse})`;
      ctx.fill();
      ctx.restore();

      // Organic Glow
      const glowRange = 70 + (level * 20) + flicker;
      const glow = ctx.createRadialGradient(fire.x, fire.y, 0, fire.x, fire.y, glowRange);
      glow.addColorStop(0, 'rgba(255, 160, 60, 0.45)');
      glow.addColorStop(0.4, 'rgba(255, 90, 30, 0.2)');
      glow.addColorStop(1, 'rgba(255, 50, 0, 0)');
      
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(fire.x, fire.y, glowRange, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Shadow under fire
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(fire.x, fire.y + 18, 30 + level * 5, 12 + level * 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Base Altar (for higher levels)
      if (level >= 4) {
        ctx.fillStyle = '#333';
        ctx.beginPath();
        ctx.roundRect(fire.x - 30 - level, fire.y - 10, 60 + level * 2, 30, 8);
        ctx.fill();
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Stones around the fire
      const stoneCount = 8 + level * 2;
      for (let i = 0; i < stoneCount; i++) {
        const ang = (i / stoneCount) * Math.PI * 2;
        const dist = 24 + level * 3;
        const sx = fire.x + Math.cos(ang) * dist;
        const sy = fire.y + Math.sin(ang) * dist;
        ctx.fillStyle = i % 2 === 0 ? '#4a4a4a' : '#616161';
        ctx.beginPath();
        ctx.ellipse(sx, sy, 7, 5, ang, 0, Math.PI * 2);
        ctx.fill();
        
        // Magical runes on stones at high level
        if (level >= 6) {
          ctx.fillStyle = 'rgba(100, 200, 255, 0.6)';
          ctx.fillRect(sx - 1, sy - 1, 2, 2);
        }
      }

      // Logs
      ctx.fillStyle = '#3a2515'; 
      ctx.save();
      ctx.translate(fire.x, fire.y + 8);
      const logCount = 3 + Math.floor(level / 2);
      for (let i = 0; i < logCount; i++) {
        ctx.rotate((Math.PI * 2) / logCount);
        ctx.fillRect(-18 - level, -4, 36 + level * 2, 8);
      }
      ctx.restore();

      // Flames (Pixelated style)
      const flameCount = 4 + level;
      for (let i = 0; i < flameCount; i++) {
        const ft = t + i * 1.5;
        const fx = fire.x + Math.sin(ft * 0.6) * (6 + level);
        const fy = fire.y - 5 - i * 8 + Math.cos(ft * 0.9) * 5;
        const fSize = (10 + level * 2) * (1 - i / flameCount);
        
        ctx.fillStyle = i === 0 ? '#ffffff' : i < 3 ? '#ffeb3b' : i < 6 ? '#ff9800' : '#f44336';
        ctx.beginPath();
        ctx.roundRect(fx - fSize/2, fy - fSize/2, fSize, fSize, 2);
        ctx.fill();

        // Embers
        if (Math.random() < 0.1) {
          state.particles.push({
            x: fx, y: fy,
            vx: (Math.random() - 0.5) * 2,
            vy: -Math.random() * 3 - 1,
            life: 1,
            color: '#ff9800',
            size: Math.random() * 3 + 1
          });
        }
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
      const dx = seg.x2 - seg.x1;
      const dy = seg.y2 - seg.y1;
      const dist = Math.sqrt(dx * dx + dy * dy);
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
      drawShadow(t.x, t.y + 18, 20);

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

    function drawWolf(wolf: any) {
      const { x, y, facing, walkTimer, isSitting } = wolf;
      const bounce = isSitting ? 0 : Math.abs(Math.sin(walkTimer * 0.2)) * 3;
      const tailWag = Math.sin(performance.now() * 0.015) * 0.4;
      
      ctx.save();
      ctx.translate(x, y - bounce);
      if (facing === 'left') ctx.scale(-1, 1);

      // Shadow
      drawShadow(0, bounce + 10, 16);

      // Body (Grey/Silver Wolf)
      ctx.fillStyle = '#757575';
      if (isSitting) {
        ctx.fillRect(-10, -4, 20, 16); 
      } else {
        ctx.fillRect(-14, -10, 28, 14);
      }
      
      // Fur details
      ctx.fillStyle = '#9e9e9e';
      ctx.fillRect(-10, -10, 20, 4);
      
      // Head (Longer snout)
      ctx.fillStyle = '#616161';
      const headY = isSitting ? -12 : -18;
      ctx.fillRect(8, headY, 12, 10); // Snout
      ctx.fillStyle = '#424242';
      ctx.fillRect(16, headY + 2, 4, 3); // Nose
      
      // Ears (Pointy)
      ctx.fillStyle = '#212121';
      ctx.beginPath();
      ctx.moveTo(8, headY);
      ctx.lineTo(12, headY - 8);
      ctx.lineTo(16, headY);
      ctx.fill();
      
      // Tail (Bushy)
      ctx.save();
      ctx.translate(-14, isSitting ? 8 : -4);
      ctx.rotate(tailWag);
      ctx.fillStyle = '#757575';
      ctx.beginPath();
      ctx.ellipse(-6, 0, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Legs
      ctx.fillStyle = '#212121';
      if (isSitting) {
        ctx.fillRect(-8, 12, 5, 5);
        ctx.fillRect(3, 12, 5, 5);
      } else {
        const legOffset = Math.sin(walkTimer * 0.2) * 6;
        ctx.fillRect(-12, 4, 5, 6 + legOffset);
        ctx.fillRect(6, 4, 5, 6 - legOffset);
      }

      ctx.restore();
    }

    function drawFalcon(falcon: any) {
      const { x, y, facing, flapTimer, altitude } = falcon;
      const wingFlap = Math.sin(flapTimer * 0.3) * 15;
      
      ctx.save();
      ctx.translate(x, y - altitude);
      if (facing === 'left') ctx.scale(-1, 1);

      // Shadow (on ground)
      ctx.save();
      ctx.translate(0, altitude);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Body
      ctx.fillStyle = '#5d4037'; // Brown
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Wings
      ctx.fillStyle = '#3e2723';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-15, - wingFlap);
      ctx.lineTo(-5, 5);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(15, - wingFlap);
      ctx.lineTo(5, 5);
      ctx.fill();

      // Head
      ctx.fillStyle = '#795548';
      ctx.beginPath();
      ctx.arc(8, -2, 5, 0, Math.PI * 2);
      ctx.fill();
      
      // Beak
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(12, -2);
      ctx.lineTo(16, 0);
      ctx.lineTo(12, 2);
      ctx.fill();

      ctx.restore();
    }

    function drawHelper(h: any) {
      const selected = selectedConstruction && selectedConstruction.ref === h;
      const walkFrame = Math.floor((h.walkTimer || 0) / 8) % 2;
      const bob = walkFrame === 1 ? 2 : 0;
      const level = h.level || 1;
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(h.x, h.y + 14, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body color based on type and level
      let bodyColor = '#4f6440'; // Archer (Green)
      let hatColor = '#2e2116';
      let toolColor = '#d1d1d1';
      let secondaryColor = '#3e2723';
      let capeColor = '#556b2f';
      
      if (h.type === 'warrior') {
        bodyColor = level >= 3 ? '#1A237E' : '#0047AB'; // Darker blue for high level
        hatColor = level >= 3 ? '#FFD700' : '#78909c'; // Gold helmet for high level
        toolColor = level >= 4 ? '#FFD700' : '#a0a0a0'; // Gold sword
        secondaryColor = '#3e2723';
        capeColor = level >= 2 ? '#8B0000' : '#b22222'; // Darker red cape
      } else if (h.type === 'sniper') {
        bodyColor = level >= 3 ? '#1A1C2B' : '#404a64';
        hatColor = level >= 3 ? '#FFD700' : '#2b2e3d';
        toolColor = level >= 4 ? '#FFD700' : '#555555';
        secondaryColor = '#1a1c2b';
        capeColor = '#2b2e3d';
      } else if (h.type === 'mage') {
        bodyColor = level >= 3 ? '#4A148C' : '#5c4064';
        hatColor = level >= 3 ? '#FFD700' : '#362b3d';
        toolColor = level >= 4 ? '#FFD700' : '#ba68c8';
        secondaryColor = '#2b1a36';
        capeColor = level >= 2 ? '#311B92' : '#4b0082';
      } else if (h.type === 'summoner') {
        bodyColor = level >= 3 ? '#004D40' : '#40645e';
        hatColor = level >= 3 ? '#FFD700' : '#2b3d3a';
        toolColor = level >= 4 ? '#FFD700' : '#4db6ac';
        secondaryColor = '#1a2b28';
        capeColor = level >= 2 ? '#006064' : '#008080';
      } else {
        // Archer
        bodyColor = level >= 3 ? '#1B5E20' : '#4f6440';
        hatColor = level >= 3 ? '#FFD700' : '#2e2116';
        toolColor = level >= 4 ? '#FFD700' : '#d1d1d1';
        capeColor = level >= 2 ? '#2E7D32' : '#556b2f';
      }

      // Level Aura (Level 4+)
      if (level >= 4) {
        ctx.save();
        ctx.globalAlpha = 0.3 + Math.sin(Date.now() / 200) * 0.1;
        ctx.fillStyle = h.type === 'mage' ? '#ba68c8' : h.type === 'warrior' ? '#ff5252' : '#ffd700';
        ctx.beginPath();
        ctx.arc(h.x, h.y + 5, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
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
      ctx.fillStyle = level >= 3 ? '#FFD700' : '#000'; // Glowing eyes for level 3+
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
        ctx.fillStyle = level >= 2 ? '#FFD700' : '#fff';
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

      // Shield for Warrior (Level 3+ gets a bigger one)
      if (h.type === 'warrior') {
        ctx.save();
        ctx.translate(h.x + (h.facing === 'left' ? 10 : -10), h.y + 6 + bob);
        ctx.fillStyle = level >= 3 ? '#FFD700' : '#78909c';
        ctx.beginPath();
        ctx.arc(0, 0, level >= 3 ? 9 : 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(0, 0, level >= 3 ? 6 : 5, 0, Math.PI * 2);
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

      // Dialogue Bubble
      if (h.speechText && h.speechTimer > 0) {
        ctx.save();
        ctx.font = 'bold 10px Arial';
        const textWidth = ctx.measureText(h.speechText).width;
        const padding = 6;
        const bubbleWidth = textWidth + padding * 2;
        const bubbleHeight = 20;
        const bx = h.x - bubbleWidth / 2;
        const by = h.y - 45 + bob;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        ctx.rect(bx, by, bubbleWidth, bubbleHeight);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(h.x - 4, by + bubbleHeight);
        ctx.lineTo(h.x + 4, by + bubbleHeight);
        ctx.lineTo(h.x, by + bubbleHeight + 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.fillText(h.speechText, h.x, by + 14);
        ctx.restore();
      }
    }

    function drawResource(res: any) {
      if (res.respawning) return;

      const dx = state.player.x - res.x;
      const dy = state.player.y - res.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < 6400) { // 80px radius
        ctx.save();
        ctx.globalAlpha = (1 - Math.sqrt(distSq) / 80) * 0.4;
        const glow = ctx.createRadialGradient(res.x, res.y, 0, res.x, res.y, 15);
        glow.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(res.x, res.y, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      drawShadow(res.x, res.y + 8, 12);
      
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
      drawShadow(p.x, p.y + 16, 14);

      if (p.hitFlash > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(p.x - 12, p.y - 22 + bob, 24, 50);
        return;
      }

      // Outline for legibility
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.5;
      
      // Red Cape (Behind)
      ctx.fillStyle = '#b22222'; // Firebrick
      ctx.beginPath();
      ctx.moveTo(p.x - 10, p.y - 5 + bob);
      ctx.lineTo(p.x + 10, p.y - 5 + bob);
      ctx.lineTo(p.x + 16, p.y + 20 + bob);
      ctx.lineTo(p.x - 16, p.y + 20 + bob);
      ctx.fill();
      ctx.stroke();

      // Body (Cobalt Blue Tunic)
      ctx.fillStyle = '#0047AB'; // Cobalt Blue
      ctx.fillRect(p.x - 10, p.y - 2 + bob, 20, 24);
      ctx.strokeRect(p.x - 10, p.y - 2 + bob, 20, 24);
      
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
        
        // Slash Arc (White with glow - Optimized for mobile)
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255, 255, 255, ${Math.sin(arcProgress * Math.PI) * 0.5})`;
        ctx.lineWidth = 12 - arcProgress * 6;
        ctx.arc(0, 0, 42 + arcProgress * 12, -1.4, 1.4);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255, 255, 255, ${Math.sin(arcProgress * Math.PI)})`;
        ctx.lineWidth = 4 - arcProgress * 2;
        ctx.arc(0, 0, 42 + arcProgress * 12, -1.4, 1.4);
        ctx.stroke();
        
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
      drawShadow(e.x, e.y + 14 * s, 14 * s);

      if (e.hitFlash > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(e.x, e.y, 18 * s, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      // Outline for legibility
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1.2 * s;

      // Boss Glow & Telegraph
      if (e.type === 'boss') {
        // Enraged pulse
        const isEnraged = e.hp < e.maxHp * 0.5;
        const pulse = isEnraged ? Math.sin(performance.now() * 0.01) * 10 : 0;
        
        ctx.globalAlpha = 0.2 + (isEnraged ? 0.1 : 0);
        ctx.fillStyle = isEnraged ? '#ff0000' : '#ffd700';
        ctx.beginPath();
        ctx.arc(e.x, e.y, (40 + pulse) * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Telegraph circle
        if (e.prepStomp > 0) {
          const progress = e.prepStomp / 45;
          ctx.strokeStyle = '#ff0000';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(e.x, e.y, 120 * progress, 0, Math.PI * 2);
          ctx.stroke();
          
          // Warning fill
          ctx.globalAlpha = 0.3 * progress;
          ctx.fillStyle = '#ff0000';
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }
      }

      if (e.slowTimer > 0) {
        ctx.strokeStyle = '#4fc3f7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 20 * s, 0, Math.PI * 2);
        ctx.stroke();
        // Ice crystals
        ctx.fillStyle = '#e1f5fe';
        for (let i = 0; i < 3; i++) {
          const ang = (performance.now() * 0.002 + i * 2) % (Math.PI * 2);
          ctx.beginPath();
          ctx.arc(e.x + Math.cos(ang) * 18 * s, e.y + Math.sin(ang) * 18 * s, 3 * s, 0, Math.PI * 2);
          ctx.fill();
        }
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
      
      // Simplified Glow (No shadowBlur)
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }

    function drawEffects() {
      // Optimized draw loop: minimize save/restore and context changes
      ctx.save();
      for (const p of state.particles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        
        if (p.type === 'slash') {
          // Use a nested save/restore only for transformations, but re-apply alpha if needed
          // Actually, it's better to just translate/rotate and then manually undo or use save/restore correctly
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.PI / 4);
          ctx.globalAlpha = p.life; // Re-apply alpha inside save block
          ctx.fillRect(-p.size / 2, -2, p.size, 4);
          ctx.restore();
        } else if (p.type === 'cloud' || p.color === '#ffffff') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      }
      ctx.restore();
      
      // Ensure alpha is reset for text effects
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
      ctx.save();
      ctx.globalAlpha = 0.3;
      for (const ap of state.ambientParticles) {
        ctx.fillStyle = ap.color;
        ctx.fillRect(ap.x - ap.size / 2, ap.y - ap.size / 2, ap.size, ap.size);
      }
      ctx.restore();
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
        // Summons Targeting - Optimized with Spatial Grid
        const nearby = getNearbyEnemies(s.x, s.y, 300);
        for (let j = 0; j < nearby.length; j++) {
          const enemy = nearby[j];
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
      drawShadow(s.x, s.y + 12, 10);
      
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

    let vignetteGradient: CanvasGradient | null = null;
    function drawForestEdges() {
      // Vignette (Cached for performance)
      if (!vignetteGradient) {
        vignetteGradient = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, WIDTH * 0.2, WIDTH / 2, HEIGHT / 2, WIDTH * 0.8);
        vignetteGradient.addColorStop(0, 'rgba(0,0,0,0)');
        vignetteGradient.addColorStop(1, 'rgba(2, 7, 3, 0.5)');
      }
      ctx.fillStyle = vignetteGradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      
      // Subtle screen grain
      ctx.save();
      ctx.globalAlpha = 0.02;
      for(let i=0; i<10; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#fff' : '#000';
        ctx.fillRect(Math.random() * WIDTH, Math.random() * HEIGHT, 1, 1);
      }
      ctx.restore();
    }

    function drawFog() {
      const isNight = state.timeOfDay > 0.25 && state.timeOfDay < 0.75;
      if (!isNight) return;
      
      ctx.save();
      for (const f of fogParticles) {
        f.x += f.speedX;
        if (f.x > WIDTH + f.size) f.x = -f.size;
        
        const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size);
        grad.addColorStop(0, `rgba(180, 200, 220, ${f.opacity})`);
        grad.addColorStop(1, 'rgba(180, 200, 220, 0)');
        
        ctx.fillStyle = grad;
        ctx.fillRect(f.x - f.size, f.y - f.size, f.size * 2, f.size * 2);
      }
      ctx.restore();
    }

    function drawDayNight() {
      const t = Math.sin(state.timeOfDay * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;
      if (t < 0.05) return;

      const levelData = CAMPFIRE_LEVELS.find(l => l.level === state.campfire.level) || CAMPFIRE_LEVELS[0];
      const lightRadius = levelData.lightRadius;
      const alpha = t * 0.7; // Max darkness opacity

      ctx.save();
      
      // Calculate campfire position on screen
      const screenX = state.campfire.x - camera.x;
      const screenY = state.campfire.y - camera.y;

      // 1. Draw the darkness overlay with a circular hole
      // We use a path with a rectangle and a counter-clockwise circle to create a hole
      ctx.fillStyle = `rgba(10, 15, 25, ${alpha})`;
      ctx.beginPath();
      ctx.rect(0, 0, WIDTH, HEIGHT);
      ctx.arc(screenX, screenY, lightRadius, 0, Math.PI * 2, true);
      ctx.fill();

      // 2. Add a smooth gradient transition at the edge of the light
      // Simplified for mobile: only create gradient if alpha is significant
      if (alpha > 0.1) {
        const grad = ctx.createRadialGradient(screenX, screenY, lightRadius * 0.5, screenX, screenY, lightRadius);
        grad.addColorStop(0, 'rgba(10, 15, 25, 0)');
        grad.addColorStop(1, `rgba(10, 15, 25, ${alpha})`);
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(screenX, screenY, lightRadius, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.restore();
    }

    function render() {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      
      ctx.save();
      // Apply camera translation
      ctx.translate(-camera.x, -camera.y);

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
        ...state.constructions.wolves.map(w => ({ y: w.y, draw: () => drawWolf(w) })),
        ...state.constructions.falcons.map(f => ({ y: f.y, draw: () => drawFalcon(f) })),
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

      drawEffects();
      drawWeather();
      
      ctx.restore();

      drawForestEdges();
      drawDayNight();
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
      
      ui.rewardAtk?.removeEventListener('click', handleRewardAtk);
      ui.rewardAtk?.removeEventListener('touchstart', handleRewardAtk);
      ui.rewardDef?.removeEventListener('click', handleRewardDef);
      ui.rewardDef?.removeEventListener('touchstart', handleRewardDef);
      ui.rewardEco?.removeEventListener('click', handleRewardEco);
      ui.rewardEco?.removeEventListener('touchstart', handleRewardEco);

      document.getElementById('startBtn')?.removeEventListener('touchstart', handleStart);
      document.getElementById('startBtn')?.removeEventListener('click', handleStart);
      document.getElementById('restartBtn')?.removeEventListener('click', handleRestart);
      document.getElementById('toggleMobileMode')?.removeEventListener('click', handleToggleMobile);
      
      canvas.removeEventListener('mousemove', handleCanvasMouseMove);
      canvas.removeEventListener('pointerdown', handleCanvasPointerDown);
      canvas.removeEventListener('click', handleCanvasClick);

      ui.joystickBase?.removeEventListener('pointerdown', startJoystick);
      ui.joystickBase?.removeEventListener('pointermove', moveJoystick);
      ui.joystickBase?.removeEventListener('pointerup', endJoystick);
      ui.joystickBase?.removeEventListener('pointercancel', endJoystick);
      ui.joystickBase?.removeEventListener('lostpointercapture', endJoystick);
    };
  }, [gameStarted]);

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
          <div className="hotbar-item dq-window w-full max-w-[240px]" onClick={() => (window as any).buyConstruction?.('campfire')}>
            <div className="key-hint">U</div>
            <ArrowUpCircle className="icon" />
            <div className="label">Evoluir Base</div>
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

        {/* Title Overlay */}
        {!gameStarted && (
          <div id="titleOverlay" className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 animate-bg-pulse p-4">
            <div className="dq-window w-full max-w-md p-8 text-center space-y-6 shadow-2xl border-4 border-blue-400/30 backdrop-blur-sm bg-blue-900/40 relative overflow-hidden">
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl" />
              
              <div className="space-y-6 relative z-10">
                <div className="flex justify-center mb-4">
                  <div className="p-6 bg-blue-500/20 rounded-full border-4 border-blue-400/50 shadow-[0_0_30px_rgba(96,165,250,0.4)] animate-float">
                    <Play className="w-16 h-16 text-blue-400 fill-blue-400/20" />
                  </div>
                </div>
                <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic animate-glow">As Crônicas de Hero</h1>
                <p className="text-blue-200/70 text-sm leading-relaxed">
                  Defenda seu acampamento dos monstros da floresta!<br/>
                  Colete recursos de dia e sobreviva à noite.
                </p>
                
                <button 
                  onClick={() => setGameStarted(true)}
                  className="w-full py-5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xl rounded-xl shadow-[0_6px_0_rgb(30,58,138)] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-3 group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]" />
                  <Play className="w-6 h-6 group-hover:scale-110 transition-transform" />
                  INICIAR JORNADA
                </button>

                <div className="pt-4 border-t border-white/10 flex justify-center gap-6 opacity-40 text-[10px] uppercase tracking-widest font-bold text-blue-300">
                  <span>WASD: MOVER</span>
                  <span>CLIQUE: ATACAR</span>
                  <span>1-3: CONSTRUIR</span>
                </div>
              </div>
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

        {/* Reward Choice Overlay */}
        <div id="rewardOverlay" className="overlay" style={{ display: 'none', zIndex: 200 }}>
          <div className="card dq-window p-6 text-center max-w-sm w-full mx-4">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-yellow-500/20 rounded-full border-2 border-yellow-400/50 animate-bounce">
                <Trophy className="w-10 h-10 text-yellow-400" />
              </div>
            </div>
            <h2 className="text-2xl font-black text-yellow-400 mb-2 tracking-tighter uppercase italic">VITÓRIA SOBRE O CHEFE!</h2>
            <p className="text-blue-200/70 text-xs mb-6 uppercase tracking-widest font-bold">Escolha sua bênção eterna:</p>
            
            <div className="flex flex-col gap-3">
              <button id="rewardAtk" className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl shadow-[0_4px_0_rgb(153,27,27)] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-3 group">
                <Sword className="w-5 h-5 group-hover:scale-110 transition-transform" />
                FORÇA (+20% DANO)
              </button>
              <button id="rewardDef" className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl shadow-[0_4px_0_rgb(30,58,138)] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-3 group">
                <Shield className="w-5 h-5 group-hover:scale-110 transition-transform" />
                RESISTÊNCIA (+20% VIDA)
              </button>
              <button id="rewardEco" className="w-full py-4 bg-green-600 hover:bg-green-500 text-white font-black rounded-xl shadow-[0_4px_0_rgb(22,101,52)] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-3 group">
                <Pickaxe className="w-5 h-5 group-hover:scale-110 transition-transform" />
                PROSPERIDADE (+20% COLETA)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
