// Echoes of Everlight — Zelda-like Phaser 3 game starter

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false }
  },
  scene: {
    preload,
    create,
    update
  }
};

const game = new Phaser.Game(config);

let player, cursors, swordKey, isAttacking = false;
let enemies, items, inventory = [];
let puzzleSwitch, puzzleDoor, puzzleSolved = false;
let hearts = 3, maxHearts = 5;
let inventoryText, heartsGroup, messageText;
let npcs, dialogueActive = false, dialogueBox, dialogueIndex = 0, currentDialogue = [];
let questLog = [], activeQuest = null;
let inventoryUI, saveBtn, loadBtn, questUI, messageLogUI;
let block, blockTarget, blockSolved = false;
let nextRespawnTime = 0;

function preload() {
  this.load.image('tiles', './assets/tiles.png');
  this.load.tilemapTiledJSON('map', './assets/map.json');
  this.load.spritesheet('player', './assets/player.png', { frameWidth: 32, frameHeight: 32 });
  this.load.spritesheet('enemy', './assets/enemy.png', { frameWidth: 32, frameHeight: 32 });
  this.load.image('key', './assets/key.png');
  this.load.image('heart', './assets/heart.png');
  this.load.image('switch', './assets/switch.png');
  this.load.image('door', './assets/door.png');
  this.load.spritesheet('npc', './assets/npc.png', { frameWidth: 32, frameHeight: 32 });
  this.load.image('potion', './assets/potion.png');
  this.load.image('block', './assets/block.png');
  this.load.image('questitem', './assets/questitem.png');
}

function create() {
  // Map & layers
  const map = this.make.tilemap({ key: 'map' });
  const tileset = map.addTilesetImage('tileset', 'tiles');
  map.createLayer('Ground', tileset, 0, 0);

  // Player
  player = this.physics.add.sprite(100, 100, 'player', 0);
  player.setCollideWorldBounds(true);
  this.anims.create({ key: 'walk', frames: this.anims.generateFrameNumbers('player', { start: 1, end: 3 }), frameRate: 8, repeat: -1 });
  this.anims.create({ key: 'idle', frames: [{ key: 'player', frame: 0 }] });
  this.anims.create({ key: 'attack', frames: this.anims.generateFrameNumbers('player', { start: 5, end: 7 }), frameRate: 12 });
  cursors = this.input.keyboard.createCursorKeys();
  swordKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

  // Enemies
  enemies = this.physics.add.group();
  spawnEnemies(this);
  this.anims.create({ key: 'enemyWalk', frames: this.anims.generateFrameNumbers('enemy', { start: 0, end: 2 }), frameRate: 6, repeat: -1 });
  this.physics.add.collider(player, enemies, onPlayerHit, null, this);

  // Items
  items = this.physics.add.staticGroup();
  items.create(500, 350, 'key');
  items.create(530, 350, 'heart');
  items.create(560, 350, 'potion');
  items.create(590, 350, 'questitem');
  this.physics.add.overlap(player, items, pickupItem, null, this);

  // Inventory UI
  inventoryText = this.add.text(10, 10, 'Inventory: ', { font: '16px Arial', fill: '#fff' }).setScrollFactor(0);
  inventoryUI = this.add.group();
  updateInventoryUI(this);

  // Hearts UI
  heartsGroup = this.add.group();
  updateHeartsUI(this);

  // Message log
  messageLogUI = this.add.text(10, 40, '', { font: '16px Arial', fill: '#ff0' }).setScrollFactor(0);

  // Puzzle: Switch & Door
  puzzleSwitch = this.physics.add.staticSprite(700, 100, 'switch');
  puzzleDoor = this.physics.add.staticSprite(750, 100, 'door');
  this.physics.add.overlap(player, puzzleSwitch, activateSwitch, null, this);

  // Push block puzzle
  block = this.physics.add.sprite(400, 200, 'block').setImmovable(true);
  blockTarget = this.add.rectangle(600, 200, 32, 32, 0x00ff00, 0.4).setVisible(true);
  this.physics.add.collider(player, block, pushBlock, null, this);

  // NPCs
  npcs = this.physics.add.staticGroup();
  let villager = npcs.create(200, 400, 'npc', 0).setData('id', 'villager');
  let sage = npcs.create(700, 300, 'npc', 0).setData('id', 'sage');
  this.physics.add.overlap(player, npcs, startDialogue, null, this);

  // Dialogue box
  dialogueBox = this.add.rectangle(400, 550, 600, 80, 0x222222, 0.8).setVisible(false).setDepth(2);
  this.dialogueText = this.add.text(120, 520, '', { font: '18px Arial', fill: '#fff', wordWrap: { width: 560 } }).setVisible(false).setDepth(2);

  // Quest UI
  questUI = this.add.text(10, 70, '', { font: '16px Arial', fill: '#0f0' }).setScrollFactor(0);
  updateQuestUI();

  // Save/Load buttons
  saveBtn = this.add.text(700, 10, '[Save]', { font: '16px Arial', fill: '#fff', backgroundColor: '#222' })
    .setInteractive().setScrollFactor(0)
    .on('pointerdown', () => { saveGame(); });
  loadBtn = this.add.text(700, 35, '[Load]', { font: '16px Arial', fill: '#fff', backgroundColor: '#222' })
    .setInteractive().setScrollFactor(0)
    .on('pointerdown', () => { loadGame(this); });

  // Example quest setup
  questLog = [
    {
      id: 'findKey',
      title: 'Find the Lost Key',
      description: 'Find the lost key and give it to the villager.',
      active: false,
      completed: false,
      triggerNpc: 'villager',
      requirement: 'Key'
    },
    {
      id: 'blockPuzzle',
      title: 'Push the Block',
      description: 'Push the stone block onto the green mark.',
      active: false,
      completed: false,
      triggerNpc: 'sage',
      requirement: 'blockSolved'
    }
  ];
  activeQuest = null;
}

