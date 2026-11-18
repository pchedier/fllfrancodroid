import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFolderRelativePath, validateMissionReference } from './folderParser';

test('parseFolderRelativePath parses M01/completa correctly', () => {
  const res = parseFolderRelativePath('Drive_FrancoDroid/M01/completa/foto_topo.jpg');
  assert.equal(res.isValid, true);
  assert.equal(res.missionCode, 'M01');
  assert.equal(res.state, 'completa');
  assert.equal(res.fileName, 'foto_topo.jpg');
});

test('parseFolderRelativePath parses Missao 02/parcialmente correctly', () => {
  const res = parseFolderRelativePath('MinhaPasta/Missao 02/parcialmente/teste.png');
  assert.equal(res.isValid, true);
  assert.equal(res.missionCode, 'M02');
  assert.equal(res.state, 'parcial');
});

test('parseFolderRelativePath parses M03/incompleta correctly', () => {
  const res = parseFolderRelativePath('FLL_Season/M03/incompleta/falhou_garra.webp');
  assert.equal(res.isValid, true);
  assert.equal(res.missionCode, 'M03');
  assert.equal(res.state, 'incompleta');
});

test('parseFolderRelativePath parses explicit point folders like 2 sementes 20 pontos', () => {
  const res = parseFolderRelativePath('Tapete/M02/2 sementes 20 pontos/foto.jpg');
  assert.equal(res.isValid, true);
  assert.equal(res.missionCode, 'M02');
  assert.equal(res.state, 'parcial');
  assert.equal(res.points, 20);
});

test('parseFolderRelativePath rejects missing mission folder or invalid subfolder names', () => {
  const noMission = parseFolderRelativePath('FotosGerais/completa/foto.jpg');
  assert.equal(noMission.isValid, false);

  const looseFile = parseFolderRelativePath('Tapete/M01/foto.jpg');
  assert.equal(looseFile.isValid, false);

  const badSubfolder = parseFolderRelativePath('Tapete/M02/pasta_aleatoria/foto.jpg');
  assert.equal(badSubfolder.isValid, false);

  const outOfRange = parseFolderRelativePath('Tapete/M99/completa/foto.jpg');
  assert.equal(outOfRange.isValid, false);
});

test('validateMissionReference requires at least 2 states/tiers', () => {
  const incomplete = validateMissionReference({
    missionCode: 'M02',
    completaFiles: [{ name: 'a.jpg' }],
    parcialFiles: [],
    incompletaFiles: [],
    pointTiers: { completa: { label: 'completa', points: 30, files: [{ name: 'a.jpg' }] } },
  });
  assert.equal(incomplete.isValid, false);

  const valid = validateMissionReference({
    missionCode: 'M02',
    completaFiles: [{ name: 'a.jpg' }],
    parcialFiles: [{ name: 'b.jpg' }],
    incompletaFiles: [],
    pointTiers: {
      completa: { label: '3 sementes completa', points: 30, files: [{ name: 'a.jpg' }] },
      '20pts': { label: '2 sementes 20 pontos', points: 20, files: [{ name: 'b.jpg' }] },
    },
  });
  assert.equal(valid.isValid, true);
});
