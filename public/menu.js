
const { app, Menu, shell, nativeTheme } = require('electron');
const path = require('path');

const importers = [
  { label: '&D64 disk image (.d64)', cmd: 'import-d64' },
  { label: "C Array / MARQ's (.&c)", cmd: 'import-marq-c' },
  { label: '&PNG (.png)', cmd: 'import-png' },
  { label: '&SEQ (.seq)', cmd: 'import-seq' },
  { label: 'Adv. &SEQ (.seq)', cmd: 'import-seq-adv' },
  { label: '&CBASE (.prg)', cmd: 'import-cbase' }
]

const exporters = [
  { label: '&Assembler source (.asm)', cmd: 'export-asm' },
  { label: '&BASIC (.bas)', cmd: 'export-basic' },
  { label: '&D64 disk image (.d64)', cmd: 'export-d64' },
  { label: '&Simple platform executable (.prg)', cmd: 'export-prg' },
  { label: '&GIF (.gif)', cmd: 'export-gif' },
  { label: '&JSON (.json)', cmd: 'export-json' },
  { label: "C Array / MARQ's (.&c)", cmd: 'export-marq-c' },
  { label: '&PNG (.png)', cmd: 'export-png' },
  { label: '&SEQ (.seq)', cmd: 'export-seq' },
  { label: '&CBASE (.prg)', cmd: 'export-cbase' },
  { label: 'PE&T (.pet)', cmd: 'export-pet' },
  { label: 'Pet&mate Player (.prg)', cmd: 'export-prg-player', accelerator: 'CmdOrCtrl+Shift+X', actionId: 'menu.file.exportPrgPlayer' }
]

const subMenuNewImage = [
  { label: 'DirArt Small 16x10', cmd: 'new-dirart-10' },
  { label: 'DirArt Medium 16x20', cmd: 'new-dirart-20' },
  { label: 'DirArt Max 16x144', cmd: 'new-dirart-144' },
  { label: 'C16/Plus4 40x25', cmd: 'new-screen-c16' },
  { label: 'c128 40x25', cmd: 'new-screen-c128-40' },
  { label: 'c128 VDC 80x25', cmd: 'new-screen-c128-80' },
  { label: 'Vic20 22x23', cmd: 'new-screen-vic20' },
  { label: 'Pet 40x25', cmd: 'new-screen-pet-40' },
  { label: 'Pet 80x25', cmd: 'new-screen-pet-80' }

]

const colorBarsDocuments = [
  'C64 Uppercase 40x25',
  'C64 Lowercase 40x25',
  'C128 Uppercase 40x25',
  'C128 Lowercase 40x25',
  'C128 VDC 80x25',
  'C16 Uppercase 40x25',
  'C16 Lowercase 40x25',
  'Vic20 Uppercase 22x23',
  'Vic20 Lowercase 22x23',
  'PET Graphics 40x25',
  'PET Business 40x25',
  'PET Graphics 80x25',
  'PET Business 80x25',
]

// Platform preset groups the renderer keeps Box/Texture presets keyed by.
// The labels are what the user sees in the Tools > Presets menu; the `group`
// value is the key used both in the grouped Redux state and as the embedded
// ASCII marker in the exported screens.
const presetGroups = [
  { label: 'C64 / C128 40-col Upper', group: 'c64' },
  { label: 'C64 / C128 40-col Lower', group: 'c64l' },
  { label: 'C16 / Plus/4 Upper',      group: 'c16' },
  { label: 'C16 / Plus/4 Lower',      group: 'c16l' },
  { label: 'C128 VDC 80-col',         group: 'c128vdc' },
  { label: 'VIC-20 Upper',            group: 'vic20' },
  { label: 'VIC-20 Lower',            group: 'vic20l' },
  { label: 'PET Graphics (Upper)',     group: 'pet' },
  { label: 'PET Business (Lower)',     group: 'petl' }
];
const ABOUT_PANEL_CREDITS = [
  'Maintainer & Current Developer:',
  'Wolfgang-Aaron Bochar (wbochar)',
  'https://wbochar.com/petmate9',
  '',
  'Image Conversion Tools:',
  'img2petscii by Michel de Bree',
  'https://github.com/micheldebree/c64-tools/tree/main/img2petscii',
  'petsciiator by EgonOlsen71',
  'https://github.com/EgonOlsen71/petsciiator',
  '',
  'Thanks for testing and support:',
  '4gentE, Adder, Anonym, Bepp, Icon, lastyle, Littlebitspace, Rexberg, Sailor, Shine, Skyhawk, Tak Yano, Tao, Taper, TDM, Twoflower, Xahmol'
].join('\n');



