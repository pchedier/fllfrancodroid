import React, { useState } from 'react';
import {
  FolderKanban,
  Plus,
  Trash2,
  Edit2,
  Download,
  Upload,
  Search,
  CheckCircle,
  FileCode,
  Shield,
  Clock,
  Layers,
  X,
  PlusCircle,
  AlertCircle,
} from 'lucide-react';
import { Mission, ScoringCriterion } from '../types/fll';
import { StorageService } from '../services/storageService';

interface MissionsViewProps {
  missions: Mission[];
  onAddMission: (mission: Mission) => void;
  onUpdateMission: (mission: Mission) => void;
  onDeleteMission: (id: string) => void;
  onMissionsImported: () => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const MissionsView: React.FC<MissionsViewProps> = ({
  missions,
  onAddMission,
  onUpdateMission,
  onDeleteMission,
  onMissionsImported,
  onShowToast,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [maxScore, setMaxScore] = useState<number>(20);
  const [partialScore, setPartialScore] = useState<number>(10);
  const [zone, setZone] = useState('');
  const [recommendedAttachment, setRecommendedAttachment] = useState('');
  const [riskLevel, setRiskLevel] = useState<'Baixo' | 'Médio' | 'Alto'>('Médio');
  const [estimatedDurationSeconds, setEstimatedDurationSeconds] = useState<number>(15);
  const [criteria, setCriteria] = useState<ScoringCriterion[]>([]);
  const [newCriterionDesc, setNewCriterionDesc] = useState('');
  const [newCriterionPoints, setNewCriterionPoints] = useState<number>(10);

  // Open modal for new mission
  const handleOpenNewModal = () => {
    setEditingMissionId(null);
    const nextCodeNum = missions.length + 1;
    setCode(`M${String(nextCodeNum).padStart(2, '0')}`);
    setName('');
    setDescription('');
    setMaxScore(30);
    setPartialScore(15);
    setZone('Centro');
    setRecommendedAttachment('Garra Frontal');
    setRiskLevel('Médio');
    setEstimatedDurationSeconds(15);
    setCriteria([]);
    setIsModalOpen(true);
  };

  // Open modal to edit
  const handleOpenEditModal = (mission: Mission) => {
    setEditingMissionId(mission.id);
    setCode(mission.code);
    setName(mission.name);
    setDescription(mission.description || '');
    setMaxScore(mission.maxScore);
    setPartialScore(mission.partialScore || 0);
    setZone(mission.zone || '');
    setRecommendedAttachment(mission.recommendedAttachment || '');
    setRiskLevel(mission.riskLevel || 'Médio');
    setEstimatedDurationSeconds(mission.estimatedDurationSeconds || 15);
    setCriteria(mission.criteria || []);
    setIsModalOpen(true);
  };

  // Add criterion to current modal
  const handleAddCriterion = () => {
    if (!newCriterionDesc.trim()) return;
    const newCrit: ScoringCriterion = {
      id: `crit_${Date.now()}`,
      description: newCriterionDesc.trim(),
      points: Number(newCriterionPoints) || 0,
    };
    setCriteria([...criteria, newCrit]);
    setNewCriterionDesc('');
    setNewCriterionPoints(10);
  };

  const handleRemoveCriterion = (id: string) => {
    setCriteria(criteria.filter((c) => c.id !== id));
  };

  // Save mission
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      onShowToast('Código e nome da missão são obrigatórios.', 'error');
      return;
    }

    const missionPayload: Mission = {
      id: editingMissionId || `mission_${Date.now()}`,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description.trim(),
      maxScore: Number(maxScore) || 0,
      partialScore: Number(partialScore) || 0,
      zone: zone.trim() || 'Tapete Geral',
      recommendedAttachment: recommendedAttachment.trim(),
      riskLevel,
      estimatedDurationSeconds: Number(estimatedDurationSeconds) || 15,
      criteria,
    };

    if (editingMissionId) {
      onUpdateMission(missionPayload);
      onShowToast(`Missão ${missionPayload.code} atualizada!`, 'success');
    } else {
      onAddMission(missionPayload);
      onShowToast(`Missão ${missionPayload.code} cadastrada com sucesso!`, 'success');
    }

    setIsModalOpen(false);
  };