function update(time) {
  if (dialogueActive) return;
  if (isAttacking) return;

  player.setVelocity(0);
  if (cursors.left.isDown) {
    player.setVelocityX(-120);
    player.anims.play('walk', true); player.flipX = true;
  } else if (cursors.right.isDown) {
    player.setVelocityX(120);
    player.anims.play('walk', true); player.flipX = false;
  } else if (cursors.up.isDown) {
    player.setVelocityY(-120);
    player.anims.play('walk', true);
  } else if (cursors.down.isDown) {
    player.setVelocityY(120);
    player.anims.play('walk', true);
  } else {
    player.anims.play('idle');
  }

  // Attack
  if (Phaser.Input.Keyboard.JustDown(swordKey)) {
    isAttacking = true;
    player.anims.play('attack');
    this.time.delayedCall(400, () => { isAttacking = false; });
    enemies.children.iterate(enemy => {
      if (enemy.active && Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y) < 40) {
        enemy.destroy();
        logMessage("Enemy defeated!");
      }
    });
  }

  // Enemy AI: patrol and respawn
  enemies.children.iterate(enemy => {
    if (!enemy.active) return;
    enemy.anims.play('enemyWalk', true);
    switch (enemy.direction) {
      case 0: enemy.setVelocityY(-40); break;
      case 1: enemy.setVelocityY(40); break;
      case 2: enemy.setVelocityX(-40); break;
      case 3: enemy.setVelocityX(40); break;
    }
    if (Phaser.Math.Between(0, 100) < 2) enemy.direction = Phaser.Math.Between(0, 3);
  });

  // Respawn enemies every 10 seconds
  if (time > nextRespawnTime) {
    if (enemies.countActive(true) < 3) spawnEnemies(this, true);
    nextRespawnTime = time + 10000;
  }

  updateInventoryUI(this);
  updateHeartsUI(this);
  updateQuestUI();

  // Puzzle: Door open
  if (puzzleSolved && puzzleDoor.active) puzzleDoor.destroy();

  // Block puzzle solved
  if (!blockSolved && Phaser.Geom.Rectangle.Contains(blockTarget.getBounds(), block.x, block.y)) {
    blockSolved = true;
    logMessage("Block puzzle solved!");
    let quest = questLog.find(q => q.id === 'blockPuzzle');
    if (quest && quest.active && !quest.completed) {
      quest.completed = true;
      logMessage("Quest complete! Return to the sage.");
    }
  }
}

