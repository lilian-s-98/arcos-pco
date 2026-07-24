/**
 * ============================================================================
 *  BACKEND_DASHBOARD.GS — KPIs consolidados e Evolução Física
 *  AG Construtora / ARCOS
 * ============================================================================
 *  Este arquivo junta informações de VÁRIAS abas (Obras + Aditivos + Medições
 *  + Atas) para montar o Dashboard principal do sistema.
 *
 *  ⚠️ IMPORTANTE — MÓDULOS AINDA NÃO ENTREGUES:
 *  As abas ADITIVOS e MEDICOES ainda não têm um Backend_*.gs próprio (isso
 *  vem nas Etapas 5 e 6). Enquanto isso, elas simplesmente estarão VAZIAS
 *  na planilha — e este arquivo já foi escrito para lidar bem com isso:
 *  sheetToObjects_() devolve uma lista vazia [] se não houver dados, então
 *  nada aqui quebra, os valores financeiros só aparecem R$ 0,00 até lá.
 *
 *  NOMENCLATURA (conforme solicitado):
 *   - "Faturado"       (antes chamado de "Executado")
 *   - "A Faturar"      = soma das medições já Apresentadas que ainda não
 *                        têm valor Faturado preenchido.
 *   - "Saldo Previsto"  = Valor Total do Contrato − Faturado − A Faturar
 *
 *  EVOLUÇÃO FÍSICA (gráfico de 3 linhas: Prevista / Apresentada / Faturada):
 *   - "Prevista"   e "Apresentada"  vêm das Atas Semanais (campos
 *     avanco_previsto e avanco_realizado), agrupadas por mês.
 *   - "Faturada"   é o % financeiro acumulado (valor faturado até aquele mês
 *     dividido pelo valor total do contrato) — é a linha "oficial", pois é
 *     baseada em dinheiro efetivamente faturado, não em estimativa de reunião.
 *   - Por definição da consultoria, o avanço físico "oficial" do mês ATUAL
 *     sempre olha para o mês ANTERIOR (mesReferenciaEvolucao) — porque o
 *     faturamento do mês corrente ainda não fechou. Isso é feito pela função
 *     mesAnterior_().
 * ============================================================================
 */


/* ============================================================================
 * FUNÇÃO PRINCIPAL — chamada pelo frontend em GET ?acao=dashboard
 * ========================================================================= */

