import { describe, expect, it } from 'vitest'
import type { NodeWithTurns } from '@shared/types/domain'
import { makeMessage, makeNode, makeTurn } from '../../../../tests/helpers'
import { activeMessage, nodeFailed } from './turns'

function nodeWith(
  versions: Array<{ id: string; isActive: boolean; error?: string | null }>
): NodeWithTurns {
  const turn = makeTurn({ id: 'turn-1', nodeId: 'node-1' })
  return {
    ...makeNode({ id: 'node-1' }),
    turns: [
      {
        ...turn,
        messages: versions.map((version) =>
          makeMessage({
            id: version.id,
            turnId: turn.id,
            nodeId: 'node-1',
            content: version.error ? '' : '回答',
            isActive: version.isActive,
            error: version.error ?? null
          })
        )
      }
    ]
  }
}

describe('activeMessage', () => {
  it('优先取标记为 isActive 的那一版', () => {
    const node = nodeWith([
      { id: 'v1', isActive: false },
      { id: 'v2', isActive: true },
      { id: 'v3', isActive: false }
    ])
    expect(activeMessage(node.turns[0])?.id).toBe('v2')
  })

  it('没有任何标记时退回最后一条', () => {
    const node = nodeWith([
      { id: 'v1', isActive: false },
      { id: 'v2', isActive: false }
    ])
    expect(activeMessage(node.turns[0])?.id).toBe('v2')
  })

  it('没有回答时返回 null', () => {
    const node = nodeWith([])
    expect(activeMessage(node.turns[0])).toBeNull()
  })
})

describe('nodeFailed（失败状态跟随当前生效版本）', () => {
  it('v1 失败、v2 成功：不再算失败', () => {
    const node = nodeWith([
      { id: 'v1', isActive: false, error: 'AUTH: 无效密钥' },
      { id: 'v2', isActive: true }
    ])
    expect(nodeFailed(node)).toBe(false)
  })

  it('v1 成功、v2 失败：当前生效的是失败版本，算失败', () => {
    const node = nodeWith([
      { id: 'v1', isActive: false },
      { id: 'v2', isActive: true, error: 'RATE_LIMIT: 请求过于频繁' }
    ])
    expect(nodeFailed(node)).toBe(true)
  })

  it('没有轮次的话题不算失败', () => {
    expect(nodeFailed({ ...makeNode({ id: 'empty' }), turns: [] })).toBe(false)
  })

  it('只成功的话题不算失败', () => {
    expect(nodeFailed(nodeWith([{ id: 'v1', isActive: true }]))).toBe(false)
  })
})
