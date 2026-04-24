
const { app, Menu, shell, nativeTheme } = require('electron');
const path = require('path');

const importers = [
  { label: '&D64 disk image (.d64)', cmd: 'import-d64' },
  { label: 'PETSCII (.&c)', cmd: 'import-marq-c' },
  { label: '&PNG (.png)', cmd: 'import-png' },
  { label: '&SEQ (.seq)', cmd: 'import-seq' },
  { label: 'Adv. &SEQ (.seq)', cmd: 'import-seq-adv' },
  { label: '&CBASE (.prg)', cmd: 'import-cbase' }
]

const exporters = [
  { label: '&Assembler source (.asm)', cmd: 'export-asm' },
  { label: '&BASIC (.bas)', cmd: 'export-basic' },
  { label: '&D64 disk image (.d64)', cmd: 'export-d64' },
  { label: '&Executable (.prg)', cmd: 'export-prg' },
  { label: '&GIF (.gif)', cmd: 'export-gif' },
  { label: '&JSON (.json)', cmd: 'export-json' },
  { label: 'PETSCII (.&c)', cmd: 'export-marq-c' },
  { label: '&PNG (.png)', cmd: 'export-png' },
  { label: '&SEQ (.seq)', cmd: 'export-seq' },
  { label: '&CBASE (.prg)', cmd: 'export-cbase' },
  { label: 'PE&T (.pet)', cmd: 'export-pet' },
  { label: 'Pet&mate Player (.prg)', cmd: 'export-prg-player', accelerator: 'CmdOrCtrl+Shift+X' }
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

// Platform preset groups the renderer keeps Box/Texture presets keyed by.
// The labels are what the user sees in the Tools > Presets menu; the `group`
// value is the key used both in the grouped Redux state and as the embedded
// ASCII marker in the exported screens.
const presetGroups = [
  { label: 'C64 / C128 40-col', group: 'c64' },
  { label: 'C16 / Plus/4',      group: 'c16' },
  { label: 'C128 VDC 80-col',   group: 'c128vdc' },
  { label: 'VIC-20',            group: 'vic20' },
  { label: 'PET',               group: 'pet' }
];



module.exports = class MenuBuilder {
  constructor(mainWindow, recentFiles, themeSource) {
    this.mainWindow = mainWindow;
    this.recentFiles = recentFiles || [];
    this.themeSource = themeSource || 'dark';
  }

  setRecentFiles(files) {
    this.recentFiles = files || [];
  }

  setThemeSource(source) {
    this.themeSource = source;
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

  mkExportCmd(label, cmd, accelerator) {
    const item = {
      label,
      click: () => {
        this.sendMenuCommand(cmd)
      }
    };
    if (accelerator) item.accelerator = accelerator;
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
              credits: 'Maintainer & Current Developer:\nWolfgang-Aaron Bochar',
            });
            app.showAboutPanel();
          }
        },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'Command+,',
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
          accelerator: 'Command+Q',
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

          label: 'New 40x25 Screen', accelerator: 'Command+T',
          submenu: importers.map(decl => this.mkImportCmd(decl.label, decl.cmd)),
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
          label: 'Open File...', accelerator: 'Command+O',
          click: () => {
            this.sendMenuCommand('open');
          }
        },
          { type: 'separator' },
        {
          label: 'Save', accelerator: 'Command+S',
          click: () => {
            this.sendMenuCommand('save');
          }
        },
        {
          label: 'Save As...', accelerator: 'Command+Shift+S',
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
              label: 'Send to Ultimate (&1)', accelerator: 'Command+Shift+1',
              click: () => {
                this.sendMenuCommand('send-ultimate');
              }
            },
            {
              label: 'Push to Ultimate (&3)', accelerator: 'Command+Shift+3',
              click: () => {
                this.sendMenuCommand('push-ultimate');
              }
            },
            { type: 'separator' },
            {
              label: 'Import Screen (&2)', accelerator: 'Command+Shift+2',
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
              label: 'Export D64 to Ultimate (&4)', accelerator: 'Command+Shift+4',
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
          submenu: exporters.map(decl => this.mkExportCmd(decl.label, decl.cmd, decl.accelerator))
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
          label: 'Undo', accelerator: 'Command+Z', selector: 'undo:',
          click: () => {
            this.sendMenuCommand('undo');
          }
        },
        {
          label: 'Redo', accelerator: 'Shift+Command+Z', selector: 'redo:',
          click: () => {
            this.sendMenuCommand('redo');
          }
        },
        { type: 'separator' },
        {
          label: 'Copy Frame', accelerator: 'Command+C',
          click: () => {
            this.sendMenuCommand('copy-frame');
          }
        },
        {
          label: 'Copy to Frame to PNG', accelerator: 'Shift+Command+C',
          click: () => {
            this.sendMenuCommand('copy-png');
          }
        },
        {
          label: 'Paste Frame', accelerator: 'Shift+Command+V',
          click: () => {
            this.sendMenuCommand('paste-frame');
          }
        },
        {
          label: 'Paste Text', accelerator: 'Alt+Command+V',
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
          label: 'Shift Left', accelerator: 'Alt+Left',
          click: () => {
            this.sendMenuCommand('shift-screen-left');
          }
        },
        {
          label: 'Shift Right', accelerator: 'Alt+Right',
          click: () => {
            this.sendMenuCommand('shift-screen-right');
          }
        },
        {
          label: 'Shift Up', accelerator: 'Alt+Up',
          click: () => {
            this.sendMenuCommand('shift-screen-up');
          }
        },
        {
          label: 'Shift Down', accelerator: 'Alt+Down',
          click: () => {
            this.sendMenuCommand('shift-screen-down');
          }
        },

        { type: 'separator' },
        {
          label: 'Border On/Off', accelerator: 'Command+B',
          click: () => {
            this.sendMenuCommand('toggle-border');
          }
        },
        {
          label: 'Grid On/Off', accelerator: 'Command+G',
          click: () => {
            this.sendMenuCommand('toggle-grid');
          }
        },
        {
          label: 'Crop/Resize Image', accelerator: 'Command+\\',
          click: () => {
            this.sendMenuCommand('crop-screen');
          }
        },
        {
          label: 'Convert to Mono', accelerator: 'Command+Shift+M',
          click: () => {
            this.sendMenuCommand('convert-mono');
          }
        },
        {
          label: 'Clear Image', accelerator: 'Shift+Home',
          click: () => {
            this.sendMenuCommand('clear-screen');
          }
        }




      ]
    };

    const subMenuSelection = {
      label: '&Selection',
      submenu: [

        {
          label: 'Select &All', accelerator: 'Command+A',
          click: () => {
            this.sendMenuCommand('selection-select-all');
          }
        },
        { type: 'separator' },
        {
          label: 'Paste to &New Image', accelerator: 'Command+N',
          click: () => {
            this.sendMenuCommand('selection-paste-new');
          }
        },
        {
          label: '&Clear Selection', accelerator: 'Command+Home',
          click: () => {
            this.sendMenuCommand('selection-clear');
          }
        },
        { type: 'separator' },
        {
          label: 'Rotate &Left', accelerator: 'Command+[',
          click: () => {
            this.sendMenuCommand('selection-rotate-left');
          }
        },
        {
          label: 'Rotate &Right', accelerator: 'Command+]',
          click: () => {
            this.sendMenuCommand('selection-rotate-right');
          }
        },
        {
          label: 'Flip &Horizontally', accelerator: 'H',
          click: () => {
            this.sendMenuCommand('selection-flip-h');
          }
        },
        {
          label: 'Flip &Vertically', accelerator: 'V',
          click: () => {
            this.sendMenuCommand('selection-flip-v');
          }
        },
        { type: 'separator' },
        {
          label: '&Invert Characters', accelerator: 'Command+I',
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
          accelerator: 'Ctrl+Command+F',
          click: () => {
            this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'Alt+Command+I',
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
          label: 'Align All Frames x2 Zoom', accelerator: 'Command+Alt+9',
          click: () => {
            this.sendMenuCommand('align-frames-2x');
          }
        },
        { type: 'separator' },
        {
          label: 'Move Frame &Left in Stack', accelerator: 'Command+Left',
          click: () => {
            this.sendMenuCommand('shift-frame-left');
          }
        },
        {
          label: 'Move Frame &Right in Stack', accelerator: 'Command+Right',
          click: () => {
            this.sendMenuCommand('shift-frame-right');
          }
        },
        { type: 'separator' },
        {
          label: '&Duplicate', accelerator: 'Insert',
          click: () => {
            this.sendMenuCommand('duplicate-frame');
          }
        },
        {
          label: '&Remove', accelerator: 'Delete',
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
          label: 'Zoom In', accelerator: 'Command+=',
          click: () => {
            this.sendMenuCommand('zoom-in-left');
          }
        },
        {
          label: 'Zoom Out', accelerator: 'Command+-',
          click: () => {
            this.sendMenuCommand('zoom-out-left');
          }
        },
        { type: 'separator' },
        {
          label: 'Zoom x2 (Default)', accelerator: 'Command+9',
          click: () => {
            this.sendMenuCommand('zoom-2x-left');
          }
        },
        {
          label: 'Zoom x1', accelerator: 'Command+0',
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
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: 'Ctrl+Command+F',
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
          click() {
            shell.openExternal(
              'https://wbochar.com/petmate9/'
            );
          }
        },
        {
          label: 'Search Issues',
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
        accelerator: 'CmdOrCtrl+Shift+D',
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
            label: 'New &40x25 Screen', accelerator: 'Ctrl+T',
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
            label: '&Open', accelerator: 'Ctrl+O',
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
            label: '&Save', accelerator: 'Ctrl+S',
            click: () => {
              this.sendMenuCommand('save');
            }
          },
          {
            label: 'Save &As...', accelerator: 'Ctrl+Shift+S',
            click: () => {
              this.sendMenuCommand('save-as');
            }
          },

          { type: 'separator' },
          {
            label: '&Ultimate',
            submenu: [
              {
                label: 'Send to Ultimate (&1)', accelerator: 'Ctrl+Shift+1',
                click: () => {
                  this.sendMenuCommand('send-ultimate');
                }
              },
              {
                label: 'Push to Ultimate (&3)', accelerator: 'Ctrl+Shift+3',
                click: () => {
                  this.sendMenuCommand('push-ultimate');
                }
              },
              { type: 'separator' },
              {
                label: 'Import Screen (&2)', accelerator: 'Ctrl+Shift+2',
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
                label: 'Export D64 to Ultimate (&4)', accelerator: 'Ctrl+Shift+4',
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
          submenu: exporters.map(decl => this.mkExportCmd(decl.label, decl.cmd, decl.accelerator))
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
            accelerator: 'CmdOrCtrl+Q',
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
            label: '&Undo', accelerator: 'Ctrl+Z', selector: 'undo:',
            click: () => {
              this.sendMenuCommand('undo');
            }
          },
          {
            label: '&Redo', accelerator: 'Ctrl+Y', selector: 'redo:',
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
            label: '&Copy Frame', accelerator: 'Ctrl+C',
            click: () => {
              this.sendMenuCommand('copy-frame');
            }
          },
          {
            label: 'Copy to Frame to PNG', accelerator: 'Shift+Ctrl+C',
            click: () => {
              this.sendMenuCommand('copy-png');
            }
          },
          {
            label: '&Paste Frame', accelerator: 'Ctrl+V',
            click: () => {
              this.sendMenuCommand('paste-frame');
            }
          },
          {
            label: 'Paste &Text', accelerator: 'Shift+Ctrl+V',
            click: () => {
              this.sendMenuCommand('paste-text');
            }
          },
          { type: 'separator' },
          {
            label: '&Preferences', accelerator: 'Ctrl+P',
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
            label: 'Shift &Left', accelerator: 'Alt+Left',
            click: () => {
              this.sendMenuCommand('shift-screen-left');
            }
          },
          {
            label: 'Shift &Right', accelerator: 'Alt+Right',
            click: () => {
              this.sendMenuCommand('shift-screen-right');
            }
          },
          {
            label: 'Shift &Up', accelerator: 'Alt+Up',
            click: () => {
              this.sendMenuCommand('shift-screen-up');
            }
          },
          {
            label: 'Shift &Down', accelerator: 'Alt+Down',
            click: () => {
              this.sendMenuCommand('shift-screen-down');
            }
          },
          { type: 'separator' },
          {
            label: '&Border On/Off', accelerator: 'Ctrl+B',
            click: () => {
              this.sendMenuCommand('toggle-border');
            }
          },
          {
            label: '&Grid On/Off', accelerator: 'Ctrl+G',
            click: () => {
              this.sendMenuCommand('toggle-grid');
            }
          },
          {
            label: 'Crop/Resize &Image', accelerator: 'Ctrl+\\',
            click: () => {
              this.sendMenuCommand('crop-screen');
            }
          },
          {
            label: '&Clear Image', accelerator: 'Shift+Home',
            click: () => {
              this.sendMenuCommand('clear-screen');
            }
          }

        ]
      },

      {
        label: '&Selection',
        submenu: [

          {
            label: 'Select &All', accelerator: 'Ctrl+A',
            click: () => {
              this.sendMenuCommand('selection-select-all');
            }
          },
          { type: 'separator' },
          {
            label: 'Paste to &New Image', accelerator: 'Ctrl+N',
            click: () => {
              this.sendMenuCommand('selection-paste-new');
            }
          },
          {
            label: '&Clear Selection', accelerator: 'Ctrl+Home',
            click: () => {
              this.sendMenuCommand('selection-clear');
            }
          },
          { type: 'separator' },
          {
            label: 'Rotate &Left', accelerator: 'Ctrl+[',
            click: () => {
              this.sendMenuCommand('selection-rotate-left');
            }
          },
          {
            label: 'Rotate &Right', accelerator: 'Ctrl+]',
            click: () => {
              this.sendMenuCommand('selection-rotate-right');
            }
          },
          {
            label: 'Flip &Horizontally', accelerator: 'H',
            click: () => {
              this.sendMenuCommand('selection-flip-h');
            }
          },
          {
            label: 'Flip &Vertically', accelerator: 'V',
            click: () => {
              this.sendMenuCommand('selection-flip-v');
            }
          },
          { type: 'separator' },
          {
            label: '&Invert Characters', accelerator: 'Ctrl+I',
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
            label: 'Align All Frames x2 Zoom', accelerator: 'Ctrl+Alt+9',
            click: () => {
              this.sendMenuCommand('align-frames-2x');
            }
          },
          { type: 'separator' },
          {
            label: 'Move Frame &Left in Stack', accelerator: 'Ctrl+Left',
            click: () => {
              this.sendMenuCommand('shift-frame-left');
            }
          },
          {
            label: 'Move Frame &Right in Stack', accelerator: 'Ctrl+Right',
            click: () => {
              this.sendMenuCommand('shift-frame-right');
            }
          },
          { type: 'separator' },
          {
            label: '&Duplicate', accelerator: 'Insert',
            click: () => {
              this.sendMenuCommand('duplicate-frame');
            }
          },
          {
            label: '&Remove', accelerator: 'Delete',
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
            label: 'Zoom In', accelerator: 'Ctrl+=',
            click: () => {
              this.sendMenuCommand('zoom-in-left');
            }
          },
          {
            label: 'Zoom Out', accelerator: 'Ctrl+-',
            click: () => {
              this.sendMenuCommand('zoom-out-left');
            }
          },
          { type: 'separator' },
          {
            label: 'Zoom x2 (Default)', accelerator: 'Ctrl+9',
            click: () => {
              this.sendMenuCommand('zoom-2x-left');
            }
          },
          {
            label: 'Zoom x1', accelerator: 'Ctrl+0',
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
                accelerator: 'F11',
                click: () => {
                  this.mainWindow.setFullScreen(
                    !this.mainWindow.isFullScreen()
                  );
                }
              },
              {
                label: 'Toggle &Developer Tools',
                accelerator: 'Alt+Ctrl+I',
                click: () => {
                  this.mainWindow.toggleDevTools();
                }
              }
            ]
            : [
              {
                label: 'Toggle &Full Screen',
                accelerator: 'F11',
                click: () => {
                  this.mainWindow.setFullScreen(
                    !this.mainWindow.isFullScreen()
                  );
                }
              },
              {
                label: 'Toggle &Developer Tools',
                accelerator: 'Alt+Ctrl+I',
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
            accelerator: 'F1',
            click() {
              shell.openExternal(
                'https://wbochar.com/petmate9/'
              );
            }
          },
          {
            label: '&Search Issues',
            accelerator: 'Ctrl+F1',
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
                credits: 'Maintainer & Current Developer:\nWolfgang-Aaron Bochar',
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
