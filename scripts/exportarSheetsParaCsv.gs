/**
 * ==========================================================
 *  exportarSheetsParaCsv.gs  — Fase 1 da migracao do SIGEP
 *
 *  COLE este arquivo no SEU projeto Apps Script atual do SIGEP
 *  (o mesmo onde estao o Code.gs e o Index.html), salve e rode
 *  a funcao  exportarTudoParaCsv.
 *
 *  O que faz: pega CADA aba da planilha e gera um arquivo .csv
 *  dentro de uma pasta nova no seu Google Drive. E o backup
 *  completo antes de qualquer migracao.
 *
 *  Importante: usa apenas aspas retas. Nao troque por aspas
 *  curvas/tipograficas.
 * ==========================================================
 */

function exportarTudoParaCsv() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var abas = planilha.getSheets();

  var carimbo = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd_HH-mm"
  );
  var pasta = DriveApp.createFolder("SIGEP-Backup-CSV-" + carimbo);

  var resumo = [];

  for (var i = 0; i < abas.length; i++) {
    var aba = abas[i];
    var nome = aba.getName();
    var dados = aba.getDataRange().getValues();

    if (dados.length === 0 || (dados.length === 1 && dados[0].join("") === "")) {
      resumo.push(nome + ": vazia (ignorada)");
      continue;
    }

    var csv = converterParaCsv_(dados);
    var nomeArquivo = sanitizar_(nome) + ".csv";

    pasta.createFile(
      Utilities.newBlob(csv, "text/csv", nomeArquivo)
    );
    resumo.push(nome + ": " + (dados.length - 1) + " linhas");
  }

  var msg =
    "Backup gerado na pasta do Drive:\n\n" +
    pasta.getName() +
    "\n\n" +
    resumo.join("\n") +
    "\n\nURL da pasta:\n" +
    pasta.getUrl();

  Logger.log(msg);

  // Mostra um aviso na tela, se a planilha estiver aberta
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    // rodando sem interface (ex: pelo editor) — ok, ver no Log
  }
}

/** Converte uma matriz de valores em texto CSV, com escape correto. */
function converterParaCsv_(dados) {
  var linhas = [];
  for (var l = 0; l < dados.length; l++) {
    var campos = [];
    for (var c = 0; c < dados[l].length; c++) {
      campos.push(escaparCampo_(dados[l][c]));
    }
    linhas.push(campos.join(","));
  }
  return linhas.join("\r\n");
}

/** Coloca aspas no campo se ele tiver virgula, aspas ou quebra de linha. */
function escaparCampo_(valor) {
  var texto = valor === null || valor === undefined ? "" : String(valor);
  if (texto.indexOf('"') !== -1) {
    texto = texto.replace(/"/g, '""');
  }
  if (
    texto.indexOf(",") !== -1 ||
    texto.indexOf('"') !== -1 ||
    texto.indexOf("\n") !== -1 ||
    texto.indexOf("\r") !== -1
  ) {
    texto = '"' + texto + '"';
  }
  return texto;
}

/** Remove caracteres que atrapalham nome de arquivo. */
function sanitizar_(nome) {
  return nome.replace(/[\/\\:*?"<>|]/g, "_").trim();
}
