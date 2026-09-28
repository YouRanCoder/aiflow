import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openDb, type Db } from '@core/db'
import { createSession, type Session } from '../src/main/services/session'

interface MockServer {
  url: string
  close: () => Promise<void>
  requests: Array<{ model: string; messages: Array<{ role: string; content: string }> }>
}

function startMockServer(reply = '你好，这是回答。'): Promise<MockServer> {
  const requests: MockServer['requests'] = []

  const server: Server = createServer((req, res) => {
    if (req.url?.endsWith('/chat/completions')) {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        const parsed = JSON.parse(body) as {
          model: string
          messages: Array<{ role: string; content: string }>
        }
        requests.push(parsed)

        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        const half = Math.ceil(reply.length / 2)
        const chunks = [reply.slice(0, half), reply.slice(half)].filter(Boolean)
        for (const piece of chunks) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`)
        }
        res.write(
          `data: ${JSON.stringify({
            choices: [],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 20,
              prompt_tokens_details: { cached_tokens: 30 }
            }
          })}\n\n`
        )
        res.write('data: [DONE]\n\n')
        res.end()
      })
      return
    }
    if (req.url?.endsWith('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ data: [{ id: 'mock-model' }] }))
      return
    }
    res.writeHead(404)
    res.end()
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({
        url: `http://127.0.0.1:${port}/v1`,
        requests,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done())
          })
      })
    })
  })
}