function spawnEnemies(scene, onlyMissing = false) {
  const positions = [
    { x: 300, y: 200 }, { x: 360, y: 200 }, { x: 420, y: 200 }
  ];
  let count = enemies.countActive(true);
  for (let i = 0; i < positions.length; i++) {
    if (onlyMissing && count > i) continue;
    let enemy = enemies.create(positions[i].x, positions[i].y, 'enemy');
    enemy.setCollideWorldBounds(true);
    enemy.direction = Phaser.Math.Between(0, 3);
    enemy.health = 2;
  }
}

function pickupItem(player, item) {
  let itemName = '';
  if (item.texture.key === 'key') {
    itemName = 'Key';
  } else if (item.texture.key === 'heart') {
    if (hearts < maxHearts) hearts++;
    itemName = 'Heart';
  } else if (item.texture.key === 'potion') {
    itemName = 'Potion';
  } else if (item.texture.key === 'questitem') {
    itemName = 'QuestItem';
  }
  if (itemName) {
    inventory.push(itemName);
    logMessage(`Picked up: ${itemName}`);
    checkQuestProgress(itemName);
  }
  item.destroy();
}

function activateSwitch(player, switchObj) {
  if (!puzzleSolved && inventory.includes('Key')) {
    puzzleSolved = true;
    switchObj.setTint(0x00ff00);
    logMessage("Door unlocked!");
  }
}

function onPlayerHit(player, enemy) {
  if (!enemy.active) return;
  hearts--;
  logMessage("Ouch! You lost a heart.");
  if (hearts <= 0) {
    hearts = maxHearts;
    player.x = 100; player.y = 100;
    logMessage("You died! Respawned.");
  }
  enemy.health--;
  if (enemy.health <= 0) {
    enemy.destroy();
    logMessage("Enemy defeated!");
  }
}

function updateHeartsUI(scene) {
  heartsGroup.clear(true, true);
  for (let i = 0; i < maxHearts; i++) {
    heartsGroup.create(160 + i * 30, 10, 'heart').setAlpha(i < hearts ? 1 : 0.2).setScrollFactor(0);
  }
}

function updateInventoryUI(scene) {
  inventoryUI.clear(true, true);
  for (let i = 0; i < inventory.length; i++) {
    let iconKey = inventory[i].toLowerCase();
    let icon = scene.add.image(10 + i * 36, 100, iconKey).setScale(0.8).setInteractive().setScrollFactor(0);
    icon.on('pointerdown', () => {
      if (iconKey === 'potion' && hearts < maxHearts) {
        hearts++;
        inventory.splice(i, 1);
        logMessage("Used a potion!");
        updateInventoryUI(scene);
        updateHeartsUI(scene);
      } else {
        logMessage(`Selected: ${inventory[i]}`);
      }
    });
    inventoryUI.add(icon);
  }
}

