// AutoGrid grid generation tests. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGrid, generateGrid, snapEdgeToGrid } from '../src/autogrid/gridGenerator.js';

test('4 × 3 m room at 50 cm -> 8 × 6 = 48 cells', () => {
  const g = generateGrid(400, 300, 50);
  assert.equal(g.cols, 8);
  assert.equal(g.rows, 6);
  assert.equal(g.cells, 48);
  assert.equal(g.partialCells, 0);
  assert.equal(g.area, 12);
  assert.deepEqual(g.xLines, [50, 100, 150, 200, 250, 300, 350]);
  assert.equal(g.yLines.length, 5);
});

test('changing spacing changes the grid', () => {
  assert.equal(generateGrid(400, 300, 25).cells, 16 * 12);
  assert.equal(generateGrid(400, 300, 100).cells, 4 * 3);
});

test('non-integer dimensions produce partial edge cells', () => {
  const g = generateGrid(430, 355, 50);
  assert.equal(g.fullCols, 8);
  assert.equal(g.cols, 9);
  assert.equal(g.partialColWidth, 30);
  assert.equal(g.fullRows, 7);
  assert.equal(g.rows, 8);
  assert.equal(g.partialRowLength, 5);
  assert.equal(g.cells, 72);
  assert.equal(g.fullCells, 56);
  assert.equal(g.partialCells, 16);
  assert.match(describeGrid(g), /last column 30 cm wide/);
});

test('float noise does not create phantom partial cells', () => {
  const g = generateGrid(420.00000001, 350, 50);
  assert.equal(g.cols, 9); // 420 = 8 × 50 + 20
  assert.equal(g.partialColWidth, 20);
  assert.equal(generateGrid(300.0000001, 300, 100).partialCells, 0);
});

test('proportional: a 5 × 3 m room has more columns than a 3 × 3 m room', () => {
  const wide = generateGrid(500, 300, 50);
  const square = generateGrid(300, 300, 50);
  assert.ok(wide.cols > square.cols);
  assert.equal(wide.rows, square.rows);
  assert.equal(wide.width / wide.length, 5 / 3);
});

test('invalid inputs throw clear errors', () => {
  assert.throws(() => generateGrid(0, 300, 50), RangeError);
  assert.throws(() => generateGrid(400, 300, -1), RangeError);
  assert.throws(() => generateGrid(40, 30, 50), /larger than the room/);
});

test('snap aligns a footprint edge to the grid', () => {
  // chair 83 cm wide centred at 117: left edge 75.5 -> nearest grid line 100
  assert.equal(snapEdgeToGrid(117, 83, 50), 100 + 41.5);
  assert.equal(snapEdgeToGrid(140, 80, 50), 100 + 40);
});
