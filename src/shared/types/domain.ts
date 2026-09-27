export type Anchor =
  | {
      kind: 'code'
      file?: string
      startLine?: number
      endLine?: number
      language?: string
      code: string
      note?: string
    }
  | {
      kind: 'text'
      text: string
      source?: string
    }

export interface Quote {
  parentNodeId: string
  text: string
  messageId?: string
  start?: number
  end?: number
}

export interface Canvas {
  id: string
  title: string
  description: string | null
  rootNodeId: string | null
  providerId: string
  model: string
  params: Record<string, unknown> | null
  createdAt: number
  updatedAt: number
}

/** 节点 = 话题容器：有一个话题标题，里面可以承载多轮问答 */
export interface Node {
  id: string
  canvasId: string
  parentId: string | null
  title: string
  anchor: Anchor | null
  quote: Quote | null
  summary: string | null
  summaryCoversNodeId: string | null
  collapsed: boolean
  posX: number | null
  posY: number | null
  orderIndex: number
  createdAt: number
  updatedAt: number
}

/** 一轮问答的提问；回答（含多版本）挂在 turn 上 */
export interface Turn {
  id: string
  nodeId: string
  question: string
  orderIndex: number
  createdAt: number
  updatedAt: number
}

export type MessageRole = 'assistant' | 'system' | 'tool'

export interface Message {
  id: string
  turnId: string
  /** 冗余保留，便于按节点查询 */
  nodeId: string
  role: MessageRole
  content: string
  isActive: boolean
  providerId: string | null
  model: string | null
  usagePrompt: number
  usageCompletion: number
  usageCached: number
  error: string | null
  createdAt: number
}

export interface TokenSum {
  prompt: number
  completion: number
  cached: number
  total: number
}

export type KeyStatus =
  | { providerId: string; hasKey: true; masked: string }
  | { providerId: string; hasKey: false }

export type Skin = 'graph' | 'tree' | 'file-tree'

export interface TurnWithMessages extends Turn {
  messages: Message[]
}

export interface NodeWithTurns extends Node {
  turns: TurnWithMessages[]
}

export interface CanvasDetail {
  canvas: Canvas
  nodes: NodeWithTurns[]
  tokens: TokenSum
}
