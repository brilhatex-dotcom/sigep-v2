// ============================================================
// ARQUIVO: src/app/(admin)/cfs2026/page.tsx
// Painel administrativo para gerenciar inscricoes CFS 2026
// (caminho pode ser src/app/cfs2026/page.tsx conforme seu projeto)
// ============================================================

"use client";

import { useEffect, useState } from "react";

type Inscricao = {
  id: string;
  matricula: string;
  nomeCompleto: string;
  nomeGuerra: string | null;
  graduacao: string;
  dataNascimento: string;
  email: string;
  telefone: string;
  lotacao: string;
  funcaoAtual: string | null;
  status: string;
  dataInscricao: string;
  observacoes: string | null;
  validadoPor: string | null;
};

type Stats = {
  total: number;
  pendente: number;
  validado: number;
  rejeitado: number;
  porGraduacao: Record<string, number>;
  porLotacao: Record<string, number>;
};

export default function CFS2026AdminPage() {
  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const [filtroGrad, setFiltroGrad] = useState<string>("");
  
  async function carregar() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroStatus) params.set("status", filtroStatus);
      if (filtroGrad) params.set("graduacao", filtroGrad);
      
      const res = await fetch(`/api/cfs2026/list?${params}`);
      const data = await res.json();
      if (data.ok) {
        setInscricoes(data.inscricoes);
        setStats(data.stats);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }
  
  useEffect(() => {
    carregar();
  }, [filtroStatus, filtroGrad]);
  
  async function atualizarStatus(id: string, novoStatus: string) {
    const obs = novoStatus === "REJEITADO"
      ? prompt("Motivo da rejeicao:") || ""
      : null;
    
    try {
      const res = await fetch("/api/cfs2026/list", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: novoStatus, observacoes: obs }),
      });
      const data = await res.json();
      if (data.ok) {
        carregar();
      } else {
        alert("Erro: " + data.error);
      }
    } catch (err: any) {
      alert("Erro: " + err.message);
    }
  }
  
  function exportarCSV() {
    if (inscricoes.length === 0) {
      alert("Nenhuma inscricao para exportar");
      return;
    }
    
    const headers = [
      "Protocolo",
      "Matricula",
      "Nome Completo",
      "Nome Guerra",
      "Graduacao",
      "Data Nascimento",
      "Email",
      "Telefone",
      "Lotacao",
      "Funcao",
      "Status",
      "Data Inscricao",
      "Observacoes",
    ];
    
    const linhas = inscricoes.map((i) => [
      `CFS2026-${i.id.slice(-8).toUpperCase()}`,
      i.matricula,
      i.nomeCompleto,
      i.nomeGuerra || "",
      i.graduacao,
      new Date(i.dataNascimento).toLocaleDateString("pt-BR"),
      i.email,
      i.telefone,
      i.lotacao,
      i.funcaoAtual || "",
      i.status,
      new Date(i.dataInscricao).toLocaleString("pt-BR"),
      i.observacoes || "",
    ]);
    
    const csv = [headers, ...linhas]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inscricoes_cfs_2026_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Requerimentos CFS 2026</h1>
      <p className="text-gray-600 mb-6">
        Gerenciamento de inscricoes para o Curso de Formacao de Sargentos 2026
      </p>
      
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="text-sm text-blue-700">Total</div>
            <div className="text-2xl font-bold text-blue-900">{stats.total}</div>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <div className="text-sm text-yellow-700">Pendentes</div>
            <div className="text-2xl font-bold text-yellow-900">{stats.pendente}</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <div className="text-sm text-green-700">Validados</div>
            <div className="text-2xl font-bold text-green-900">{stats.validado}</div>
          </div>
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <div className="text-sm text-red-700">Rejeitados</div>
            <div className="text-2xl font-bold text-red-900">{stats.rejeitado}</div>
          </div>
        </div>
      )}
      
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="">Todos os status</option>
          <option value="PENDENTE">Pendente</option>
          <option value="VALIDADO">Validado</option>
          <option value="REJEITADO">Rejeitado</option>
        </select>
        
        <select
          value={filtroGrad}
          onChange={(e) => setFiltroGrad(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="">Todas as graduacoes</option>
          <option value="SD PM">SD PM</option>
          <option value="CB PM">CB PM</option>
          <option value="3 SGT PM">3 SGT PM</option>
          <option value="2 SGT PM">2 SGT PM</option>
          <option value="1 SGT PM">1 SGT PM</option>
        </select>
        
        <button
          onClick={exportarCSV}
          className="ml-auto bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Exportar CSV
        </button>
      </div>
      
      {/* Tabela */}
      {loading ? (
        <div className="text-center py-8">Carregando...</div>
      ) : inscricoes.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          Nenhuma inscricao encontrada
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border p-2 text-left">Protocolo</th>
                <th className="border p-2 text-left">Matricula</th>
                <th className="border p-2 text-left">Nome</th>
                <th className="border p-2 text-left">Grad.</th>
                <th className="border p-2 text-left">Lotacao</th>
                <th className="border p-2 text-left">Contato</th>
                <th className="border p-2 text-left">Data</th>
                <th className="border p-2 text-left">Status</th>
                <th className="border p-2 text-left">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {inscricoes.map((i) => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="border p-2 font-mono text-xs">
                    CFS2026-{i.id.slice(-8).toUpperCase()}
                  </td>
                  <td className="border p-2">{i.matricula}</td>
                  <td className="border p-2">
                    <div className="font-semibold">{i.nomeCompleto}</div>
                    {i.nomeGuerra && (
                      <div className="text-xs text-gray-500">{i.nomeGuerra}</div>
                    )}
                  </td>
                  <td className="border p-2">{i.graduacao}</td>
                  <td className="border p-2">{i.lotacao}</td>
                  <td className="border p-2 text-xs">
                    <div>{i.email}</div>
                    <div>{i.telefone}</div>
                  </td>
                  <td className="border p-2 text-xs">
                    {new Date(i.dataInscricao).toLocaleString("pt-BR")}
                  </td>
                  <td className="border p-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        i.status === "VALIDADO"
                          ? "bg-green-100 text-green-800"
                          : i.status === "REJEITADO"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {i.status}
                    </span>
                  </td>
                  <td className="border p-2">
                    <div className="flex gap-1">
                      {i.status !== "VALIDADO" && (
                        <button
                          onClick={() => atualizarStatus(i.id, "VALIDADO")}
                          className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700"
                        >
                          Validar
                        </button>
                      )}
                      {i.status !== "REJEITADO" && (
                        <button
                          onClick={() => atualizarStatus(i.id, "REJEITADO")}
                          className="bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700"
                        >
                          Rejeitar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
