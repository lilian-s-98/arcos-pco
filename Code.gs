/**
 * ============================================================================
 *  CODE.GS — Ponto de entrada do sistema PCO (Planejamento e Controle de Obras)
 *  AG Construtora / ARCOS
 * ============================================================================
 *  Este arquivo é responsável por:
 *   1. Servir a página web (doGet) juntando Index.html + CSS.html + JS.html
 *   2. Receber requisições do frontend (doPost / doGet com parâmetro "acao")
 *   3. Rotear cada requisição para a função correta nos arquivos Backend_*.gs
 *
 *  IMPORTANTE PARA VOCÊ (não-desenvolvedora):
 *   - No dia a dia você não precisa mexer neste arquivo.
 *   - Se um botão do site não estiver funcionando, o problema normalmente
 *     está no arquivo Backend_ do módulo dele (ex: botão de Obras -> Backend_Obras.gs).
 *   - Toda vez que um novo Backend_*.gs for adicionado, ele precisa ser
 *     "religado" aqui embaixo, dentro de roteador_Get_ e/ou roteador_Post_.
 *     Isso é o ÚNICO lugar que precisa ser tocado ao ligar um módulo novo.
 *
 *  HISTÓRICO DE ATUALIZAÇÕES DESTE ARQUIVO:
 *   - Etapa 1: doGet/doPost, roteadores vazios, utilitários gerais.
 *   - Etapa 2: ligados os módulos de Login (Auth), Obras e Engenheiros.
 * ============================================================================
 */

// ── PLANILHA ATIVA (não precisa alterar) ────────────────────────────────────
const PLANILHA = SpreadsheetApp.getActiveSpreadsheet();


/* ============================================================================
 * 1. SERVIR A PÁGINA WEB (HTML)
 * ========================================================================= */

/**
 * Executado automaticamente quando alguém abre a URL do sistema.
 *  - Sem parâmetros  -> serve a página HTML (o site).
 *  - Com "?acao=xxx" -> é uma chamada de API, devolve JSON.
 */