function getDashboard() {
  const obras = sheetToObjects_(SHEETS.obras);
  const atas = sheetToObjects_(SHEETS.atas);           // agora alimentado de verdade pelo Backend_Atas.gs (Etapa 4)
  const aditivos = sheetToObjects_(SHEETS.aditivos);   // [] até a Etapa 5 (Backend_Aditivos.gs)
  const medicoes = sheetToObjects_(SHEETS.medicoes);   // [] até a Etapa 6 (Backend_Medicoes.gs)
  const engenheiros = sheetToObjects_(SHEETS.engenheiros);
  const atividadesRotina = sheetToObjects_(SHEETS.rotina_atividades);

  const mesAtual = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  const mesReferenciaEvolucao = mesAnterior_(mesAtual);

  // ── Aderência do mês atual (calculada pelo Backend_Rotina.gs) ────────────
  const linhasAderencia = sheetToObjects_(SHEETS.rotina_aderencia).filter(function (r) { return String(r.mes) === mesAtual; });
  const aderenciaMedia = linhasAderencia.length > 0
    ? Math.round(linhasAderencia.reduce(function (soma, r) { return soma + parseFloat(String(r.aderencia_pct || '0').replace('%', '')); }, 0) / linhasAderencia.length)
    : null; // null = "ainda não há dados", em vez de forçar um 0% enganoso

  // ── Financeiro por obra ───────────────────────────────────────────────────
  const obrasComFinanceiro = obras.map(function (obra) {
    return montarFinanceiroDaObra_(obra, aditivos, medicoes, atas);
  });

  const obrasAtivas = obras.filter(function (o) { return String(o.status).toLowerCase() === 'ativa'; });

  // ── Ranking de envio de Atas (só faz sentido pra obras ativas) ───────────
  const ranking = obrasAtivas.map(function (obra) {
    const atasDaObra = atas.filter(function (a) { return String(a.obra) === String(obra.nome); });
    const dataInicio = obra.data_inicio ? new Date(obra.data_inicio) : new Date();
    const semanasEsperadas = Math.max(1, Math.ceil((new Date() - dataInicio) / (7 * 24 * 60 * 60 * 1000)));
    const enviadas = atasDaObra.length;
    return {
      obra: obra.nome,
      enviadas: enviadas,
      esperadas: semanasEsperadas,
      pct: Math.min(100, Math.round((enviadas / semanasEsperadas) * 100))
    };
  }).sort(function (a, b) { return b.pct - a.pct; });

  // ── Atas pendentes: obra ativa SEM nenhuma ata OU cuja última ata já ─────
  // passou de 7 dias. Se não houver NENHUMA obra ativa, o resultado é
  // sempre 0 (o "filter" de uma lista vazia dá lista vazia — sem gambiarra).
  const seteDiasEmMs = 7 * 24 * 60 * 60 * 1000;
  const atasPendentes = obrasAtivas.filter(function (obra) {
    const atasDaObra = atas.filter(function (a) { return String(a.obra) === String(obra.nome); });
    if (atasDaObra.length === 0) return true; // nunca enviou nenhuma ata
    const maisRecente = atasDaObra.reduce(function (recente, atual) {
      const dataRecente = new Date(recente.data_referencia || recente.timestamp || 0);
      const dataAtual = new Date(atual.data_referencia || atual.timestamp || 0);
      return dataAtual > dataRecente ? atual : recente;
    });
    const dataUltimaAta = new Date(maisRecente.data_referencia || maisRecente.timestamp || 0);
    return (new Date() - dataUltimaAta) > seteDiasEmMs;
  }).length;

  return {
    success: true,
    mes_atual: mesAtual,
    mes_referencia_evolucao: mesReferenciaEvolucao,

    total_obras: obras.length,
    obras_ativas: obrasAtivas.length,
    atas_pendentes: atasPendentes,
    aderencia_media: aderenciaMedia,

    total_contrato: somarCampo_(obrasComFinanceiro, 'valor_total_contrato'),
    total_faturado: somarCampo_(obrasComFinanceiro, 'faturado'),
    total_a_faturar: somarCampo_(obrasComFinanceiro, 'a_faturar'),
    total_saldo_previsto: somarCampo_(obrasComFinanceiro, 'saldo_previsto'),

    obras: obrasComFinanceiro,
    engenheiros: engenheiros,
    ultimas_atas: atas.slice(-20),
    atividades_rotina: atividadesRotina,
    ranking_atas: ranking
  };
}


/* ============================================================================
 * HELPERS DE CÁLCULO (funções internas — não são chamadas direto pelo site)
 * ========================================================================= */

/**
 * Monta o "financeiro" completo de UMA obra: valor total (com aditivos
 * liberados), faturado, a faturar, saldo previsto e a evolução física
 * mês a mês (previsto / apresentado / faturado%).
 */
