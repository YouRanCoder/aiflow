import type { Anchor, Canvas, Message, Node, Quote, Turn } from '@shared/types/domain'

let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

export function makeCanvas(overrides: Partial<Canvas> = {}): Canvas {
  return {
    id: overrides.id ?? nextId('canvas'),
    title: '测试画布',
    description: null,
    rootNodeId: null,
    providerId: 'test',
    model: 'test-model',
    params: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  }
}

export function makeNode(overrides: Partial<Node> & { id?: string } = {}): Node {
  return {
    id: overrides.id ?? nextId('node'),
    canvasId: overrides.canvasId ?? 'canvas-1',
    parentId: overrides.parentId ?? null,
    title: overrides.title ?? '话题',
    anchor: overrides.anchor ?? null,
    quote: overrides.quote ?? null,
    summary: overrides.summary ?? null,
    summaryCoversNodeId: overrides.summaryCoversNodeId ?? null,
    collapsed: overrides.collapsed ?? false,
    posX: overrides.posX ?? null,
    posY: overrides.posY ?? null,
    orderIndex: overrides.orderIndex ?? 0,
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0
  }
}

export function makeTurn(overrides: Partial<Turn> & { id?: string } = {}): Turn {
  return {
    id: overrides.id ?? nextId('turn'),
    nodeId: overrides.nodeId ?? 'node-1',
    question: overrides.question ?? '问题',
    orderIndex: overrides.orderIndex ?? 0,
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0
  }
}

export function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: overrides.id ?? nextId('msg'),
    turnId: overrides.turnId ?? 'turn-1',
    nodeId: overrides.nodeId ?? 'node-1',
    role: overrides.role ?? 'assistant',
    content: overrides.content ?? '回答',
    isActive: overrides.isActive ?? true,
    providerId: overrides.providerId ?? 'test',
    model: overrides.model ?? 'test-model',
    usagePrompt: overrides.usagePrompt ?? 0,
    usageCompletion: overrides.usageCompletion ?? 0,
    usageCached: overrides.usageCached ?? 0,
    error: overrides.error ?? null,
    createdAt: overrides.createdAt ?? 0
  }
}

export interface TestStore {
  nodes: Map<string, Node>
  turns: Map<string, Turn>
  messages: Map<string, Message>
  canvases: Map<string, Canvas>
  get(id: string): Node | undefined
  getNode(id: string): Node | undefined
  ancestors(nodeId: string): Node[]
  byCanvas(canvasId: string): Node[]
  getTurn(id: string): Turn | undefined
  turnsByNode(nodeId: string): Turn[]
  getActiveByTurn(turnId: string): Message | undefined
  activeMessagesOfNode(nodeId: string): Message[]
  getCanvas(id: string): Canvas | undefined
}

export function createStore(seeds?: {
  nodes?: Node[]
  turns?: Turn[]
  messages?: Message[]
  canvases?: Canvas[]
}): TestStore {
  const nodes = new Map((seeds?.nodes ?? []).map((node) => [node.id, node]))
  const turns = new Map((seeds?.turns ?? []).map((turn) => [turn.id, turn]))
  const messages = new Map((seeds?.messages ?? []).map((message) => [message.id, message]))
  const canvases = new Map((seeds?.canvases ?? []).map((canvas) => [canvas.id, canvas]))

  const get = (id: string): Node | undefined => nodes.get(id)

  const ancestors = (nodeId: string): Node[] => {
    const node = nodes.get(nodeId)
    if (!node) return []
    const chain: Node[] = []
    let cursor = node.parentId
    while (cursor) {
      const current = nodes.get(cursor)
      if (!current) break
      chain.push(current)
      cursor = current.parentId
    }
    return chain.reverse()
  }

  const byCanvas = (canvasId: string): Node[] =>
    [...nodes.values()].filter((node) => node.canvasId === canvasId)

  const getTurn = (id: string): Turn | undefined => turns.get(id)

  const turnsByNode = (nodeId: string): Turn[] =>
    [...turns.values()]
      .filter((turn) => turn.nodeId === nodeId)
      .sort((a, b) => a.orderIndex - b.orderIndex || a.createdAt - b.createdAt)

  const getActiveByTurn = (turnId: string): Message | undefined =>
    [...messages.values()].find((message) => message.turnId === turnId && message.isActive)

  const activeMessagesOfNode = (nodeId: string): Message[] =>
    turnsByNode(nodeId)
      .map((turn) => getActiveByTurn(turn.id))
      .filter((message): message is Message => Boolean(message))

  return {
    nodes,
    turns,
    messages,
    canvases,
    get,
    getNode: get,
    ancestors,
    byCanvas,
    getTurn,
    turnsByNode,
    getActiveByTurn,
    activeMessagesOfNode,
    getCanvas: (id: string): Canvas | undefined => canvases.get(id)
  }
}

export function codeAnchor(code: string): Anchor {
  return { kind: 'code', code, language: 'c' }
}

export function textQuote(text: string, parentNodeId: string): Quote {
  return { parentNodeId, text }
}
