export interface LayoutInput {
  id: string
  parentId: string | null
  orderIndex?: number
  posX?: number | null
  posY?: number | null
}

export interface LayoutOptions {
  columnWidth?: number
  rowHeight?: number
}

export interface Point {
  x: number
  y: number
}

/**
 * 左→右的确定性树布局：深度决定 x，叶子按中序分配行号、父节点取子节点行号中值。
 * 已经手工拖拽过（posX/posY 有值）的节点保持原位。同一棵树重复计算结果一致。
 */
export function computeTreeLayout(
  nodes: LayoutInput[],
  options: LayoutOptions = {}
): Map<string, Point> {
  const columnWidth = options.columnWidth ?? 280
  const rowHeight = options.rowHeight ?? 110

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const children = new Map<string | null, LayoutInput[]>()
  for (const node of nodes) {
    const key = node.parentId && byId.has(node.parentId) ? node.parentId : null
    const list = children.get(key) ?? []
    list.push(node)
    children.set(key, list)
  }
  for (const list of children.values()) {
    list.sort((a, b) => {
      const ao = a.orderIndex ?? 0
      const bo = b.orderIndex ?? 0
      if (ao !== bo) return ao - bo
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
  }

  const depth = new Map<string, number>()
  const row = new Map<string, number>()
  const seen = new Set<string>()
  let nextRow = 0

  function visit(node: LayoutInput, level: number): number {
    if (seen.has(node.id)) return row.get(node.id) ?? 0
    seen.add(node.id)
    depth.set(node.id, level)

    const kids = children.get(node.id) ?? []
    if (kids.length === 0) {
      const index = nextRow
      nextRow += 1
      row.set(node.id, index)
      return index
    }

    const rows = kids.map((kid) => visit(kid, level + 1))
    const index = (rows[0] + rows[rows.length - 1]) / 2
    row.set(node.id, index)
    return index
  }

  for (const root of children.get(null) ?? []) visit(root, 0)

  const result = new Map<string, Point>()
  for (const node of nodes) {
    if (typeof node.posX === 'number' && typeof node.posY === 'number') {
      result.set(node.id, { x: node.posX, y: node.posY })
      continue
    }
    result.set(node.id, {
      x: (depth.get(node.id) ?? 0) * columnWidth,
      y: (row.get(node.id) ?? 0) * rowHeight
    })
  }
  return result
}
