import { describe, expect, it } from 'vitest'
import { branchTokensOf, canvasTokensOf, nodeTokensOf, sumUsage } from '@core/token/aggregate'
import { createStore, makeCanvas, makeMessage, makeNode, makeTurn } from '../../../tests/helpers'

function setup() {
  const canvas = makeCanvas({ id: 'c1' })
  const root = makeNode({ id: 'root', canvasId: 'c1', parentId: null, title: '指针' })
  const childA = makeNode({ id: 'childA', canvasId: 'c1', parentId: 'root', title: '地址' })
  const childB = makeNode({ id: 'childB', canvasId: 'c1', parentId: 'root', title: '指向' })
  const grand = makeNode({ id: 'grand', canvasId: 'c1', parentId: 'childA', title: '地址的运算' })

  const turns = [
    makeTurn({ id: 't-root-1', nodeId: 'root', orderIndex: 0 }),
    makeTurn({ id: 't-root-2', nodeId: 'root', orderIndex: 1 }),
    makeTurn({ id: 't-a-1', nodeId: 'childA', orderIndex: 0 }),
    makeTurn({ id: 't-b-1', nodeId: 'childB', orderIndex: 0 }),
    makeTurn({ id: 't-g-1', nodeId: 'grand', orderIndex: 0 })
  ]

  const messages = [
    makeMessage({ id: 'm1', turnId: 't-root-1', nodeId: 'root', usagePrompt: 100, usageCompletion: 50, usageCached: 20 }),
    makeMessage({ id: 'm2', turnId: 't-root-2', nodeId: 'root', usagePrompt: 100, usageCompletion: 50, usageCached: 20 }),
    makeMessage({ id: 'm3', turnId: 't-a-1', nodeId: 'childA', usagePrompt: 200, usageCompletion: 80, usageCached: 60 }),
    makeMessage({ id: 'm4', turnId: 't-b-1', nodeId: 'childB', usagePrompt: 300, usageCompletion: 90, usageCached: 0 }),
    makeMessage({ id: 'm5', turnId: 't-g-1', nodeId: 'grand', usagePrompt: 400, usageCompletion: 10, usageCached: 350 })
  ]

  return createStore({ canvases: [canvas], nodes: [root, childA, childB, grand], turns, messages })
}

describe('token 汇总', () => {
  it('sumUsage 累计各字段并计算 total', () => {
    const store = setup()
    const sum = sumUsage([...store.messages.values()])
    expect(sum.prompt).toBe(1100)
    expect(sum.completion).toBe(280)
    expect(sum.cached).toBe(450)
    expect(sum.total).toBe(1380)
  })

  it('话题 token = 它全部轮次之和（多轮会累加）', () => {
    const store = setup()
    const sum = nodeTokensOf('root', store)
    expect(sum.prompt).toBe(200)
    expect(sum.total).toBe(300)
  })

  it('分支总 token = 路径上所有话题的全部轮次之和', () => {
    const store = setup()
    const sum = branchTokensOf('grand', store)
    expect(sum.prompt).toBe(100 + 100 + 200 + 400)
    expect(sum.completion).toBe(50 + 50 + 80 + 10)
    expect(sum.cached).toBe(20 + 20 + 60 + 350)
  })

  it('同级分支互不影响', () => {
    const store = setup()
    const a = branchTokensOf('childA', store)
    const b = branchTokensOf('childB', store)
    expect(a.prompt).toBe(400)
    expect(b.prompt).toBe(500)
  })

  it('画布总 token = 全量之和', () => {
    const store = setup()
    const sum = canvasTokensOf('c1', store)
    expect(sum.total).toBe(1380)
  })
})