function doGet(e) {
  const acao = (e && e.parameter && e.parameter.acao) ? e.parameter.acao : '';

  if (acao) {
    try {
      const resultado = roteador_Get_(acao, e.parameter);
      return jsonOut_(resultado);
    } catch (erro) {
      return jsonOut_({ success: false, msg: 'Erro no servidor (GET): ' + erro.message });
    }
  }

  // Sem "acao" -> serve a página do sistema
  try {
    return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('PCO — Planejamento e Controle de Obras | AG/ARCOS')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (erro) {
    // O arquivo Index.html ainda não existe nesta etapa da montagem do sistema.
    // Em vez de mostrar um erro feio, avisamos de forma clara.
    return HtmlService.createHtmlOutput(
      '<div style="font-family:Arial,sans-serif;padding:40px;text-align:center;color:#333">' +
      '<h2>⚙️ Sistema em montagem</h2>' +
      '<p>O arquivo <b>Index.html</b> ainda não foi criado neste projeto.</p>' +
      '<p>Isso é normal — estamos montando o sistema por etapas.</p>' +
      '<p style="color:#999;font-size:12px;margin-top:20px">Detalhe técnico: ' + erro.message + '</p>' +
      '</div>'
    );
  }
}

/**
 * Inclui um arquivo HTML dentro de outro. Usado dentro do Index.html para
 * puxar CSS.html e JS.html. Não precisa mexer aqui.
 * Uso dentro do HTML:  <?!= include('CSS'); ?>
 */
function include(nomeArquivo) {
  return HtmlService.createHtmlOutputFromFile(nomeArquivo).getContent();
}


/* ============================================================================
 * 2. RECEBER CHAMADAS DO FRONTEND (API)
 * ========================================================================= */

/**
 * Todo POST vindo do site (salvar, editar, excluir) cai aqui.
 * O JS do site sempre envia um JSON com pelo menos o campo "tipo".
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const resultado = roteador_Post_(payload.tipo, payload);
    registrarLog_(payload.tipo, resultado.success, payload);
    return jsonOut_(resultado);
  } catch (erro) {
    return jsonOut_({ success: false, msg: 'Erro no servidor (POST): ' + erro.message });
  }
}

/**
 * Versões "diretas" (google.script.run) — usadas quando o HTML roda dentro
 * do próprio Apps Script. Evitam problemas de CORS. Recebem/devolvem texto.
 */
function handlePost(jsonTexto) {
  try {
    const payload = JSON.parse(jsonTexto);
    const resultado = roteador_Post_(payload.tipo, payload);
    registrarLog_(payload.tipo, resultado.success, payload);
    return JSON.stringify(resultado);
  } catch (erro) {
    return JSON.stringify({ success: false, msg: 'Erro: ' + erro.message });
  }
}

function handleGet(jsonTexto) {
  try {
    const payload = JSON.parse(jsonTexto);
    const resultado = roteador_Get_(payload.acao, payload);
    return JSON.stringify(resultado);
  } catch (erro) {
    return JSON.stringify({ success: false, msg: 'Erro: ' + erro.message });
  }
}


/* ============================================================================
 * 3. ROTEADORES — a "central telefônica" do sistema
 * ----------------------------------------------------------------------------
 *  Cada "case" comentado abaixo será DESCOMENTADO na etapa em que o respectivo
 *  Backend_*.gs for entregue. Não apague os comentários — eles são o mapa
 *  de tudo que o sistema vai ter.
 * ========================================================================= */

function roteador_Get_(acao, params) {
  switch (acao) {

    // ── Diagnóstico (Etapa 1) ───────────────────────────────────────────────
    case 'ping':
      return { success: true, msg: 'PCO online! Planilha: ' + PLANILHA.getName() };

    case 'status_setup':
      return verificarStatusSetup_();

    case 'config':
      return getConfig();

    // ── Obras / Engenheiros (Etapa 2 — Backend_Obras.gs / Backend_Engenheiros.gs)
    case 'obras':
      return getObras();

    case 'engenheiros':
      return getEngenheiros();

    // ── Dashboard (Etapa 3 — Backend_Dashboard.gs) ──────────────────────────
    case 'dashboard':
      return getDashboard();

    // ── Rotina / Checklist / Calendário / Aderência (Etapa 3 — Backend_Rotina.gs)
    case 'rotina_atividades':
      return getRotinaAtividades();

    case 'rotina_historico':
      return getRotinaHistorico(params);

    case 'rotina_aderencia':
      return getRotinaAderencia(params);

    case 'rotina_checklist_dia':
      return getChecklistDoDia(params);

    case 'rotina_calendario':
      return getCalendarioMes(params);

    // ── Ata Semanal / Problemas de Obra (Etapa 4 — Backend_Atas.gs / Backend_Problemas.gs)
    case 'atas':
      return getAtas(params);

    case 'problemas':
      return getProblemas(params);

    case 'categorias_problema':
      return getCategoriasProblema();

    case 'problemas_top_categorias':
      return getTopCategoriasProblema();

    // ── Medições (Etapa 5 — Backend_Medicoes.gs) ────────────────────────────
    case 'medicoes':
      return getMedicoes(params);

    // ── Cronograma (Etapa 5 — Backend_Cronograma.gs) ────────────────────────
    case 'cronograma':
      return getCronograma(params);

    // ── Aditivos (Etapa 6 — Backend_Aditivos.gs) ────────────────────────────
    case 'aditivos':
      return getAditivos(params);

    case 'aditivos_fluxo':
      return getFluxoAditivos();

    default:
      return { success: false, msg: 'Ação de leitura "' + acao + '" ainda não implementada.' };
  }
}

function roteador_Post_(tipo, payload) {
  switch (tipo) {

    // ── Login / Usuário (Etapa 2 — Backend_Auth.gs) ─────────────────────────
    case 'login':
      return validarLogin_(payload);

    case 'trocar_senha':
      return trocarSenha_(payload);

    // ── Obras (Etapa 2 — Backend_Obras.gs) ──────────────────────────────────
    case 'obra_salvar':
      return salvarObra_(payload);

    case 'obra_excluir':
      return excluirObra_(payload);

    // ── Engenheiros (Etapa 2 — Backend_Engenheiros.gs) ──────────────────────
    case 'engenheiro_salvar':
      return salvarEngenheiro_(payload);

    case 'engenheiro_excluir':
      return excluirEngenheiro_(payload);

    // ── Config (Etapa 1 — Backend_Setup.gs) ─────────────────────────────────
    case 'config_salvar':
      return salvarConfig_(payload);

    // ── Rotina / Checklist (Etapa 3 — Backend_Rotina.gs) ────────────────────
    case 'rotina_check':
      return salvarRotinaCheck_(payload);

    case 'rotina_atividade_salvar':
      return salvarRotinaAtividade_(payload);

    case 'rotina_atividade_excluir':
      return excluirRotinaAtividade_(payload);

    case 'rotina_recalcular':
      return recalcularAderencia_(payload.mes);

    // ── Ata Semanal / Problemas de Obra (Etapa 4 — Backend_Atas.gs / Backend_Problemas.gs)
    case 'ata_salvar':
      return salvarAta_(payload);

    case 'ata_excluir':
      return excluirAta_(payload);

    case 'problema_salvar':
      return salvarProblema_(payload);

    case 'problema_excluir':
      return excluirProblema_(payload);

    // ── Medições (Etapa 5 — Backend_Medicoes.gs) ────────────────────────────
    case 'medicao_apresentada':
      return salvarMedicaoApresentada_(payload);

    case 'medicao_validada':
      return salvarMedicaoValidada_(payload);

    case 'medicao_faturada':
      return salvarMedicaoFaturada_(payload);

    case 'medicao_excluir':
      return excluirMedicao_(payload);

    // ── Cronograma (Etapa 5 — Backend_Cronograma.gs) ────────────────────────
    case 'cronograma_item_salvar':
      return salvarCronogramaItem_(payload);

    case 'cronograma_item_excluir':
      return excluirCronogramaItem_(payload);

    // ── Aditivos (Etapa 6 — Backend_Aditivos.gs) ────────────────────────────
    case 'aditivo_salvar':
      return salvarAditivo_(payload);

    case 'aditivo_avancar_status':
      return avancarStatusAditivo_(payload);

    case 'aditivo_excluir':
      return excluirAditivo_(payload);

    // ── Relatórios em PDF (Etapa 7 — Backend_Relatorios.gs) ─────────────────
    case 'relatorio_padrao_gerar':
      return gerarRelatorioPadrao_(payload);

    case 'relatorio_executivo_gerar':
      return gerarRelatorioResumoExecutivo_(payload);

    default:
      return { success: false, msg: 'Ação de escrita "' + tipo + '" ainda não implementada.' };
  }
}


/* ============================================================================
 * 4. UTILITÁRIOS GERAIS (compartilhados por todos os módulos)
 * ========================================================================= */

/** Transforma um objeto JS em resposta JSON válida para o navegador. */
function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Gera um ID único e legível. Ex: gerarId_('OBR') -> "OBR-1737590123456" */
function gerarId_(prefixo) {
  return prefixo + '-' + new Date().getTime();
}

/** Grava uma linha no log de auditoria (aba HISTORICO_LOGS). Nunca derruba o sistema. */
function registrarLog_(tipo, sucesso, payload) {
  try {
    appendObjectRow_(SHEETS.logs, HEADERS.logs, {
      timestamp: new Date(),
      tipo: tipo || '(sem tipo)',
      sucesso: sucesso,
      obra: (payload && payload.obra) ? payload.obra : '-',
      usuario: (payload && payload.usuario) ? payload.usuario : '-',
      resumo: JSON.stringify(payload || {}).substring(0, 400)
    });
  } catch (erro) {
    // Log nunca deve travar o sistema — se falhar, apenas ignoramos.
  }
}

/** Menu de atalho dentro do Google Sheets: Extensões > Apps Script já tem o menu "⚙️ Sistema PCO". */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙️ Sistema PCO')
    .addItem('🚀 Configurar / Verificar Planilha', 'setupSpreadsheet')
    .addItem('🔎 Ver status da configuração', 'mostrarStatusSetup_')
    .addToUi();
}

function mostrarStatusSetup_() {
  const status = verificarStatusSetup_();
  // mostrarMensagem_() vive no Backend_Setup.gs (é uma função genérica
  // compartilhada — NÃO duplique essa função aqui, senão o projeto passa
  // a ter duas versões da mesma função em arquivos diferentes).
  mostrarMensagem_(status.msg);
}