function startDialogue(player, npcObj) {
  dialogueActive = true;
  currentDialogue = [];
  dialogueIndex = 0;
  let npcId = npcObj.getData('id');
  if (npcId === 'villager') {
    let q = questLog.find(q => q.id === 'findKey');
    if (!q.active) {
      currentDialogue = [
        "Villager: Oh brave hero, I lost my key somewhere in the woods!",
        "Villager: Can you please find it for me?",
        "[Press SPACE to accept quest]"
      ];
    } else if (q.active && !q.completed) {
      currentDialogue = [
        "Villager: Please hurry! I need my key."
      ];
    } else if (q.completed) {
      currentDialogue = [
        "Villager: You found my key! Thank you!",
        "[Quest finished!]"
      ];
    }
  } else if (npcId === 'sage') {
    let q = questLog.find(q => q.id === 'blockPuzzle');
    if (!q.active) {
      currentDialogue = [
        "Sage: The ancient stone must be placed upon the mark.",
        "Sage: Can you solve this puzzle?",
        "[Press SPACE to accept quest]"
      ];
    } else if (q.active && !q.completed) {
      currentDialogue = [
        "Sage: The puzzle awaits!"
      ];
    } else if (q.completed) {
      currentDialogue = [
        "Sage: Excellence! You solved the ancient puzzle.",
        "[Quest finished!]"
      ];
    }
  }
  dialogueBox.setVisible(true);
  this.dialogueText.setVisible(true).setText(currentDialogue[dialogueIndex]);
  this.input.keyboard.once('keydown-SPACE', () => {
    advanceDialogue(this, npcObj);
  });
}

function advanceDialogue(scene, npcObj) {
  dialogueIndex++;
  let npcId = npcObj.getData('id');
  if (dialogueIndex < currentDialogue.length) {
    scene.dialogueText.setText(currentDialogue[dialogueIndex]);
    scene.input.keyboard.once('keydown-SPACE', () => {
      advanceDialogue(scene, npcObj);
    });
    if (currentDialogue[dialogueIndex] === "[Press SPACE to accept quest]") {
      let q = questLog.find(q => (npcId === 'villager' ? q.id === 'findKey' : q.id === 'blockPuzzle'));
      q.active = true;
      activeQuest = q;
      updateQuestUI();
    }
  } else {
    scene.dialogueText.setVisible(false);
    dialogueBox.setVisible(false);
    dialogueActive = false;
  }
}

function updateQuestUI() {
  let text = "Quests:\n";
  questLog.forEach(q => {
    text += `${q.completed ? '✔️' : q.active ? '➡️' : '❔'} ${q.title}: ${q.completed ? 'Completed' : q.active ? q.description : 'Not started'}\n`;
  });
  if (questUI) questUI.setText(text);
}

function checkQuestProgress(itemName) {
  let q = questLog.find(q => q.id === 'findKey');
  if (q && q.active && !q.completed && itemName === q.requirement) {
    q.completed = true;
    logMessage("Quest complete! Return to the villager.");
    updateQuestUI();
  }
}

function pushBlock(player, blockObj) {
  let dx = blockObj.x - player.x;
  let dy = blockObj.y - player.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    blockObj.x += dx > 0 ? 32 : -32;
  } else {
    blockObj.y += dy > 0 ? 32 : -32;
  }
}

function saveGame() {
  const data = {
    player: { x: player.x, y: player.y },
    hearts, inventory,
    questLog, activeQuestId: activeQuest ? activeQuest.id : null,
    puzzleSolved, blockSolved
  };
  localStorage.setItem('everlightSave', JSON.stringify(data));
  logMessage("Game saved!");
}

function loadGame(scene) {
  const data = JSON.parse(localStorage.getItem('everlightSave') || '{}');
  if (!data.player) return;
  player.x = data.player.x;
  player.y = data.player.y;
  hearts = data.hearts || 3;
  inventory = data.inventory || [];
  questLog = data.questLog || questLog;
  activeQuest = questLog.find(q => q.id === data.activeQuestId) || null;
  puzzleSolved = data.puzzleSolved || false;
  blockSolved = data.blockSolved || false;
  updateInventoryUI(scene);
  updateQuestUI();
  logMessage("Game loaded!");
}

function logMessage(msg) {
  messageLogUI.setText(msg);
  setTimeout(() => { messageLogUI.setText(""); }, 1800);
}