import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFolderRelativePath } from './folderParser';

test('parseFolderRelativePath parses M01/completa correctly', () => {
  const res = parseFolderRelativePath('Drive_FrancoDroid/M01/completa/foto_topo.jpg');
  assert.equal(res.missionCode, 'M01');
  assert.equal(res.state, 'completa');
  assert.equal(res.fileName, 'foto_topo.jpg');
});

test('parseFolderRelativePath parses Missao 02/parcialmente correctly', () => {
  const res = parseFolderRelativePath('MinhaPasta/Missao 02/parcialmente/teste.png');
  assert.equal(res.missionCode, 'M02');
  assert.equal(res.state, 'parcial');
});

test('parseFolderRelativePath parses M03/incompleta correctly', () => {
  const res = parseFolderRelativePath('FLL_Season/M03/incompleta/falhou_garra.webp');
  assert.equal(res.missionCode, 'M03');
  assert.equal(res.state, 'incompleta');
});
