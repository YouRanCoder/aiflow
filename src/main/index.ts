import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { IPC } from '@shared/constants'
import type { StreamChunkEvent, StreamDoneEvent, StreamErrorEvent } from '@shared/contract'
import { closeDb, openDb } from '@core/db'
import { dbPath, ensureAppDir } from '@core/paths'
import { createSession } from './services/session'
import { resolveCredentials } from './services/credentials'
import { registerIpc } from './ipc'

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0f19',
    title: 'Aiflow',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.on('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

app.whenReady().then(() => {
  ensureAppDir()
  const db = openDb(dbPath())

  mainWindow = createWindow()

  const send = (channel: string, payload: unknown): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload)
    }
  }

  const session = createSession({
    db,
    sink: {
      chunk: (e: StreamChunkEvent) => send(IPC.streamChunk, e),
      done: (e: StreamDoneEvent) => send(IPC.streamDone, e),
      error: (e: StreamErrorEvent) => send(IPC.streamError, e)
    },
    credentials: resolveCredentials
  })

  registerIpc(session)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})
