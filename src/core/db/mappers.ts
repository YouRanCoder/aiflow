import type { Anchor, Canvas, Message, MessageRole, Node, Quote, Turn } from '@shared/types/domain'

export interface CanvasRow {
  id: string
  title: string
  description: string | null
  rootNodeId: string | null
  providerId: string
  model: string
  paramsJson: string | null
  createdAt: number
  updatedAt: number
}

export interface TurnRow {
  id: string
  nodeId: string
  question: string
  orderIndex: number
  createdAt: number
  updatedAt: number
}

export interface NodeRow {
  id: string
  canvasId: string
  parentId: string | null
  title: string
  anchorJson: string | null
  quoteJson: string | null
  summary: string | null
  summaryCoversNodeId: string | null
  collapsed: number
  posX: number | null
  posY: number | null
  orderIndex: number
  createdAt: number
  updatedAt: number
}

export interface MessageRow {
  id: string
  turnId: string | null
  nodeId: string
  role: string
  content: string
  isActive: number
  providerId: string | null
  model: string | null
  usagePrompt: number
  usageCompletion: number
  usageCached: number
  error: string | null
  createdAt: number
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function toCanvas(row: CanvasRow): Canvas {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    rootNodeId: row.rootNodeId,
    providerId: row.providerId,
    model: row.model,
    params: parseJson<Record<string, unknown>>(row.paramsJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function toNode(row: NodeRow): Node {
  return {
    id: row.id,
    canvasId: row.canvasId,
    parentId: row.parentId,
    title: row.title,
    anchor: parseJson<Anchor>(row.anchorJson),
    quote: parseJson<Quote>(row.quoteJson),
    summary: row.summary,
    summaryCoversNodeId: row.summaryCoversNodeId,
    collapsed: row.collapsed === 1,
    posX: row.posX,
    posY: row.posY,
    orderIndex: row.orderIndex,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function toTurn(row: TurnRow): Turn {
  return {
    id: row.id,
    nodeId: row.nodeId,
    question: row.question,
    orderIndex: row.orderIndex,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    turnId: row.turnId ?? '',
    nodeId: row.nodeId,
    role: row.role as MessageRole,
    content: row.content,
    isActive: row.isActive === 1,
    providerId: row.providerId,
    model: row.model,
    usagePrompt: row.usagePrompt,
    usageCompletion: row.usageCompletion,
    usageCached: row.usageCached,
    error: row.error,
    createdAt: row.createdAt
  }
}
