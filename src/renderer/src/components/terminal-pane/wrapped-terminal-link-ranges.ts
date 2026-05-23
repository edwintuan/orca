import type { IBufferLine, IBufferRange } from '@xterm/xterm'

type TerminalBufferLineWithColumns = IBufferLine & {
  translateToString(
    trimRight?: boolean,
    startColumn?: number,
    endColumn?: number,
    outColumns?: number[]
  ): string
}

type WrappedLogicalRow = {
  y: number
  text: string
  columns: number[]
  startIndex: number
  isWrapped: boolean
  lineLength: number
}

export type WrappedLogicalLine = {
  text: string
  rows: WrappedLogicalRow[]
  fingerprint: string
}

function translateLineWithCells(line: IBufferLine): { text: string; columns: number[] } | null {
  let text = ''
  const columns: number[] = []
  let endColumn = 0

  for (let x = 0; x < line.length; x++) {
    const cell = line.getCell(x)
    if (!cell) {
      return null
    }

    const width = cell.getWidth()
    if (width === 0) {
      continue
    }

    const chars = cell.getChars() || ' '
    text += chars
    for (let i = 0; i < chars.length; i++) {
      columns.push(x)
    }
    endColumn = x + Math.max(width, 1)
  }

  columns.push(endColumn)
  return { text, columns }
}

function translateLineWithColumns(line: IBufferLine): { text: string; columns: number[] } {
  const columns: number[] = []
  const text = (line as TerminalBufferLineWithColumns).translateToString(
    false,
    0,
    undefined,
    columns
  )

  if (columns.length === text.length + 1) {
    return { text, columns }
  }

  const cellTranslation = translateLineWithCells(line)
  if (cellTranslation) {
    return cellTranslation
  }

  return {
    text,
    columns: Array.from({ length: text.length + 1 }, (_value, index) => index)
  }
}

export function buildWrappedLogicalLine(
  buffer: { getLine(y: number): IBufferLine | undefined },
  bufferLineNumber: number
): WrappedLogicalLine | null {
  const y = bufferLineNumber - 1
  if (!buffer.getLine(y)) {
    return null
  }

  let startY = y
  while (startY > 0 && buffer.getLine(startY)?.isWrapped) {
    startY--
  }

  let endY = y
  while (buffer.getLine(endY + 1)?.isWrapped) {
    endY++
  }

  let text = ''
  const rows: WrappedLogicalRow[] = []
  for (let rowY = startY; rowY <= endY; rowY++) {
    const line = buffer.getLine(rowY)
    if (!line) {
      return null
    }
    const translated = translateLineWithColumns(line)
    rows.push({
      y: rowY,
      text: translated.text,
      columns: translated.columns,
      startIndex: text.length,
      isWrapped: line.isWrapped,
      lineLength: line.length
    })
    text += translated.text
  }

  const fingerprint = rows
    .map((row) => `${row.y}:${row.isWrapped ? 1 : 0}:${row.lineLength}:${row.text}`)
    .join('\n')
  return { text, rows, fingerprint }
}

function mapLogicalIndexToBufferPosition(
  logicalLine: WrappedLogicalLine,
  index: number,
  bias: 'start' | 'end'
): { x: number; y: number } | null {
  for (let rowIndex = 0; rowIndex < logicalLine.rows.length; rowIndex++) {
    const row = logicalLine.rows[rowIndex]
    const rowStart = row.startIndex
    const rowEnd = rowStart + row.text.length
    const isTarget =
      bias === 'start'
        ? index < rowEnd || (index === rowEnd && rowIndex === logicalLine.rows.length - 1)
        : index <= rowEnd && (index > rowStart || rowIndex === 0)

    if (!isTarget) {
      continue
    }

    const localIndex = Math.max(0, Math.min(index - rowStart, row.columns.length - 1))
    const column = row.columns[localIndex] ?? localIndex
    return { x: column, y: row.y + 1 }
  }

  return null
}

export function rangeForParsedFileLink(
  logicalLine: WrappedLogicalLine,
  startIndex: number,
  endIndex: number
): IBufferRange | null {
  const start = mapLogicalIndexToBufferPosition(logicalLine, startIndex, 'start')
  const end = mapLogicalIndexToBufferPosition(logicalLine, endIndex, 'end')
  if (!start || !end) {
    return null
  }

  return {
    // Why: xterm's link hit-test uses 1-based inclusive coordinates, while
    // parsed file links use zero-based half-open string indexes.
    start: { x: start.x + 1, y: start.y },
    end: { x: end.x, y: end.y }
  }
}
