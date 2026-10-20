/**
 * AutoGrid floor-grid generation (pure, unit tested). Centimetres throughout.
 *
 * A room that doesn't divide evenly by the spacing gets partial cells along the
 * right and bottom edges, e.g. 430 cm at 50 cm = 8 full columns + one 30 cm column.
 */

export const GRID_SPACINGS = [25, 50, 100]; // cm
export const DEFAULT_SPACING = 50;

const EPS = 1e-6;

export function generateGrid(widthCm, lengthCm, spacingCm = DEFAULT_SPACING) {
  if (![widthCm, lengthCm, spacingCm].every((v) => Number.isFinite(v) && v > 0)) {
    throw new RangeError('Room width, length and grid spacing must be positive numbers.');
  }
  if (spacingCm > Math.max(widthCm, lengthCm)) {
    throw new RangeError('The grid spacing is larger than the room.');
  }
  const axis = (size) => {
    const full = Math.floor(size / spacingCm + EPS);
    const rest = size - full * spacingCm;
    const partial = rest > 0.05 ? Math.round(rest * 10) / 10 : 0; // ignore sub-millimetre float noise
    const lines = [];
    for (let k = 1; k <= full; k++) {
      const v = k * spacingCm;
      if (v < size - 0.05) lines.push(v);
    }
    return { full, partial, count: full + (partial ? 1 : 0), lines };
  };
  const cols = axis(widthCm);
  const rows = axis(lengthCm);
  const fullCells = cols.full * rows.full;
  const cells = cols.count * rows.count;
  return {
    spacing: spacingCm,
    width: widthCm,
    length: lengthCm,
    cols: cols.count,
    rows: rows.count,
    fullCols: cols.full,
    fullRows: rows.full,
    partialColWidth: cols.partial, // cm, 0 if the width divides evenly
    partialRowLength: rows.partial,
    cells,
    fullCells,
    partialCells: cells - fullCells,
    xLines: cols.lines,
    yLines: rows.lines,
    area: (widthCm * lengthCm) / 10000, // m²
  };
}

/** Human summary used on the AutoGrid page. */
export function describeGrid(g) {
  const parts = [`${g.cols} columns × ${g.rows} rows = ${g.cells} cells of ${g.spacing} cm`];
  const partial = [];
  if (g.partialColWidth) partial.push(`last column ${g.partialColWidth} cm wide`);
  if (g.partialRowLength) partial.push(`last row ${g.partialRowLength} cm long`);
  if (partial.length) parts.push(`${g.partialCells} partial edge cells (${partial.join(', ')})`);
  return parts.join('; ');
}

/** Snap a furniture footprint's left/top edge to the nearest grid line. */
export function snapEdgeToGrid(center, size, spacing) {
  const edge = center - size / 2;
  return Math.round(edge / spacing) * spacing + size / 2;
}
