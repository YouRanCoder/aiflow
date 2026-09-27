import { describe, expect, it } from 'vitest'
import { computeTreeLayout, type LayoutInput } from './layout'

/** C语言指针 → 什么是地址 / 什么是指向；什么是地址 → 地址的运算 */
function sampleTree(): LayoutInput[] {
  return [
    { id: 'root', parentId: null, orderIndex: 0 },
    { id: 'addr', parentId: 'root', orderIndex: 0 },
    { id: 'deref', parentId: 'root', orderIndex: 1 },
    { id: 'arith', parentId: 'addr', orderIndex: 0 }
  ]
}

describe('computeTreeLayout', () => {
  it('同一棵树重复计算结果完全一致', () => {
    const a = computeTreeLayout(sampleTree())
    const b = computeTreeLayout(sampleTree())
    expect([...a.entries()]).toEqual([...b.entries()])
  })

  it('深度决定 x：父节点在子节点左侧', () => {
    const layout = computeTreeLayout(sampleTree())
    expect(layout.get('root')!.x).toBeLessThan(layout.get('addr')!.x)
    expect(layout.get('addr')!.x).toBeLessThan(layout.get('arith')!.x)
    expect(layout.get('addr')!.x).toBe(layout.get('deref')!.x)
  })

  it('叶子各占一行，父节点 y 取子节点中值', () => {
    const layout = computeTreeLayout(sampleTree())
    const arith = layout.get('arith')!
    const deref = layout.get('deref')!
    expect(arith.y).not.toBe(deref.y)

    const addr = layout.get('addr')!
    const root = layout.get('root')!
    expect(addr.y).toBe(arith.y)
    expect(root.y).toBe((addr.y + deref.y) / 2)
  })

  it('已拖拽过的节点保留坐标', () => {
    const nodes = sampleTree()
    nodes[1] = { ...nodes[1], posX: 10, posY: 20 }
    const layout = computeTreeLayout(nodes)
    expect(layout.get('addr')).toEqual({ x: 10, y: 20 })
  })

  it('父节点缺失的节点当作根处理，不会漏掉', () => {
    const layout = computeTreeLayout([{ id: 'orphan', parentId: 'missing' }])
    expect(layout.get('orphan')).toEqual({ x: 0, y: 0 })
  })
})
