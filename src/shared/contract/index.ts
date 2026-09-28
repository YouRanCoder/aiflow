import { z } from 'zod'
import { IPC } from '../constants'

export const AnchorSchema = z.union([
  z.object({
    kind: z.literal('code'),
    file: z.string().optional(),
    startLine: z.number().int().optional(),
    endLine: z.number().int().optional(),
    language: z.string().optional(),
    code: z.string(),
    note: z.string().optional()
  }),
  z.object({
    kind: z.literal('text'),
    text: z.string(),
    source: z.string().optional()
  })
])

export const QuoteSchema = z.object({
  parentNodeId: z.string().min(1),
  text: z.string(),
  messageId: z.string().optional(),
  start: z.number().int().optional(),
  end: z.number().int().optional()
})

export const SamplingParamsSchema = z.object({
  temperature: z.number().optional(),
  topP: z.number().optional(),
  maxTokens: z.number().int().positive().optional()
})

export const ProviderConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  baseURL: z.string().min(1),
  defaultModel: z.string().optional(),
  models: z.array(z.string()).optional(),
  params: SamplingParamsSchema.optional(),
  contextWindow: z.number().int().positive().optional()
})

export const UiConfigSchema = z.object({
  skin: z.enum(['graph', 'tree', 'file-tree']),
  theme: z.enum(['system', 'light', 'dark']),
  sidebarWidth: z.number().positive().optional(),
  detailWidth: z.number().positive().optional(),
  sidebarCollapsed: z.boolean().optional(),
  detailCollapsed: z.boolean().optional()
})

export const AppConfigSchema = z.object({
  version: z.number().int(),
  providers: z.array(ProviderConfigSchema),
  defaultProviderId: z.string().optional(),
  systemPrompt: z.string().optional(),
  ui: UiConfigSchema,
  logging: z.object({ debug: z.boolean().optional() }).optional()
})

export const requestSchemas = {
  [IPC.appPing]: z.void().optional(),
  [IPC.configGet]: z.void().optional(),
  [IPC.configSet]: AppConfigSchema.partial(),
  [IPC.secretsAvailable]: z.void().optional(),
  [IPC.secretsStatus]: z.object({ providerId: z.string().min(1) }),
  [IPC.secretsSet]: z.object({ providerId: z.string().min(1), key: z.string().min(1) }),
  [IPC.secretsRemove]: z.object({ providerId: z.string().min(1) }),
  [IPC.providersListModels]: z.object({ providerId: z.string().min(1) }),
  [IPC.providersTest]: z.object({ providerId: z.string().min(1) }),
  [IPC.providersDelete]: z.object({ providerId: z.string().min(1) }),
  [IPC.canvasCreate]: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    providerId: z.string().optional(),
    model: z.string().optional()
  }),
  [IPC.canvasList]: z.void().optional(),
  [IPC.canvasGet]: z.object({ id: z.string().min(1) }),
  [IPC.canvasUpdate]: z.object({
    id: z.string().min(1),
    providerId: z.string().min(1),
    model: z.string()
  }),
  [IPC.canvasRename]: z.object({ id: z.string().min(1), title: z.string().min(1) }),
  [IPC.canvasDelete]: z.object({ id: z.string().min(1) }),
  [IPC.nodeCreate]: z.object({
    canvasId: z.string().min(1),
    parentId: z.string().min(1).nullable(),
    title: z.string().min(1),
    quote: QuoteSchema.nullable().optional(),
    anchor: AnchorSchema.nullable().optional()
  }),
  [IPC.nodeRename]: z.object({ nodeId: z.string().min(1), title: z.string().min(1) }),
  [IPC.nodeCompact]: z.object({ nodeId: z.string().min(1) }),
  [IPC.nodeUncompact]: z.object({ nodeId: z.string().min(1) }),
  [IPC.nodeDelete]: z.object({ nodeId: z.string().min(1) }),
  [IPC.nodeCollapse]: z.object({ nodeId: z.string().min(1), collapsed: z.boolean() }),
  [IPC.turnAdd]: z.object({ nodeId: z.string().min(1), question: z.string().min(1) }),
  [IPC.turnAsk]: z.object({ nodeId: z.string().min(1), question: z.string().min(1) }),
  [IPC.turnGenerate]: z.object({ turnId: z.string().min(1) }),
  [IPC.turnRegenerate]: z.object({ turnId: z.string().min(1) }),
  [IPC.turnDelete]: z.object({ turnId: z.string().min(1) }),
  [IPC.turnPromote]: z.object({ turnId: z.string().min(1) }),
  [IPC.turnMergeToParent]: z.object({ turnId: z.string().min(1) }),
  [IPC.turnSetActiveMessage]: z.object({
    turnId: z.string().min(1),
    messageId: z.string().min(1)
  }),
  [IPC.nodeMove]: z.object({
    nodeId: z.string().min(1),
    x: z.number(),
    y: z.number()
  }),
  [IPC.tokensCanvas]: z.object({ canvasId: z.string().min(1) }),
  [IPC.tokensBranch]: z.object({ nodeId: z.string().min(1) }),
  [IPC.tokensNode]: z.object({ nodeId: z.string().min(1) }),
  [IPC.generateCancel]: z.object({ turnId: z.string().min(1) })
} as const satisfies Record<string, z.ZodTypeAny>

export type RequestSchemas = typeof requestSchemas

export interface ApiError {
  code: string
  message: string
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

export interface StreamChunkEvent {
  turnId: string
  nodeId: string
  messageId: string
  delta: string
}

export interface StreamDoneEvent {
  turnId: string
  nodeId: string
  messageId: string
}

export interface StreamErrorEvent {
  turnId: string
  nodeId: string
  messageId: string
  code: string
  message: string
}