module.exports = class MenuBuilder {
  constructor(mainWindow, recentFiles, themeSource, showTransparency, keybindings) {
    this.mainWindow = mainWindow;
    this.recentFiles = recentFiles || [];
    this.themeSource = themeSource || 'dark';
    this.showTransparency = showTransparency !== undefined ? !!showTransparency : true;
    // Sparse or full map of action id -> accelerator string, as persisted in
    // the renderer's Settings file (src/keybindings/registry.ts is the
    // source of truth for action ids and their defaults). Missing/empty
    // entries fall back to the literal default accelerator already baked
    // into this file, via `accel()` below — so an empty/missing map behaves
    // exactly like the pre-remapping hardcoded menu.
    this.keybindings = keybindings || {};
  }

  setRecentFiles(files) {
    this.recentFiles = files || [];
  }

  setThemeSource(source) {
    this.themeSource = source;
  }

  setShowTransparency(show) {
    this.showTransparency = !!show;
  }

  getShowTransparency() {
    return this.showTransparency;
  }

  setKeybindings(keybindings) {
    this.keybindings = keybindings || {};
  }

  /** Resolve the accelerator for a remappable action id: a non-empty user
   *  override wins, an explicit empty-string override means the action was
   *  deliberately left unbound (e.g. to resolve a conflict in the Settings
   *  UI) and must NOT fall back to the literal default, and a missing key
   *  (action id absent from the map entirely) falls back to this file's
   *  literal default. Returns `undefined` when there's no binding at all
   *  (Electron treats an `undefined` accelerator the same as omitting the
   *  property). */
  accel(actionId, fallback) {
    const override = this.keybindings[actionId];
    if (typeof override === 'string') {
      return override.length > 0 ? override : undefined;
    }
    return fallback || undefined;
  }

  rebuildMenu() {
    this.buildMenu();
  }

  sendMenuCommand(msg, data) {
    this.mainWindow.webContents.send('menu', msg, data)
  }

  buildRecentFilesSubmenu() {
    const items = [];
    if (this.recentFiles.length === 0) {
      items.push({
        label: 'No Recent Files',
        enabled: false
      });
    } else {
      this.recentFiles.forEach((filePath) => {
        items.push({
          label: path.basename(filePath),
          toolTip: filePath,
          click: () => {
            this.sendMenuCommand('open-recent-file', filePath);
          }
        });
      });
      items.push({ type: 'separator' });
      items.push({
        label: 'Clear Recent',
        click: () => {
          this.sendMenuCommand('clear-recent-files');
        }
      });
    }
    return items;
  }

  buildMenu() {
    if (!app.isPackaged) {
      // this.setupDevelopmentEnvironment();
    }

    const template = process.platform === 'darwin'
      ? this.buildDarwinTemplate()
      : this.buildDefaultTemplate();

    // @ts-ignore
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    return menu;
  }

  mkImportCmd(label, cmd) {
    return {
      label,
      click: () => {
        this.sendMenuCommand(cmd)
      }
    }
  }

  mkExportCmd(label, cmd, accelerator, actionId) {
    const item = {
      label,
      click: () => {
        this.sendMenuCommand(cmd)
      }
    };
    const resolved = actionId ? this.accel(actionId, accelerator) : accelerator;
    if (resolved) item.accelerator = resolved;
    return item;
  }

  /** Build the Tools > Presets submenu. Each tool (Boxes/Textures) gets a
   *  submenu with an 'All' export that writes one screen per platform group
   *  plus per-group exports. A top-level 'Export all tools presets' covers
   *  every tool and every group in one click. */
  buildPresetsSubmenu() {
    const toolEntry = (toolLabel, toolCmd) => ({
      label: toolLabel,
      submenu: [
        {
          label: `All ${toolLabel} preset export`,
          click: () => this.sendMenuCommand(`export-presets-${toolCmd}-all`)
        },
        { type: 'separator' },
        ...presetGroups.map(({ label, group }) => ({
          label: `Export ${toolLabel} — ${label}`,
          click: () => this.sendMenuCommand(`export-presets-${toolCmd}-${group}`)
        })),
        { type: 'separator' },
        {
          label: `Clear ${toolLabel} presets`,
          click: () => this.sendMenuCommand(`clear-presets-${toolCmd}`)
        }
      ]
    });
    const separatorEntry = {
      label: 'Separators',
      submenu: [
        {
          label: 'Export Separators',
          click: () => this.sendMenuCommand('export-presets-lines-all')
        },
        { type: 'separator' },
        {
          label: 'Clear Separators presets',
          click: () => this.sendMenuCommand('clear-presets-lines')
        }
      ]
    };
    return [
      toolEntry('Boxes', 'boxes'),
      separatorEntry,
      toolEntry('Textures', 'textures'),
      toolEntry('Fade/Lighten', 'fade'),
      { type: 'separator' },
      {
        label: 'Export all tools presets',
        click: () => this.sendMenuCommand('export-presets-all')
      },
      { type: 'separator' },
      {
        // Scan every open framebuffer for Boxes_/Textures_/Lines_ preset
        // exports and fold them back into the grouped preset state so a
        // saved-and-reopened workspace can restore every tool's presets
        // in one click.
        label: 'Import All Presets',
        click: () => this.sendMenuCommand('import-all-presets')
      }
    ];
  }

  buildColorBarsSubmenu() {
    const perFrameItems = colorBarsDocuments.map((frameTitle) => ({
      label: frameTitle,
      click: () => {
        this.sendMenuCommand('open-color-bars', frameTitle)
      }
    }));
    return [
      ...perFrameItems,
      { type: 'separator' },
      {
        label: 'Open All Color Bars',
        click: () => {
          this.sendMenuCommand('open-all-color-bars')
        }
      }
    ];
  }

  setupDevelopmentEnvironment() {
    this.mainWindow.webContents.on('context-menu', (e, props) => {
      const { x, y } = props;

      Menu.buildFromTemplate([
        {
          label: 'Inspect element',
          click: () => {
            this.mainWindow.inspectElement(x, y);
          }
        }
      ]).popup(this.mainWindow);
    });
  }

  buildDarwinTemplate() {
    const subMenuAbout = {
      label: 'Petmate 9',
      submenu: [
        {
          label: 'About Petmate 9',
          click: () => {
            app.setAboutPanelOptions({
              applicationName: 'Petmate 9',
              applicationVersion: app.getVersion(),
              copyright: 'Copyright (c) 2018-2020, Janne Hellsten',
              credits: ABOUT_PANEL_CREDITS,
            });
            app.showAboutPanel();
          }
        },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: this.accel('menu.edit.preferences', 'Command+,'),
          click: () => {
            this.sendMenuCommand('preferences');
          }
        },
        { type: 'separator' },
        {
          label: 'Hide Petmate 9',
          accelerator: 'Command+H',
          selector: 'hide:'
        },
        {
          label: 'Hide Others',
          accelerator: 'Command+Shift+H',
          selector: 'hideOtherApplications:'
        },
        { label: 'Show All', selector: 'unhideAllApplications:' },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: this.accel('menu.file.quit', 'Command+Q'),
          click: () => {
            app.quit();
          }
        }
      ]
    };
    const subMenuFile = {
      label: 'File',
      submenu: [
        {
          label: 'New Petmate Document',
          click: () => {
            this.sendMenuCommand('new');
          }
        },
        {
          label: 'New 40x25 Screen', accelerator: this.accel('menu.file.newScreen', 'Command+Shift+T'),
          click: () => {
            this.sendMenuCommand('new-screen');
          }
        },
        {
          label: 'New Screen...',
          submenu: subMenuNewImage.map(decl => this.mkExportCmd(decl.label, decl.cmd))
        },

        { type: 'separator' },
        {
          label: 'Open File...', accelerator: this.accel('menu.file.open', 'Command+O'),
          click: () => {
            this.sendMenuCommand('open');
          }
        },
          { type: 'separator' },
        {
          label: 'Save', accelerator: this.accel('menu.file.save', 'Command+S'),
          click: () => {
            this.sendMenuCommand('save');
          }
        },
        {
          label: 'Save As...', accelerator: this.accel('menu.file.saveAs', 'Command+Shift+S'),
          click: () => {
            this.sendMenuCommand('save-as');
          }
        },
        { type: 'separator' },
        {
          label: 'Open Recent',
          submenu: this.buildRecentFilesSubmenu()
        },
        { type: 'separator' },
        {
          label: 'Ultimate',
          submenu: [
            {
              label: 'Send to Ultimate (&1)', accelerator: this.accel('menu.ultimate.send', 'Command+Shift+1'),
              click: () => {
                this.sendMenuCommand('send-ultimate');
              }
            },
            {
              label: 'Push to Ultimate (&3)', accelerator: this.accel('menu.ultimate.push', 'Command+Shift+3'),
              click: () => {
                this.sendMenuCommand('push-ultimate');
              }
            },
            { type: 'separator' },
            {
              label: 'Import Screen (&2)', accelerator: this.accel('menu.ultimate.import', 'Command+Shift+2'),
              click: () => {
                this.sendMenuCommand('import-ultimate');
              }
            },
            {
              label: 'Import Charset',
              click: () => {
                this.sendMenuCommand('import-charset-ultimate');
              }
            },
            { type: 'separator' },
            {
              label: 'Play SID...',
              click: () => {
                this.sendMenuCommand('play-sid-ultimate');
              }
            },
            { type: 'separator' },
            {
              label: 'Export D64 to Ultimate (&4)', accelerator: this.accel('menu.ultimate.exportD64', 'Command+Shift+4'),
              click: () => {
                this.sendMenuCommand('export-d64-ultimate');
              }
            },
            { type: 'separator' },
            {
              label: 'Send Test Pattern',
              click: () => {
                this.sendMenuCommand('send-test-pattern-ultimate');
              }
            },
            {
              label: 'Reset Ultimate',
              click: () => {
                this.sendMenuCommand('reset-ultimate');
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Import...',
          submenu: importers.map(decl => this.mkImportCmd(decl.label, decl.cmd))
        },
        {
          label: 'Export As...',
          submenu: exporters.map(decl => this.mkExportCmd(decl.label, decl.cmd, decl.accelerator, decl.actionId))
        },
        { type: 'separator' },
        {
          label: 'Fonts...',
          click: () => {
            this.sendMenuCommand('custom-fonts');
          }
        },
      ]
    };
    const subMenuEdit = {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo', accelerator: this.accel('menu.edit.undo', 'Command+Z'), selector: 'undo:',
          click: () => {
            this.sendMenuCommand('undo');
          }
        },
        {
          label: 'Redo', accelerator: this.accel('menu.edit.redo', 'Shift+Command+Z'), selector: 'redo:',
          click: () => {
            this.sendMenuCommand('redo');
          }
        },
        { type: 'separator' },
        {
          label: 'Copy Frame', accelerator: this.accel('menu.edit.copyFrame', 'Command+C'),
          click: () => {
            this.sendMenuCommand('copy-frame');
          }
        },
        {
          label: 'Copy to Frame to PNG', accelerator: this.accel('menu.edit.copyFrameAsPng', 'Shift+Command+C'),
          click: () => {
            this.sendMenuCommand('copy-png');
          }
        },
        {
          label: 'Paste Frame', accelerator: this.accel('menu.edit.pasteFrame', 'Shift+Command+V'),
          click: () => {
            this.sendMenuCommand('paste-frame');
          }
        },
        {
          label: 'Paste Text', accelerator: this.accel('menu.edit.pasteText', 'Alt+Command+V'),
          click: () => {
            this.sendMenuCommand('paste-text');
          }
        },
      ]
    };
    const subMenuImage = {
      label: 'Image',
      submenu: [
        {
          label: 'Shift Left', accelerator: this.accel('menu.image.shiftLeft', 'Alt+Left'),
          click: () => {
            this.sendMenuCommand('shift-screen-left');
          }
        },
        {
          label: 'Shift Right', accelerator: this.accel('menu.image.shiftRight', 'Alt+Right'),
          click: () => {
            this.sendMenuCommand('shift-screen-right');
          }
        },
        {
          label: 'Shift Up', accelerator: this.accel('menu.image.shiftUp', 'Alt+Up'),
          click: () => {
            this.sendMenuCommand('shift-screen-up');
          }
        },
        {
          label: 'Shift Down', accelerator: this.accel('menu.image.shiftDown', 'Alt+Down'),
          click: () => {
            this.sendMenuCommand('shift-screen-down');
          }
        },

        { type: 'separator' },
        {
          label: 'Border On/Off', accelerator: this.accel('menu.image.toggleBorder', 'Command+B'),
          click: () => {
            this.sendMenuCommand('toggle-border');
          }
        },
        {
          label: 'Grid On/Off', accelerator: this.accel('menu.image.toggleGrid', 'Command+G'),
          click: () => {
            this.sendMenuCommand('toggle-grid');
          }
        },
        {
          label: 'Show Transparency',
          accelerator: this.accel('menu.image.toggleTransparency', 'Command+T'),
          type: 'checkbox',
          checked: this.showTransparency,
          click: (menuItem) => {
            this.showTransparency = menuItem.checked;
            this.sendMenuCommand('toggle-show-transparency', menuItem.checked);
          }
        },
        {
          label: 'Crop/Resize Image', accelerator: this.accel('menu.image.cropResize', 'Command+\\'),
          click: () => {
            this.sendMenuCommand('crop-screen');
          }
        },
        {
          label: 'Convert to Mono', accelerator: this.accel('menu.image.convertMono', 'Command+Shift+M'),
          click: () => {
            this.sendMenuCommand('convert-mono');
          }
        },
        {
          label: 'Clear Image', accelerator: this.accel('menu.image.clear', 'Shift+Home'),
          click: () => {
            this.sendMenuCommand('clear-screen');
          }
        },
        { type: 'separator' },
        {
          label: 'Make DirArt Safe',
          click: () => {
            this.sendMenuCommand('make-dirart-safe');
          }
        }




      ]
    };

    const subMenuSelection = {
      label: '&Selection',
      submenu: [

        {
          label: 'Select &All', accelerator: this.accel('menu.selection.selectAll', 'Command+A'),
          click: () => {
            this.sendMenuCommand('selection-select-all');
          }
        },
        { type: 'separator' },
        {
          label: 'Paste to &New Image', accelerator: this.accel('menu.selection.pasteToNewImage', 'Command+N'),
          click: () => {
            this.sendMenuCommand('selection-paste-new');
          }
        },
        {
          label: '&Clear Selection', accelerator: this.accel('menu.selection.clear', 'Command+Home'),
          click: () => {
            this.sendMenuCommand('selection-clear');
          }
        },
        { type: 'separator' },
        {
          label: 'Rotate &Left', accelerator: this.accel('menu.selection.rotateLeft', 'Command+['),
          click: () => {
            this.sendMenuCommand('selection-rotate-left');
          }
        },
        {
          label: 'Rotate &Right', accelerator: this.accel('menu.selection.rotateRight', 'Command+]'),
          click: () => {
            this.sendMenuCommand('selection-rotate-right');
          }
        },
        {
          label: 'Flip &Horizontally', accelerator: this.accel('menu.selection.flipHorizontal', 'H'),
          click: () => {
            this.sendMenuCommand('selection-flip-h');
          }
        },
        {
          label: 'Flip &Vertically', accelerator: this.accel('menu.selection.flipVertical', 'V'),
          click: () => {
            this.sendMenuCommand('selection-flip-v');
          }
        },
        { type: 'separator' },
        {
          label: '&Invert Characters', accelerator: this.accel('menu.selection.invert', 'Command+I'),
          click: () => {
            this.sendMenuCommand('selection-invert');
          }
        }





      ]
    };


    const subMenuToolsDev = {
      label: 'Tools',
      submenu: [
        {
          label: 'Presets',
          submenu: this.buildPresetsSubmenu()
        },
        {
          label: 'Color Bars',
          submenu: this.buildColorBarsSubmenu()
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'Command+R',
          click: () => {
            this.mainWindow.webContents.reload();
          }
        },
        {
          label: 'Toggle Full Screen',
          accelerator: this.accel('menu.tools.toggleFullScreen', 'Ctrl+Command+F'),
          click: () => {
            this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: this.accel('menu.tools.toggleDevTools', 'Alt+Command+I'),
          click: () => {
            this.mainWindow.toggleDevTools();
          }
        }
      ]
    };

    const subMenuFrames = {
      label: '&Frames',
      submenu: [
        {
          label: 'Align All Frames x2 Zoom', accelerator: this.accel('menu.frames.alignAll2x', 'Command+Alt+9'),
          click: () => {
            this.sendMenuCommand('align-frames-2x');
          }
        },
        { type: 'separator' },
        {
          label: 'Move Frame &Left in Stack', accelerator: this.accel('menu.frames.moveLeft', 'Command+Left'),
          click: () => {
            this.sendMenuCommand('shift-frame-left');
          }
        },
        {
          label: 'Move Frame &Right in Stack', accelerator: this.accel('menu.frames.moveRight', 'Command+Right'),
          click: () => {
            this.sendMenuCommand('shift-frame-right');
          }
        },
        { type: 'separator' },
        {
          label: '&Duplicate', accelerator: this.accel('menu.frames.duplicate', 'Insert'),
          click: () => {
            this.sendMenuCommand('duplicate-frame');
          }
        },
        {
          label: '&Remove', accelerator: this.accel('menu.frames.remove', 'Delete'),
          click: () => {
            this.sendMenuCommand('remove-frame');
          }
        }
      ]
    }

    const subMenuView = {
      label: '&View',
      submenu: [
        {
          label: 'Zoom In', accelerator: this.accel('menu.view.zoomIn', 'Command+='),
          click: () => {
            this.sendMenuCommand('zoom-in-left');
          }
        },
        {
          label: 'Zoom Out', accelerator: this.accel('menu.view.zoomOut', 'Command+-'),
          click: () => {
            this.sendMenuCommand('zoom-out-left');
          }
        },
        { type: 'separator' },
        {
          label: 'Zoom x2 (Default)', accelerator: this.accel('menu.view.zoom2x', 'Command+9'),
          click: () => {
            this.sendMenuCommand('zoom-2x-left');
          }
        },
        {
          label: 'Zoom x1', accelerator: this.accel('menu.view.zoom1x', 'Command+0'),
          click: () => {
            this.sendMenuCommand('zoom-1x-left');
          }
        },
        { type: 'separator' },
        ...this.buildThemeMenuItems()
      ]
    };

    const subMenuToolsProd = {
      label: 'Tools',
      submenu: [
        {
          label: 'Presets',
          submenu: this.buildPresetsSubmenu()
        },
        {
          label: 'Color Bars',
          submenu: this.buildColorBarsSubmenu()
        },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: this.accel('menu.tools.toggleFullScreen', 'Ctrl+Command+F'),
          click: () => {
            this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
          }
        }
      ]
    };
    const subMenuWindow = {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'Command+M',
          selector: 'performMiniaturize:'
        },
        { label: 'Close', accelerator: 'Command+W', selector: 'performClose:' },
        { type: 'separator' },
        { label: 'Bring All to Front', selector: 'arrangeInFront:' }
      ]
    };
    const subMenuHelp = {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          accelerator: this.accel('menu.help.documentation'),
          click() {
            shell.openExternal(
              'https://wbochar.com/petmate9/'
            );
          }
        },
        {
          label: 'Search Issues',
          accelerator: this.accel('menu.help.searchIssues'),
          click() {
            shell.openExternal('https://github.com/wbochar/petmate9/issues');
          }
        }
      ]
    };

    const subMenuTools =
      !app.isPackaged ? subMenuToolsDev : subMenuToolsProd;

    return [subMenuAbout, subMenuFile, subMenuEdit, subMenuImage, subMenuSelection, subMenuFrames, subMenuView, subMenuTools, subMenuWindow, subMenuHelp];
  }

  buildThemeMenuItems() {
    const current = this.themeSource;
    const applyTheme = (source) => {
      nativeTheme.themeSource = source;
      this.themeSource = source;
      this.rebuildMenu();
      // Notify the renderer so it can update the data-theme attribute
      // and keep its Redux settings in sync.
      this.sendMenuCommand('set-theme', source);
    };
    const cycleOrder = ['dark', 'light', 'system'];
    const nextTheme = cycleOrder[(cycleOrder.indexOf(current) + 1) % cycleOrder.length];
    return [
      {
        label: `Toggle Theme (${current})`,
        accelerator: this.accel('menu.view.toggleTheme', 'CmdOrCtrl+Shift+D'),
        click: () => applyTheme(nextTheme)
      },
      { type: 'separator' },
      {
        label: 'Light Mode',
        type: 'radio',
        checked: current === 'light',
        click: () => applyTheme('light')
      },
      {
        label: 'Dark Mode',
        type: 'radio',
        checked: current === 'dark',
        click: () => applyTheme('dark')
      },
      {
        label: 'Auto (System)',
        type: 'radio',
        checked: current === 'system',
        click: () => applyTheme('system')
      }
    ];
  }

  buildDefaultTemplate() {
    const templateDefault = [
      {
        label: '&File',
        submenu: [
          {
            label: '&New Petmate Document',
            click: () => {
              this.sendMenuCommand('new');
            }
          },
          {
            label: 'New &40x25 Screen', accelerator: this.accel('menu.file.newScreen', 'Ctrl+Shift+T'),
            click: () => {
              this.sendMenuCommand('new-screen');
            }
          },
          {
            label: 'New Screen..&.',
            submenu: subMenuNewImage.map(decl => this.mkExportCmd(decl.label, decl.cmd))
          },

          { type: 'separator' },
          {
            label: '&Open', accelerator: this.accel('menu.file.open', 'Ctrl+O'),
            click: () => {
              this.sendMenuCommand('open');
            }
          },

          {
            label: 'Open Recent',
            submenu: this.buildRecentFilesSubmenu()
          },
          { type: 'separator' },
          {
            label: '&Save', accelerator: this.accel('menu.file.save', 'Ctrl+S'),
            click: () => {
              this.sendMenuCommand('save');
            }
          },
          {
            label: 'Save &As...', accelerator: this.accel('menu.file.saveAs', 'Ctrl+Shift+S'),
            click: () => {
              this.sendMenuCommand('save-as');
            }
          },

          { type: 'separator' },
          {
            label: '&Ultimate',
            submenu: [
              {
                label: 'Send to Ultimate (&1)', accelerator: this.accel('menu.ultimate.send', 'Ctrl+Shift+1'),
                click: () => {
                  this.sendMenuCommand('send-ultimate');
                }
              },
              {
                label: 'Push to Ultimate (&3)', accelerator: this.accel('menu.ultimate.push', 'Ctrl+Shift+3'),
                click: () => {
                  this.sendMenuCommand('push-ultimate');
                }
              },
              { type: 'separator' },
              {
                label: 'Import Screen (&2)', accelerator: this.accel('menu.ultimate.import', 'Ctrl+Shift+2'),
                click: () => {
                  this.sendMenuCommand('import-ultimate');
                }
              },
              {
                label: 'Import Charset',
                click: () => {
                  this.sendMenuCommand('import-charset-ultimate');
                }
              },
              { type: 'separator' },
              {
                label: 'Play SID...',
                click: () => {
                  this.sendMenuCommand('play-sid-ultimate');
                }
              },
              { type: 'separator' },
              {
                label: 'Export D64 to Ultimate (&4)', accelerator: this.accel('menu.ultimate.exportD64', 'Ctrl+Shift+4'),
                click: () => {
                  this.sendMenuCommand('export-d64-ultimate');
                }
              },
              { type: 'separator' },
              {
                label: 'Send Test Pattern',
                click: () => {
                  this.sendMenuCommand('send-test-pattern-ultimate');
                }
              },
              {
                label: 'Reset Ultimate',
                click: () => {
                  this.sendMenuCommand('reset-ultimate');
                }
              }
            ]
          },
          { type: 'separator' },
          {
            label: '&Import',
            submenu: importers.map(decl => this.mkImportCmd(decl.label, decl.cmd))
          },
          {
          label: '&Export As',
          submenu: exporters.map(decl => this.mkExportCmd(decl.label, decl.cmd, decl.accelerator, decl.actionId))
        },
          { type: 'separator' },
          {
            label: '&Fonts...',
            click: () => {
              this.sendMenuCommand('custom-fonts');
            }
          },
          { type: 'separator' },
          {
            label: 'E&xit',
            accelerator: this.accel('menu.file.quit', 'CmdOrCtrl+Q'),
            click: () => {
              app.quit();
            }
          },


        ]
      },
      {
        label: '&Edit',
        submenu: [
          {
            label: '&Undo', accelerator: this.accel('menu.edit.undo', 'Ctrl+Z'), selector: 'undo:',
            click: () => {
              this.sendMenuCommand('undo');
            }
          },
          {
            label: '&Redo', accelerator: this.accel('menu.edit.redo', 'Ctrl+Y'), selector: 'redo:',
            click: () => {
              this.sendMenuCommand('redo');
            }
          },
          {
            label: 'Redo', accelerator: 'Ctrl+Shift+Z', visible: false,
            click: () => {
              this.sendMenuCommand('redo');
            }
          },
          { type: 'separator' },
          {
            label: '&Copy Frame', accelerator: this.accel('menu.edit.copyFrame', 'Ctrl+C'),
            click: () => {
              this.sendMenuCommand('copy-frame');
            }
          },
          {
            label: 'Copy to Frame to PNG', accelerator: this.accel('menu.edit.copyFrameAsPng', 'Shift+Ctrl+C'),
            click: () => {
              this.sendMenuCommand('copy-png');
            }
          },
          {
            label: '&Paste Frame', accelerator: this.accel('menu.edit.pasteFrame', 'Ctrl+V'),
            click: () => {
              this.sendMenuCommand('paste-frame');
            }
          },
          {
            label: 'Paste &Text', accelerator: this.accel('menu.edit.pasteText', 'Shift+Ctrl+V'),
            click: () => {
              this.sendMenuCommand('paste-text');
            }
          },
          { type: 'separator' },
          {
            label: 'Find/Replace', accelerator: this.accel('menu.edit.findReplace', 'Ctrl+F'),
            click: () => {
              this.sendMenuCommand('find-replace');
            }
          },
          { type: 'separator' },
          {
            label: '&Preferences', accelerator: this.accel('menu.edit.preferences', 'Ctrl+P'),
            click: () => {
              this.sendMenuCommand('preferences');
            }
          }
        ]
      },

      {
        label: '&Image',
        submenu: [

          {
            label: 'Shift &Left', accelerator: this.accel('menu.image.shiftLeft', 'Alt+Left'),
            click: () => {
              this.sendMenuCommand('shift-screen-left');
            }
          },
          {
            label: 'Shift &Right', accelerator: this.accel('menu.image.shiftRight', 'Alt+Right'),
            click: () => {
              this.sendMenuCommand('shift-screen-right');
            }
          },
          {
            label: 'Shift &Up', accelerator: this.accel('menu.image.shiftUp', 'Alt+Up'),
            click: () => {
              this.sendMenuCommand('shift-screen-up');
            }
          },
          {
            label: 'Shift &Down', accelerator: this.accel('menu.image.shiftDown', 'Alt+Down'),
            click: () => {
              this.sendMenuCommand('shift-screen-down');
            }
          },
          { type: 'separator' },
          {
            label: '&Border On/Off', accelerator: this.accel('menu.image.toggleBorder', 'Ctrl+B'),
            click: () => {
              this.sendMenuCommand('toggle-border');
            }
          },
          {
            label: '&Grid On/Off', accelerator: this.accel('menu.image.toggleGrid', 'Ctrl+G'),
            click: () => {
              this.sendMenuCommand('toggle-grid');
            }
          },
          {
            label: 'Show &Transparency',
            accelerator: this.accel('menu.image.toggleTransparency', 'Ctrl+T'),
            type: 'checkbox',
            checked: this.showTransparency,
            click: (menuItem) => {
              this.showTransparency = menuItem.checked;
              this.sendMenuCommand('toggle-show-transparency', menuItem.checked);
            }
          },
          {
            label: 'Crop/Resize &Image', accelerator: this.accel('menu.image.cropResize', 'Ctrl+\\'),
            click: () => {
              this.sendMenuCommand('crop-screen');
            }
          },
          {
            label: 'Convert to &Mono', accelerator: this.accel('menu.image.convertMono', 'Ctrl+Shift+M'),
            click: () => {
              this.sendMenuCommand('convert-mono');
            }
          },
          {
            label: '&Clear Image', accelerator: this.accel('menu.image.clear', 'Shift+Home'),
            click: () => {
              this.sendMenuCommand('clear-screen');
            }
          },
          { type: 'separator' },
          {
            label: 'Make DirArt Safe',
            click: () => {
              this.sendMenuCommand('make-dirart-safe');
            }
          }

        ]
      },

      {
        label: '&Selection',
        submenu: [

          {
            label: 'Select &All', accelerator: this.accel('menu.selection.selectAll', 'Ctrl+A'),
            click: () => {
              this.sendMenuCommand('selection-select-all');
            }
          },
          { type: 'separator' },
          {
            label: 'Paste to &New Image', accelerator: this.accel('menu.selection.pasteToNewImage', 'Ctrl+N'),
            click: () => {
              this.sendMenuCommand('selection-paste-new');
            }
          },
          {
            label: '&Clear Selection', accelerator: this.accel('menu.selection.clear', 'Ctrl+Home'),
            click: () => {
              this.sendMenuCommand('selection-clear');
            }
          },
          { type: 'separator' },
          {
            label: 'Rotate &Left', accelerator: this.accel('menu.selection.rotateLeft', 'Ctrl+['),
            click: () => {
              this.sendMenuCommand('selection-rotate-left');
            }
          },
          {
            label: 'Rotate &Right', accelerator: this.accel('menu.selection.rotateRight', 'Ctrl+]'),
            click: () => {
              this.sendMenuCommand('selection-rotate-right');
            }
          },
          {
            label: 'Flip &Horizontally', accelerator: this.accel('menu.selection.flipHorizontal', 'H'),
            click: () => {
              this.sendMenuCommand('selection-flip-h');
            }
          },
          {
            label: 'Flip &Vertically', accelerator: this.accel('menu.selection.flipVertical', 'V'),
            click: () => {
              this.sendMenuCommand('selection-flip-v');
            }
          },
          { type: 'separator' },
          {
            label: '&Invert Characters', accelerator: this.accel('menu.selection.invert', 'Ctrl+I'),
            click: () => {
              this.sendMenuCommand('selection-invert');
            }
          }




        ]
      },
      {
        label: 'F&rames',
        submenu: [
          {
            label: 'Align All Frames x2 Zoom', accelerator: this.accel('menu.frames.alignAll2x', 'Ctrl+Alt+9'),
            click: () => {
              this.sendMenuCommand('align-frames-2x');
            }
          },
          { type: 'separator' },
          {
            label: 'Move Frame &Left in Stack', accelerator: this.accel('menu.frames.moveLeft', 'Ctrl+Left'),
            click: () => {
              this.sendMenuCommand('shift-frame-left');
            }
          },
          {
            label: 'Move Frame &Right in Stack', accelerator: this.accel('menu.frames.moveRight', 'Ctrl+Right'),
            click: () => {
              this.sendMenuCommand('shift-frame-right');
            }
          },
          { type: 'separator' },
          {
            label: '&Duplicate', accelerator: this.accel('menu.frames.duplicate', 'Insert'),
            click: () => {
              this.sendMenuCommand('duplicate-frame');
            }
          },
          {
            label: '&Remove', accelerator: this.accel('menu.frames.remove', 'Delete'),
            click: () => {
              this.sendMenuCommand('remove-frame');
            }
          }
        ]
      },
      {
        label: '&View',
        submenu: [
          {
            label: 'Zoom In', accelerator: this.accel('menu.view.zoomIn', 'Ctrl+='),
            click: () => {
              this.sendMenuCommand('zoom-in-left');
            }
          },
          {
            label: 'Zoom Out', accelerator: this.accel('menu.view.zoomOut', 'Ctrl+-'),
            click: () => {
              this.sendMenuCommand('zoom-out-left');
            }
          },
          { type: 'separator' },
          {
            label: 'Zoom x2 (Default)', accelerator: this.accel('menu.view.zoom2x', 'Ctrl+9'),
            click: () => {
              this.sendMenuCommand('zoom-2x-left');
            }
          },
          {
            label: 'Zoom x1', accelerator: this.accel('menu.view.zoom1x', 'Ctrl+0'),
            click: () => {
              this.sendMenuCommand('zoom-1x-left');
            }
          },
          { type: 'separator' },
          ...this.buildThemeMenuItems()
        ]
      },
      {
        label: '&Tools',
        submenu: [
          {
            label: '&Presets',
            submenu: this.buildPresetsSubmenu()
          },
          {
            label: 'Color Bars',
            submenu: this.buildColorBarsSubmenu()
          },
          { type: 'separator' },
          ...(!app.isPackaged
            ? [
              {
                label: '&Reload',
                accelerator: 'Ctrl+R',
                click: () => {
                  this.mainWindow.webContents.reload();
                }
              },
              {
                label: 'Toggle &Full Screen',
                accelerator: this.accel('menu.tools.toggleFullScreen', 'F11'),
                click: () => {
                  this.mainWindow.setFullScreen(
                    !this.mainWindow.isFullScreen()
                  );
                }
              },
              {
                label: 'Toggle &Developer Tools',
                accelerator: this.accel('menu.tools.toggleDevTools', 'Alt+Ctrl+I'),
                click: () => {
                  this.mainWindow.toggleDevTools();
                }
              }
            ]
            : [
              {
                label: 'Toggle &Full Screen',
                accelerator: this.accel('menu.tools.toggleFullScreen', 'F11'),
                click: () => {
                  this.mainWindow.setFullScreen(
                    !this.mainWindow.isFullScreen()
                  );
                }
              },
              {
                label: 'Toggle &Developer Tools',
                accelerator: this.accel('menu.tools.toggleDevTools', 'Alt+Ctrl+I'),
                click: () => {
                  this.mainWindow.toggleDevTools();
                }
              }
            ])
        ]
      },
      {
        label: '&Help',
        submenu: [
          {
            label: '&Documentation',
            accelerator: this.accel('menu.help.documentation', 'F1'),
            click() {
              shell.openExternal(
                'https://wbochar.com/petmate9/'
              );
            }
          },
          {
            label: '&Search Issues',
            accelerator: this.accel('menu.help.searchIssues', 'Ctrl+F1'),
            click() {
              shell.openExternal('https://github.com/wbochar/petmate9/issues');
            }
          },
          { type: 'separator' },
          {
            label: '&About',
            click() {
              app.setAboutPanelOptions({
                applicationName: 'Petmate 9',
                applicationVersion: app.getVersion(),
                copyright: 'Copyright (c) 2018-2020, Janne Hellsten',
                credits: ABOUT_PANEL_CREDITS,
              });
              app.showAboutPanel();
            }
          },
        ]
      }
    ];

    return templateDefault;
  }
}