describe('会话服务集成（Mock OpenAI）', () => {
  let mock: MockServer
  let db: Db
  let session: Session
  let chunks: string[]
  let completed: Array<() => void>

  beforeAll(async () => {
    mock = await startMockServer()
    db = openDb(':memory:')
    chunks = []
    completed = []

    session = createSession({
      db,
      credentials: () => ({ baseURL: mock.url, apiKey: 'test-key', params: { temperature: 0 } }),
      sink: {
        chunk: (e) => chunks.push(e.delta),
        done: () => completed.forEach((fn) => fn()),
        error: () => completed.forEach((fn) => fn())
      }
    })
  })

  afterAll(async () => {
    await mock.close()
  })

  function waitForGeneration(): Promise<void> {
    return new Promise((resolve) => completed.push(resolve))
  }

  it('createNode 只搭结构：不产生轮次、不请求模型', () => {
    const canvas = session.createCanvas({ title: '骨架', providerId: 'test', model: 'mock-model' })
    const requestsBefore = mock.requests.length

    const root = session.createNode({ canvasId: canvas.id, parentId: null, title: 'C语言指针' })
    const child = session.createNode({
      canvasId: canvas.id,
      parentId: root.nodeId,
      title: '什么是地址'
    })

    expect(session.turnsByNode(root.nodeId).length).toBe(0)
    expect(session.turnsByNode(child.nodeId).length).toBe(0)
    expect(mock.requests.length).toBe(requestsBefore)

    const detail = session.getCanvasDetail(canvas.id)
    expect(detail.canvas.rootNodeId).toBe(root.nodeId)
    expect(detail.nodes.find((n) => n.id === child.nodeId)?.parentId).toBe(root.nodeId)
    expect(detail.nodes.length).toBe(2)
  })

  it('同一话题里可以连续多轮，回答都留在该话题', async () => {
    const canvas = session.createCanvas({ title: '多轮', providerId: 'test', model: 'mock-model' })
    const { nodeId } = session.createNode({ canvasId: canvas.id, parentId: null, title: '指针' })

    session.askTurn({ nodeId, question: '第一轮问题' })
    await waitForGeneration()
    session.askTurn({ nodeId, question: '第二轮问题' })
    await waitForGeneration()

    const detail = session.getCanvasDetail(canvas.id)
    const node = detail.nodes.find((n) => n.id === nodeId)
    expect(node?.turns.length).toBe(2)
    expect(node?.turns.every((turn) => turn.messages.length === 1)).toBe(true)
    expect(detail.tokens.total).toBe(240)

    // 第二轮的上下文包含第一轮
    const lastRequest = mock.requests[mock.requests.length - 1]
    expect(lastRequest.messages.some((m) => m.content.includes('第一轮问题'))).toBe(true)
    expect(lastRequest.messages.some((m) => m.content.includes('第二轮问题'))).toBe(true)
  })

  it('addTurn 只加轮次不生成；generateTurn 补出该轮回答', async () => {
    const canvas = session.createCanvas({ title: '补生成', providerId: 'test', model: 'mock-model' })
    const { nodeId } = session.createNode({ canvasId: canvas.id, parentId: null, title: '指针' })

    const requestsBefore = mock.requests.length
    const { turnId } = session.addTurn({ nodeId, question: '指针是什么' })
    expect(mock.requests.length).toBe(requestsBefore)
    expect(session.messagesByTurn(turnId).length).toBe(0)

    session.generateTurn(turnId)
    await waitForGeneration()

    expect(session.messagesByTurn(turnId).length).toBe(1)
    expect(session.repos.messageRepo.getActiveByTurn(turnId)?.content).toBe('你好，这是回答。')
    expect(session.getCanvasDetail(canvas.id).tokens.total).toBe(120)
  })

  it('子话题的上下文包含父话题全部轮次，兄弟互不影响', async () => {
    const canvas = session.createCanvas({ title: '分支', providerId: 'test', model: 'mock-model' })
    const root = session.createNode({ canvasId: canvas.id, parentId: null, title: '根话题' })
    session.askTurn({ nodeId: root.nodeId, question: '根问题一' })
    await waitForGeneration()
    session.askTurn({ nodeId: root.nodeId, question: '根问题二' })
    await waitForGeneration()

    const addr = session.createNode({ canvasId: canvas.id, parentId: root.nodeId, title: '地址' })
    const deref = session.createNode({ canvasId: canvas.id, parentId: root.nodeId, title: '指向' })

    session.askTurn({ nodeId: addr.nodeId, question: '子问题A' })
    await waitForGeneration()
    session.askTurn({ nodeId: deref.nodeId, question: '子问题B' })
    await waitForGeneration()

    const addrRequest = mock.requests[mock.requests.length - 2]
    expect(addrRequest.messages.some((m) => m.content.includes('根问题一'))).toBe(true)
    expect(addrRequest.messages.some((m) => m.content.includes('根问题二'))).toBe(true)
    expect(addrRequest.messages.some((m) => m.content.includes('子问题A'))).toBe(true)
    expect(addrRequest.messages.some((m) => m.content.includes('子问题B'))).toBe(false)

    const derefRequest = mock.requests[mock.requests.length - 1]
    expect(derefRequest.messages.some((m) => m.content.includes('子问题A'))).toBe(false)
  })

  it('重生成保留历史版本并切换 active（按轮）', async () => {
    const canvas = session.createCanvas({ title: '重生成', providerId: 'test', model: 'mock-model' })
    const { nodeId } = session.createNode({ canvasId: canvas.id, parentId: null, title: '话题' })
    const { turnId } = session.askTurn({ nodeId, question: '问题' })
    await waitForGeneration()

    const before = session.messagesByTurn(turnId)
    expect(before.length).toBe(1)

    session.regenerate(turnId)
    await waitForGeneration()

    const after = session.messagesByTurn(turnId)
    expect(after.length).toBe(2)
    expect(after.filter((m) => m.isActive).length).toBe(1)

    session.setActiveMessage(turnId, before[0].id)
    expect(session.repos.messageRepo.getActiveByTurn(turnId)?.id).toBe(before[0].id)
  })

  it('compact 压缩祖先话题，uncompact 还原', async () => {
    const canvas = session.createCanvas({ title: '压缩', providerId: 'test', model: 'mock-model' })
    const root = session.createNode({ canvasId: canvas.id, parentId: null, title: '根' })
    session.askTurn({ nodeId: root.nodeId, question: '根问题' })
    await waitForGeneration()

    const child = session.createNode({ canvasId: canvas.id, parentId: root.nodeId, title: '子' })
    session.askTurn({ nodeId: child.nodeId, question: '子问题' })
    await waitForGeneration()

    await session.compact(child.nodeId)
    const node = session.repos.nodeRepo.get(child.nodeId)
    expect(node?.summary).toBeTruthy()
    expect(node?.summaryCoversNodeId).toBe(root.nodeId)

    session.uncompact(child.nodeId)
    expect(session.repos.nodeRepo.get(child.nodeId)?.summary).toBeNull()
  })

  it('把某一轮转为子话题：轮次与回答一起移过去，原话题只剩其它轮', async () => {
    const canvas = session.createCanvas({ title: '提升', providerId: 'test', model: 'mock-model' })
    const root = session.createNode({ canvasId: canvas.id, parentId: null, title: '指针' })

    session.askTurn({ nodeId: root.nodeId, question: '第一轮问题' })
    await waitForGeneration()
    const second = session.askTurn({ nodeId: root.nodeId, question: '它占多少字节' })
    await waitForGeneration()

    const requestsBefore = mock.requests.length
    const { nodeId: childId } = session.promoteTurn(second.turnId)
    expect(mock.requests.length).toBe(requestsBefore)

    const detail = session.getCanvasDetail(canvas.id)
    const rootNode = detail.nodes.find((n) => n.id === root.nodeId)
    const childNode = detail.nodes.find((n) => n.id === childId)

    // 原话题只剩第一轮，且顺序被压紧
    expect(rootNode?.turns.map((t) => t.question)).toEqual(['第一轮问题'])
    expect(rootNode?.turns[0].orderIndex).toBe(0)

    // 新子话题带着那一轮和它的回答
    expect(childNode?.parentId).toBe(root.nodeId)
    expect(childNode?.title).toBe('它占多少字节')
    expect(childNode?.turns.map((t) => t.question)).toEqual(['它占多少字节'])
    expect(childNode?.turns[0].messages.length).toBe(1)
    // 冗余列跟着改：否则删子树/按话题查询会漏
    expect(childNode?.turns[0].messages[0].nodeId).toBe(childId)
    expect(rootNode?.turns[0].messages[0].nodeId).toBe(root.nodeId)

    // token 总量不变，只是换了归属
    expect(detail.tokens.total).toBe(240)
  })

  it('合并到父话题：轮次追加到父话题末尾，原话题还有其它轮就保留', async () => {
    const canvas = session.createCanvas({ title: '合并', providerId: 'test', model: 'mock-model' })
    const root = session.createNode({ canvasId: canvas.id, parentId: null, title: '指针' })
    session.askTurn({ nodeId: root.nodeId, question: '根问题' })
    await waitForGeneration()

    const child = session.createNode({ canvasId: canvas.id, parentId: root.nodeId, title: '地址' })
    session.askTurn({ nodeId: child.nodeId, question: '子问题一' })
    await waitForGeneration()
    const second = session.askTurn({ nodeId: child.nodeId, question: '子问题二' })
    await waitForGeneration()

    const requestsBefore = mock.requests.length
    const result = session.mergeTurnToParent(second.turnId)
    expect(mock.requests.length).toBe(requestsBefore)
    // 话题没变空，所以位置不动
    expect(result.nodeId).toBe(child.nodeId)

    const detail = session.getCanvasDetail(canvas.id)
    const rootNode = detail.nodes.find((n) => n.id === root.nodeId)
    const childNode = detail.nodes.find((n) => n.id === child.nodeId)

    // 追加到父话题末尾，而不是插到最前
    expect(rootNode?.turns.map((t) => t.question)).toEqual(['根问题', '子问题二'])
    expect(rootNode?.turns.map((t) => t.orderIndex)).toEqual([0, 1])

    expect(childNode?.turns.map((t) => t.question)).toEqual(['子问题一'])
    expect(childNode?.turns[0].orderIndex).toBe(0)

    // 冗余列跟着改，否则删子树/按话题查询会漏
    expect(rootNode?.turns[1].messages[0].nodeId).toBe(root.nodeId)
    // token 总量不变，只是换了归属
    expect(detail.tokens.total).toBe(360)
  })

  it('合并后话题变空则一并删除，不留空壳节点', async () => {
    const canvas = session.createCanvas({ title: '合并删空', providerId: 'test', model: 'mock-model' })
    const root = session.createNode({ canvasId: canvas.id, parentId: null, title: '根' })
    const child = session.createNode({ canvasId: canvas.id, parentId: root.nodeId, title: '子' })
    const { turnId } = session.askTurn({ nodeId: child.nodeId, question: '子问题' })
    await waitForGeneration()

    const result = session.mergeTurnToParent(turnId)

    expect(result.nodeId).toBe(root.nodeId)
    expect(session.repos.nodeRepo.get(child.nodeId)).toBeUndefined()

    const rootNode = session.getCanvasDetail(canvas.id).nodes.find((n) => n.id === root.nodeId)
    expect(rootNode?.turns.map((t) => t.question)).toEqual(['子问题'])
    expect(rootNode?.turns[0].messages[0].nodeId).toBe(root.nodeId)
  })

  it('有子话题的话题即使没有轮次也不会被删掉', async () => {
    const canvas = session.createCanvas({ title: '带子保留', providerId: 'test', model: 'mock-model' })
    const root = session.createNode({ canvasId: canvas.id, parentId: null, title: '根' })
    const mid = session.createNode({ canvasId: canvas.id, parentId: root.nodeId, title: '中间' })
    session.createNode({ canvasId: canvas.id, parentId: mid.nodeId, title: '叶子' })
    const { turnId } = session.askTurn({ nodeId: mid.nodeId, question: '中间问题' })
    await waitForGeneration()

    const result = session.mergeTurnToParent(turnId)

    expect(result.nodeId).toBe(mid.nodeId)
    expect(session.repos.nodeRepo.get(mid.nodeId)).toBeTruthy()
  })

  it('根话题没有父话题可以合并', () => {
    const canvas = session.createCanvas({ title: '根合并', providerId: 'test', model: 'mock-model' })
    const root = session.createNode({ canvasId: canvas.id, parentId: null, title: '根' })
    const { turnId } = session.addTurn({ nodeId: root.nodeId, question: '根问题' })

    expect(() => session.mergeTurnToParent(turnId)).toThrow('根话题没有父话题可以合并')
  })

  it('删除某一轮后，话题内剩余轮次顺序被压紧', async () => {
    const canvas = session.createCanvas({ title: '删轮次', providerId: 'test', model: 'mock-model' })
    const root = session.createNode({ canvasId: canvas.id, parentId: null, title: '话题' })
    const first = session.askTurn({ nodeId: root.nodeId, question: 'A' })
    await waitForGeneration()
    session.askTurn({ nodeId: root.nodeId, question: 'B' })
    await waitForGeneration()

    session.deleteTurn(first.turnId)

    const turns = session.turnsByNode(root.nodeId)
    expect(turns.map((t) => t.question)).toEqual(['B'])
    expect(turns[0].orderIndex).toBe(0)
  })

  it('删除话题子树级联清理轮次与消息', async () => {
    const canvas = session.createCanvas({ title: '删除', providerId: 'test', model: 'mock-model' })
    const root = session.createNode({ canvasId: canvas.id, parentId: null, title: '根' })
    const { turnId } = session.askTurn({ nodeId: root.nodeId, question: '根问题' })
    await waitForGeneration()

    const child = session.createNode({ canvasId: canvas.id, parentId: root.nodeId, title: '子' })
    const childTurn = session.askTurn({ nodeId: child.nodeId, question: '子问题' })
    await waitForGeneration()

    session.deleteSubtree(root.nodeId)

    expect(session.repos.nodeRepo.get(root.nodeId)).toBeUndefined()
    expect(session.repos.nodeRepo.get(child.nodeId)).toBeUndefined()
    expect(session.messagesByTurn(turnId).length).toBe(0)
    expect(session.messagesByTurn(childTurn.turnId).length).toBe(0)
    expect(session.turnsByNode(child.nodeId).length).toBe(0)
  })

  it('删除 Provider 时把引用它的画布改接到新 Provider', () => {
    const canvas = session.createCanvas({ title: '改接', providerId: 'gone', model: 'old-model' })
    const intact = session.createCanvas({ title: '不受影响', providerId: 'test', model: 'mock-model' })

    expect(session.repos.canvasRepo.retargetProvider('gone', 'test', 'mock-model')).toBe(1)

    expect(session.repos.canvasRepo.get(canvas.id)?.providerId).toBe('test')
    expect(session.repos.canvasRepo.get(canvas.id)?.model).toBe('mock-model')
    expect(session.repos.canvasRepo.get(intact.id)?.providerId).toBe('test')
    expect(session.repos.canvasRepo.retargetProvider('gone', 'test', 'mock-model')).toBe(0)
  })
})
