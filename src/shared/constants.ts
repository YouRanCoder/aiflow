export const APP_NAME = 'Aiflow'
export const APP_DIR_NAME = '.aiflow'

export const IPC = {
  appPing: 'app:ping',

  configGet: 'config:get',
  configSet: 'config:set',

  secretsStatus: 'secrets:status',
  secretsSet: 'secrets:set',
  secretsRemove: 'secrets:remove',
  secretsAvailable: 'secrets:available',

  providersListModels: 'providers:list-models',
  providersTest: 'providers:test',
  providersDelete: 'providers:delete',

  canvasCreate: 'canvas:create',
  canvasList: 'canvas:list',
  canvasGet: 'canvas:get',
  canvasUpdate: 'canvas:update',
  canvasRename: 'canvas:rename',
  canvasDelete: 'canvas:delete',

  nodeCreate: 'node:create',
  nodeRename: 'node:rename',
  nodeCompact: 'node:compact',
  nodeUncompact: 'node:uncompact',
  nodeDelete: 'node:delete',
  nodeCollapse: 'node:collapse',
  nodeMove: 'node:move',

  turnAdd: 'turn:add',
  turnAsk: 'turn:ask',
  turnGenerate: 'turn:generate',
  turnRegenerate: 'turn:regenerate',
  turnDelete: 'turn:delete',
  turnPromote: 'turn:promote',
  turnSetActiveMessage: 'turn:set-active-message',

  tokensCanvas: 'tokens:canvas',
  tokensBranch: 'tokens:branch',
  tokensNode: 'tokens:node',

  generateCancel: 'generate:cancel',

  streamChunk: 'stream:chunk',
  streamDone: 'stream:done',
  streamError: 'stream:error'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