function montarFinanceiroDaObra_(obra, aditivos, medicoes, atas) {
  const nomeObra = String(obra.nome || '');
  const valorContratoBase = parseFloat(obra.valor_contrato || 0);

  // Aditivos: só os já "Liberados" entram no valor total do contrato.
  const aditivosDaObra = aditivos.filter(function (a) { return String(a.obra) === nomeObra; });
  const totalAditivosLiberados = aditivosDaObra
    .filter(function (a) { return a.status_atual === 'Liberado'; })
    .reduce(function (soma, a) { return soma + parseFloat(a.valor_atual || a.valor_original || 0); }, 0);
  const valorTotalContrato = valorContratoBase + totalAditivosLiberados;

  // Medições desta obra
  const medicoesDaObra = medicoes.filter(function (m) { return String(m.obra) === nomeObra; });
  const faturado = medicoesDaObra.reduce(function (soma, m) { return soma + parseFloat(m.valor_faturado || 0); }, 0);

  // "A Faturar" = valor Apresentado das medições que AINDA não têm Faturado preenchido
  const aFaturar = medicoesDaObra
    .filter(function (m) { return !m.valor_faturado || parseFloat(m.valor_faturado) === 0; })
    .reduce(function (soma, m) { return soma + parseFloat(m.valor_apresentado || 0); }, 0);

  const saldoPrevisto = valorTotalContrato - faturado - aFaturar;

  // Evolução física por competência (mês) — Previsto e Apresentado vêm da Ata
  const atasDaObra = atas.filter(function (a) { return String(a.obra) === nomeObra; });
  const evolucaoPorMes = {};
  atasDaObra.forEach(function (a) {
    const dataReferencia = String(a.data_referencia || a.timestamp || '');
    if (dataReferencia.length < 7) return;
    const mesDaAta = dataReferencia.substring(0, 7);
    if (!evolucaoPorMes[mesDaAta]) evolucaoPorMes[mesDaAta] = { mes: mesDaAta, previsto: 0, apresentado: 0 };
    const previsto = parseFloat(a.avanco_previsto || 0);
    const apresentado = parseFloat(a.avanco_realizado || 0);
    if (previsto > evolucaoPorMes[mesDaAta].previsto) evolucaoPorMes[mesDaAta].previsto = previsto;
    if (apresentado > evolucaoPorMes[mesDaAta].apresentado) evolucaoPorMes[mesDaAta].apresentado = apresentado;
  });

  // Faturado (%) acumulado até cada mês, em relação ao valor total do contrato
  const mesesComDados = Object.keys(evolucaoPorMes).sort();
  let faturadoAcumulado = 0;
  mesesComDados.forEach(function (mes) {
    const faturadoDoMes = medicoesDaObra
      .filter(function (m) { return String(m.competencia) === mes; })
      .reduce(function (soma, m) { return soma + parseFloat(m.valor_faturado || 0); }, 0);
    faturadoAcumulado += faturadoDoMes;
    evolucaoPorMes[mes].faturado_pct = valorTotalContrato > 0
      ? parseFloat(((faturadoAcumulado / valorTotalContrato) * 100).toFixed(1))
      : 0;
  });

  return Object.assign({}, obra, {
    valor_contrato: valorContratoBase,
    total_aditivos_liberados: totalAditivosLiberados,
    valor_total_contrato: valorTotalContrato,
    faturado: faturado,
    a_faturar: aFaturar,
    saldo_previsto: saldoPrevisto,
    evolucao: mesesComDados.map(function (mes) { return evolucaoPorMes[mes]; })
  });
}

/** Soma um campo numérico específico de uma lista de objetos. Ex: somarCampo_(obras, 'faturado'). */
function somarCampo_(lista, nomeDoCampo) {
  return lista.reduce(function (soma, item) { return soma + (parseFloat(item[nomeDoCampo]) || 0); }, 0);
}

/**
 * Devolve o mês anterior a um mês informado, no formato 'yyyy-MM'.
 * Ex: mesAnterior_('2026-07') -> '2026-06'
 * Usado porque o avanço físico "oficial" (baseado em faturamento) sempre
 * olha para o mês fechado anterior, nunca para o mês corrente (que ainda
 * está em andamento e sujeito a mudanças).
 */
function mesAnterior_(mesTexto) {
  const partes = mesTexto.split('-').map(Number);
  const ano = partes[0], mesNumero = partes[1];
  const dataDoMesAnterior = new Date(ano, mesNumero - 2, 1); // "-2" pois Date usa mês 0-based
  return Utilities.formatDate(dataDoMesAnterior, Session.getScriptTimeZone(), 'yyyy-MM');
}
