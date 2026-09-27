import { describe, expect, it } from 'vitest'
import { buildContext } from '@core/context/build'
import {
  codeAnchor,
  createStore,
  makeCanvas,
  makeMessage,
  makeNode,
  makeTurn,
  textQuote
} from '../../../tests/helpers'

/**
 * 话题树：
 *   C语言指针（2 轮）
 *   ├─ 什么是地址（1 轮）
 *   │   └─ 地址的运算（1 轮，引用父话题的「地址」）
 *   └─ 什么是指向（1 轮）
 */
function setup() {
  const canvas = makeCanvas({ id: 'c1' })

  const root = makeNode({
    id: 'root',
    canvasId: 'c1',
    parentId: null,
    title: 'C语言指针',
    anchor: codeAnchor('int *p = &a;')
  })
  const addr = makeNode({ id: 'addr', canvasId: 'c1', parentId: 'root', title: '什么是地址' })
  const deref = makeNode({ id: 'deref', canvasId: 'c1', parentId: 'root', title: '什么是指向' })
  const arith = makeNode({
    id: 'arith',
    canvasId: 'c1',
    parentId: 'addr',
    title: '地址的运算',
    quote: textQuote('地址', 'addr')
  })

  const turns = [
    makeTurn({ id: 't-root-1', nodeId: 'root', question: '指针是什么？', orderIndex: 0 }),
    makeTurn({ id: 't-root-2', nodeId: 'root', question: '指针占多少字节？', orderIndex: 1 }),
    makeTurn({ id: 't-addr-1', nodeId: 'addr', question: '什么是地址？', orderIndex: 0 }),
    makeTurn({ id: 't-deref-1', nodeId: 'deref', question: '什么是指向？', orderIndex: 0 }),
    makeTurn({ id: 't-arith-1', nodeId: 'arith', question: '地址能加减吗？', orderIndex: 0 })
  ]

  const messages = [
    makeMessage({ id: 'm-root-1', turnId: 't-root-1', nodeId: 'root', content: '指针是一个变量' }),
    makeMessage({ id: 'm-root-2', turnId: 't-root-2', nodeId: 'root', content: '取决于平台' }),
    makeMessage({ id: 'm-addr-1', turnId: 't-addr-1', nodeId: 'addr', content: '地址是内存编号' }),
    makeMessage({ id: 'm-deref-1', turnId: 't-deref-1', nodeId: 'deref', content: '指向是一种关联' })
  ]

  const store = createStore({ canvases: [canvas], nodes: [root, addr, deref, arith], turns, messages })
  return { store, root, addr, deref, arith }
}

function contentsOf(store: ReturnType<typeof setup>['store'], turnId: string): string[] {
  return buildContext(turnId, store).messages.map((message) => message.content)
}

describe('buildContext（话题 + 多轮）', () => {
  it('根话题：包含 system、根锚点与本轮问题', () => {
    const { store } = setup()
    const result = buildContext('t-root-1', store)
    expect(result.messages[0].role).toBe('system')
    expect(result.messages.some((m) => m.content.includes('int *p = &a;'))).toBe(true)
    expect(result.messages[result.messages.length - 1].content).toContain('指针是什么？')
  })

  it('同一话题里：该轮之前的问答会进上下文（多轮留在同一话题）', () => {
    const { store } = setup()
    const contents = contentsOf(store, 't-root-2')
    expect(contents.some((c) => c.includes('指针是什么？'))).toBe(true)
    expect(contents).toContain('指针是一个变量')
    expect(contents[contents.length - 1]).toContain('指针占多少字节？')
  })

  it('子话题：父话题的标题与它全部轮次都进上下文', () => {
    const { store } = setup()
    const contents = contentsOf(store, 't-addr-1')
    expect(contents.some((c) => c.includes('【话题】C语言指针'))).toBe(true)
    expect(contents.some((c) => c.includes('指针是什么？'))).toBe(true)
    expect(contents.some((c) => c.includes('指针占多少字节？'))).toBe(true)
    expect(contents).toContain('取决于平台')
  })

  it('兄弟话题互不污染', () => {
    const { store } = setup()
    const contents = contentsOf(store, 't-addr-1')
    expect(contents.some((c) => c.includes('什么是指向？'))).toBe(false)
    expect(contents.some((c) => c.includes('指向是一种关联'))).toBe(false)
  })

  it('兄弟话题共享祖先前缀（缓存友好）', () => {
    const { store } = setup()
    const a = buildContext('t-addr-1', store).messages
    const b = buildContext('t-deref-1', store).messages

    // 最后两条是「本轮话题块 + 本轮问题」，从那里开始才分叉
    expect(a.length).toBe(b.length)
    const shared = a.length - 2
    for (let i = 0; i < shared; i++) {
      expect(a[i]).toEqual(b[i])
    }
    expect(a[shared]).not.toEqual(b[shared])
    expect(a[shared].content).toContain('什么是地址')
    expect(b[shared].content).toContain('什么是指向')
  })

  it('引用（来自父话题的选中文字）出现在话题块里', () => {
    const { store } = setup()
    const contents = contentsOf(store, 't-arith-1')
    expect(contents.some((c) => c.includes('引用自父话题') && c.includes('地址'))).toBe(true)
    expect(contents[contents.length - 1]).toContain('地址能加减吗？')
  })

  it('compact：祖先话题被摘要替换，且可还原', () => {
    const { store, addr } = setup()
    addr.summary = '此前对话：解释了指针与地址。'
    addr.summaryCoversNodeId = 'root'

    const compacted = contentsOf(store, 't-arith-1')
    expect(compacted.some((c) => c.startsWith('[压缩后的历史摘要]'))).toBe(true)
    expect(compacted.some((c) => c.includes('指针是什么？'))).toBe(false)

    addr.summary = null
    addr.summaryCoversNodeId = null
    const restored = contentsOf(store, 't-arith-1')
    expect(restored.some((c) => c.includes('指针是什么？'))).toBe(true)
    expect(restored.some((c) => c.startsWith('[压缩后的历史摘要]'))).toBe(false)
  })

  it('失败或空的回答不进入上下文', () => {
    const { store } = setup()
    store.turns.set('t-fail', makeTurn({ id: 't-fail', nodeId: 'addr', question: '失败的一轮', orderIndex: 1 }))
    store.messages.set(
      'm-fail',
      makeMessage({ id: 'm-fail', turnId: 't-fail', nodeId: 'addr', content: '', error: 'AUTH: 无效密钥' })
    )

    const contents = contentsOf(store, 't-arith-1')
    expect(contents.some((c) => c.includes('失败的一轮'))).toBe(false)
  })
})