  // Export JSON
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(missions, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `francodroid_fll_missoes_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    onShowToast('Arquivo JSON de missões exportado com sucesso!', 'success');
  };

  // Import JSON
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = StorageService.importMissionsOnly(content);
      if (res.success) {
        onMissionsImported();
        onShowToast(res.message, 'success');
      } else {
        onShowToast(res.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Download template JSON for user
  const handleDownloadTemplate = () => {
    const template = [
      {
        code: 'M01',
        name: 'Nome da Missão Oficial',
        description: 'Descrição dos critérios e objetivos da missão no tapete oficial',
        maxScore: 30,
        partialScore: 15,
        zone: 'Lado Leste / Centro',
        recommendedAttachment: 'Garra Ativa',
        riskLevel: 'Médio',
        estimatedDurationSeconds: 15,
        criteria: [
          { id: 'c1', description: 'Ativação completa da alavanca', points: 20 },
          { id: 'c2', description: 'Peça de bônus entregue no alvo', points: 10 }
        ]
      }
    ];
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(template, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = 'fll_missoes_template.json';
    a.click();
    a.remove();
  };

  const filteredMissions = missions.filter(
    (m) =>
      m.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.zone && m.zone.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-cyan-400" />
            Gerenciamento de Missões FLL
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Cadastre as missões oficiais da temporada, critérios de pontuação, zonas e ferramentas.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Import JSON */}
          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer border border-slate-700 transition-all">
            <Upload className="w-4 h-4 text-cyan-400" />
            <span>Importar JSON</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>

          {/* Export JSON */}
          {missions.length > 0 && (
            <button
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Exportar</span>
            </button>
          )}

          {/* Add Mission button */}
          <button
            onClick={handleOpenNewModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Missão</span>
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      {missions.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código (ex: M01), nome ou zona do tapete..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-cyan-500"
            />
          </div>
          <span className="text-xs text-slate-400 font-mono shrink-0">
            {filteredMissions.length} de {missions.length} missões
          </span>
        </div>
      )}

      {/* Missions Grid or Empty State */}
      {missions.length === 0 ? (
        <div className="p-12 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-950/40 border border-cyan-700/40 flex items-center justify-center text-cyan-400">
            <FolderKanban className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white">Nenhuma missão cadastrada no banco de dados</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
            Para garantir precisão competitiva, não incluímos missões fictícias. Cadastre as missões oficiais
            da sua temporada da FIRST LEGO League ou importe um arquivo JSON com as regras da mesa.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={handleOpenNewModal}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Primeira Missão</span>
            </button>
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              <span>Baixar Modelo JSON</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMissions.map((mission) => (
            <div
              key={mission.id}
              className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/80">
                      {mission.code}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        mission.riskLevel === 'Alto'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800/50'
                          : mission.riskLevel === 'Baixo'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                          : 'bg-amber-950 text-amber-300 border border-amber-800/50'
                      }`}
                    >
                      Risco {mission.riskLevel || 'Médio'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleOpenEditModal(mission)}
                      aria-label={`Editar missão ${mission.code}`}
                      className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Deseja realmente excluir a missão ${mission.code} - ${mission.name}?`)) {
                          onDeleteMission(mission.id);
                          onShowToast(`Missão ${mission.code} excluída.`, 'info');
                        }
                      }}
                      aria-label={`Excluir missão ${mission.code}`}
                      className="p-1.5 hover:bg-rose-950/60 rounded-lg text-slate-400 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-white text-sm mt-1">{mission.name}</h3>

                {mission.description && (
                  <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                    {mission.description}
                  </p>
                )}

                {/* Criteria items */}
                {mission.criteria && mission.criteria.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                      Critérios de Pontuação:
                    </span>
                    {mission.criteria.map((c) => (
                      <div
                        key={c.id}
                        className="text-[11px] text-slate-300 flex items-center justify-between bg-slate-950/60 px-2 py-1 rounded"
                      >
                        <span className="truncate pr-2">• {c.description}</span>
                        <span className="text-cyan-400 font-mono font-bold shrink-0">
                          +{c.points} pts
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom Card Footer */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 text-[11px]">Pontuação: </span>
                  <span className="text-cyan-400 font-mono font-bold">{mission.maxScore} pts</span>
                  {mission.partialScore !== undefined && (
                    <span className="text-slate-500 text-[10px] font-mono">
                      {' '}
                      (Parcial: {mission.partialScore})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-slate-400 text-[11px] font-mono">
                  <Clock className="w-3 h-3 text-emerald-400" />
                  <span>~{mission.estimatedDurationSeconds || 15}s</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mission Form Modal (Add / Edit) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-cyan-400" />
                {editingMissionId ? `Editar Missão ${code}` : 'Cadastrar Nova Missão Oficial'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Código */}
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Código Oficial (ex: M01) *
                  </label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="M01"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Nome */}
                <div className="sm:col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">
                    Nome da Missão *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Coral Reef / Energia Solar / Kraken"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Descrição e Condições de Vitória
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Critérios oficiais de pontuação da regra do desafio FLL..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Pontuações */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Pontos Máximos *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={maxScore}
                    onChange={(e) => setMaxScore(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-cyan-300 font-mono font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Pontos Parciais
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={partialScore}
                    onChange={(e) => setPartialScore(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-300 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Tempo Estimado (s)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={estimatedDurationSeconds}
                    onChange={(e) => setEstimatedDurationSeconds(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-300 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Nível de Risco</label>
                  <select
                    value={riskLevel}
                    onChange={(e) => setRiskLevel(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Baixo">Baixo</option>
                    <option value="Médio">Médio</option>
                    <option value="Alto">Alto</option>
                  </select>
                </div>
              </div>

              {/* Zona & Garra recomendada */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Zona do Tapete</label>
                  <input
                    type="text"
                    value={zone}
                    onChange={(e) => setZone(e.target.value)}
                    placeholder="Ex: Zona Leste, Centro, Área de Lançamento"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Garra / Mecanismo Recomendado
                  </label>
                  <input
                    type="text"
                    value={recommendedAttachment}
                    onChange={(e) => setRecommendedAttachment(e.target.value)}
                    placeholder="Ex: Garra Frontal Motorizada, Empurrador Passivo"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Critérios dinâmicos */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <span className="text-slate-300 font-semibold block">
                  Critérios de Pontuação Específicos
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCriterionDesc}
                    onChange={(e) => setNewCriterionDesc(e.target.value)}
                    placeholder="Descrição do sub-critério (ex: Alavanca totalmente descida)"
                    className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs"
                  />
                  <input
                    type="number"
                    value={newCriterionPoints}
                    onChange={(e) => setNewCriterionPoints(Number(e.target.value))}
                    className="w-16 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-cyan-300 font-mono text-center text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddCriterion}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 font-medium text-xs shrink-0"
                  >
                    + Critério
                  </button>
                </div>

                {criteria.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {criteria.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between text-xs bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800"
                      >
                        <span className="text-slate-300">• {c.description}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-cyan-400 font-mono font-bold">+{c.points} pts</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCriterion(c.id)}
                            className="text-slate-500 hover:text-rose-400 p-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                >
                  {editingMissionId ? 'Salvar Alterações' : 'Cadastrar Missão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
