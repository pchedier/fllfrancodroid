import React, { useState } from 'react';
import {
  Settings,
  Bot,
  Cpu,
  Wrench,
  Users,
  GitFork,
  Download,
  Upload,
  Database,
  Cloud,
  FileSpreadsheet,
  CheckCircle2,
  Trash2,
  Plus,
  Save,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { RobotSettings } from '../types/fll';
import { StorageService } from '../services/storageService';

interface SettingsViewProps {
  settings: RobotSettings;
  onSaveSettings: (settings: RobotSettings) => void;
  onDataReset: () => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSaveSettings,
  onDataReset,
  onShowToast,
}) => {
  const [formData, setFormData] = useState<RobotSettings>(settings);

  // New item inputs
  const [newClaw, setNewClaw] = useState('');
  const [newOperator, setNewOperator] = useState('');
  const [newStrategy, setNewStrategy] = useState('');

  const handleChange = (field: keyof RobotSettings, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Claw management
  const handleAddClaw = () => {
    if (!newClaw.trim()) return;
    setFormData((prev) => ({
      ...prev,
      clawsAndAttachments: [...prev.clawsAndAttachments, newClaw.trim()],
    }));
    setNewClaw('');
  };

  const handleRemoveClaw = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      clawsAndAttachments: prev.clawsAndAttachments.filter((_, i) => i !== index),
    }));
  };

  // Operator management
  const handleAddOperator = () => {
    if (!newOperator.trim()) return;
    setFormData((prev) => ({
      ...prev,
      operators: [...prev.operators, newOperator.trim()],
    }));
    setNewOperator('');
  };

  const handleRemoveOperator = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      operators: prev.operators.filter((_, i) => i !== index),
    }));
  };

  // Strategy management
  const handleAddStrategy = () => {
    if (!newStrategy.trim()) return;
    setFormData((prev) => ({
      ...prev,
      strategies: [...prev.strategies, newStrategy.trim()],
    }));
    setNewStrategy('');
  };

  const handleRemoveStrategy = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      strategies: prev.strategies.filter((_, i) => i !== index),
    }));
  };

  // Save settings
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    onShowToast('Configurações salvas com sucesso!', 'success');
  };

  // Full Backup Export
  const handleExportFullBackup = () => {
    const backupJson = StorageService.exportFullBackup();
    const blob = new Blob([backupJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `francodroid_fll_backup_completo_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast('Backup completo exportado com sucesso!', 'success');
  };

  // Full Backup Import
  const handleImportFullBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const res = StorageService.importFullBackup(content);
      if (res.success) {
        onDataReset();
        onShowToast('Backup restaurado com sucesso!', 'success');
      } else {
        onShowToast(res.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-cyan-400" />
          Configurações da Equipe & do Robô
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Gerencie os dados de hardware do robô FrancoBot, integrantes pilotos, garras, estratégias e
          integrações externas com Supabase e Google Sheets.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Hardware & Robot Specs */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Bot className="w-4 h-4 text-cyan-400" />
            Especificações de Hardware do Robô
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Nome do Robô</label>
              <input
                type="text"
                value={formData.robotName}
                onChange={(e) => handleChange('robotName', e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 font-semibold"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Pontuação Meta da Temporada (pts)
              </label>
              <input
                type="number"
                min="50"
                max="600"
                value={formData.targetScore}
                onChange={(e) => handleChange('targetScore', Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-cyan-300 font-mono font-bold focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">Base de Tração (Drive Base)</label>
              <input
                type="text"
                value={formData.driveBase}
                onChange={(e) => handleChange('driveBase', e.target.value)}
                placeholder="Ex: Tração diferencial 2WD com rodas de 56mm e centro de gravidade baixo"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Motores Grandes (Tração)</label>
              <input
                type="text"
                value={formData.largeMotors}
                onChange={(e) => handleChange('largeMotors', e.target.value)}
                placeholder="Ex: 2x Motores Grandes (Portas C e D)"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Motores Médios (Atuadores)</label>
              <input
                type="text"
                value={formData.mediumMotors}
                onChange={(e) => handleChange('mediumMotors', e.target.value)}
                placeholder="Ex: 2x Motores Médios (Portas A e B)"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">Sensores Instalados</label>
              <input
                type="text"
                value={formData.sensors}
                onChange={(e) => handleChange('sensors', e.target.value)}
                placeholder="Ex: 2x Sensores de Cor para alinhamento em linha preta + Giroscópio integrado SPIKE"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* Claws & Attachments List */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Wrench className="w-4 h-4 text-cyan-400" />
            Garras e Acessórios Acopláveis
          </h2>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newClaw}
              onChange={(e) => setNewClaw(e.target.value)}
              placeholder="Nome da garra (ex: Garra Frontal Motorizada, Gancho Passivo)"
              className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500"
            />
            <button
              type="button"
              onClick={handleAddClaw}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 font-semibold text-xs border border-slate-700 transition-all"
            >
              + Adicionar Garra
            </button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {formData.clawsAndAttachments.map((claw, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200"
              >
                <span>{claw}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveClaw(idx)}
                  className="text-slate-500 hover:text-rose-400 p-0.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Team Pilots & Strategies */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pilots */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Users className="w-4 h-4 text-cyan-400" />
              Operadores / Pilotos
            </h2>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newOperator}
                onChange={(e) => setNewOperator(e.target.value)}
                placeholder="Nome do integrante"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={handleAddOperator}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 font-semibold text-xs border border-slate-700"
              >
                +
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {formData.operators.map((op, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200"
                >
                  <span>{op}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveOperator(idx)}
                    className="text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Strategies */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <GitFork className="w-4 h-4 text-cyan-400" />
              Lista de Estratégias
            </h2>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newStrategy}
                onChange={(e) => setNewStrategy(e.target.value)}
                placeholder="Nome da estratégia"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={handleAddStrategy}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 font-semibold text-xs border border-slate-700"
              >
                +
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {formData.strategies.map((st, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200"
                >
                  <span>{st}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveStrategy(idx)}
                    className="text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Cloud & External Sync (Supabase & Google Sheets prepared structure) */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <Cloud className="w-4 h-4 text-cyan-400" />
            Integrações em Nuvem (Supabase & Google Sheets)
          </h2>
          <p className="text-xs text-slate-400">
            A arquitetura está preparada para sincronizar os rounds e missões diretamente com seu
            projeto Supabase ou Google Sheets da equipe FrancoDroid.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Supabase Project URL (Opcional)
              </label>
              <input
                type="text"
                value={formData.supabaseUrl || ''}
                onChange={(e) => handleChange('supabaseUrl', e.target.value)}
                placeholder="https://xyzcompany.supabase.co"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Supabase Anon Key (Opcional)
              </label>
              <input
                type="password"
                value={formData.supabaseAnonKey || ''}
                onChange={(e) => handleChange('supabaseAnonKey', e.target.value)}
                placeholder="eyJhbGciOi..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-semibold mb-1">
                Google Sheets Webhook URL (Apps Script / Make / Zapier)
              </label>
              <input
                type="text"
                value={formData.googleSheetsWebhook || ''}
                onChange={(e) => handleChange('googleSheetsWebhook', e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 active:scale-95 transition-all"
          >
            <Save className="w-4 h-4" />
            <span>Salvar Todas as Configurações</span>
          </button>
        </div>
      </form>

      {/* Backup & Restore Card */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
          <Database className="w-4 h-4 text-purple-400" />
          Backup Completo & Portabilidade do Pit
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          Baixe um arquivo JSON com todas as missões, rounds de telemetria, estratégias e configurações para levar no pendrive para o torneio FLL ou sincronizar em outros computadores da equipe.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportFullBackup}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md shadow-purple-600/20 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Exportar Backup Completo (.JSON)</span>
          </button>

          <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 cursor-pointer transition-all">
            <Upload className="w-4 h-4 text-cyan-400" />
            <span>Restaurar Backup Completo</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportFullBackup}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
