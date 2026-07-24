/**
 * ============================================================================
 *  BACKEND_CRONOGRAMA.GS — Cronograma mensal (metas por semana, S1 a S5)
 *  AG Construtora / ARCOS
 * ============================================================================
 *  Mantém a mesma lógica do sistema anterior (uma atividade por linha, com
 *  metas de % previsto e % realizado por semana do mês), só que agora com
 *  CRUD completo e robusto (o "salvar" que não funcionava antes).
 *
 *  Os campos "semanas_previsto" e "semanas_realizado" são objetos como
 *  { s1: 20, s2: 45, s3: 70, s4: 90, s5: 100 } — guardados como texto/JSON
 *  na planilha (a aba não tem como guardar um objeto direto).
 *
 *  Funções deste arquivo:
 *   - getCronograma(params)          -> lista (filtros: obra, mes, status)
 *   - salvarCronogramaItem_()        -> cria ou edita uma atividade
 *   - excluirCronogramaItem_()       -> exclui uma atividade
 * ============================================================================
 */


/** Lista os itens de cronograma, já convertendo semanas_previsto/realizado
 *  de volta para objeto JS (na planilha ficam guardados como texto/JSON). */
function getCronograma(params) {
  let linhas = sheetToObjects_(SHEETS.cronograma).map(function (item) {
    try { item.semanas_previsto = JSON.parse(item.semanas_previsto || '{}'); }
    catch (erroDeLeitura) { item.semanas_previsto = {}; }

    try { item.semanas_realizado = JSON.parse(item.semanas_realizado || '{}'); }
    catch (erroDeLeitura) { item.semanas_realizado = {}; }

    return item;
  });

  if (params) {
    if (params.obra) linhas = linhas.filter(function (i) { return String(i.obra) === params.obra; });
    if (params.mes) linhas = linhas.filter(function (i) { return String(i.mes) === params.mes; });
    if (params.status) linhas = linhas.filter(function (i) { return String(i.status) === params.status; });
  }

  return { success: true, cronograma: linhas };
}

/**
 * Cria ou edita uma atividade de cronograma.
 *  - Para CRIAR: não envie "id".
 *  - Para EDITAR: envie "id" da atividade existente.
 * Campos obrigatórios: obra, mes ('yyyy-MM'), atividade.
 * "semanas_previsto" e "semanas_realizado" devem chegar como OBJETO
 * (ex: {s1:20, s2:45}) — aqui são convertidos para texto/JSON antes de gravar.
 */
function salvarCronogramaItem_(payload) {
  if (!payload || !payload.obra || !payload.mes || !payload.atividade) {
    return { success: false, msg: 'Informe obra, mês e nome da atividade.' };
  }

  const statusValidos = ['Planejada', 'Em Andamento', 'Concluída', 'Atrasada'];
  const status = statusValidos.indexOf(payload.status) !== -1 ? payload.status : 'Planejada';

  const dadosComuns = {
    obra: payload.obra,
    mes: payload.mes,
    atividade: payload.atividade,
    responsavel: payload.responsavel || '',
    peso_percentual: parseFloat(payload.peso_percentual || 0),
    status: status,
    semanas_previsto: JSON.stringify(payload.semanas_previsto || {}),
    semanas_realizado: JSON.stringify(payload.semanas_realizado || {}),
    obs: payload.obs || ''
  };

  // ── MODO EDIÇÃO ───────────────────────────────────────────────────────────
  if (payload.id) {
    const linhaAtualizada = updateObjectRowById_(SHEETS.cronograma, HEADERS.cronograma, payload.id, dadosComuns);
    if (linhaAtualizada === -1) {
      return { success: false, msg: 'Atividade não encontrada para edição (id: ' + payload.id + ').' };
    }
    return { success: true, msg: 'Atividade "' + payload.atividade + '" atualizada com sucesso.' };
  }

  // ── MODO CRIAÇÃO ──────────────────────────────────────────────────────────
  const novoId = gerarId_('CRN');
  const dadosCompletos = Object.assign({ id: novoId, data_criacao: new Date(), updated_at: new Date() }, dadosComuns);
  appendObjectRow_(SHEETS.cronograma, HEADERS.cronograma, dadosCompletos);

  return { success: true, msg: 'Atividade "' + payload.atividade + '" criada com sucesso.', id: novoId };
}

/** Exclui uma atividade de cronograma pelo id. */
function excluirCronogramaItem_(payload) {
  if (!payload || !payload.id) return { success: false, msg: 'ID da atividade não informado.' };

  const item = getObjectById_(SHEETS.cronograma, payload.id);
  if (!item) return { success: false, msg: 'Atividade não encontrada.' };

  const excluiuComSucesso = deleteRowById_(SHEETS.cronograma, payload.id);
  return excluiuComSucesso
    ? { success: true, msg: 'Atividade "' + item.atividade + '" excluída com sucesso.' }
    : { success: false, msg: 'Não foi possível excluir a atividade.' };
}
