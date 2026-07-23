/**
 * ============================================================================
 *  BACKEND_OBRAS.GS — CRUD completo do módulo Obras
 *  AG Construtora / ARCOS
 * ============================================================================
 *  Este arquivo cuida de CRIAR, LER, EDITAR e EXCLUIR obras.
 *
 *  IMPORTANTE — como o frontend deve chamar cada função:
 *   - Listar obras:        GET  ?acao=obras
 *   - Criar obra nova:     POST { tipo: 'obra_salvar', nome: '...', ... }        (SEM "id")
 *   - Editar obra:         POST { tipo: 'obra_salvar', id: 'OBR-123...', ... }   (COM "id")
 *   - Excluir obra:        POST { tipo: 'obra_excluir', id: 'OBR-123...' }
 *
 *  Os campos financeiros calculados (Faturado, A Faturar, Saldo Previsto,
 *  % de avanço) NÃO são calculados aqui — eles serão calculados no
 *  Backend_Dashboard.gs, cruzando esta aba com a aba MEDICOES e ADITIVOS.
 *  Este arquivo cuida apenas do cadastro "puro" da obra.
 * ============================================================================
 */

/** Lista todas as obras cadastradas. */
function getObras() {
  return { success: true, obras: sheetToObjects_(SHEETS.obras) };
}

/**
 * Cria uma obra nova OU edita uma existente (dependendo se payload.id veio
 * preenchido). Essa é a função que resolve o bug de "botão salvar não funciona".
 */
function salvarObra_(payload) {
  if (!payload || !payload.nome || String(payload.nome).trim() === '') {
    return { success: false, msg: 'O nome da obra é obrigatório.' };
  }

  // ── MODO EDIÇÃO (já existe um id) ─────────────────────────────────────
  if (payload.id) {
    const dadosParaAtualizar = {
      nome: payload.nome,
      endereco: payload.endereco || '',
      engenheiro: payload.engenheiro || '',
      email_eng: payload.email_eng || '',
      data_inicio: payload.data_inicio || '',
      data_prevista: payload.data_prevista || '',
      status: payload.status || 'Ativa',
      valor_contrato: parseFloat(payload.valor_contrato || 0)
    };
    const linhaAtualizada = updateObjectRowById_(SHEETS.obras, HEADERS.obras, payload.id, dadosParaAtualizar);

    if (linhaAtualizada === -1) {
      return { success: false, msg: 'Obra não encontrada para edição (id: ' + payload.id + ').' };
    }
    return { success: true, msg: 'Obra "' + payload.nome + '" atualizada com sucesso.' };
  }

  // ── MODO CRIAÇÃO (obra nova) ───────────────────────────────────────────
  const novoId = gerarId_('OBR');
  appendObjectRow_(SHEETS.obras, HEADERS.obras, {
    id: novoId,
    timestamp: new Date(),
    nome: payload.nome,
    endereco: payload.endereco || '',
    engenheiro: payload.engenheiro || '',
    email_eng: payload.email_eng || '',
    data_inicio: payload.data_inicio || '',
    data_prevista: payload.data_prevista || '',
    status: payload.status || 'Ativa',
    avanco_percent: 0,
    valor_contrato: parseFloat(payload.valor_contrato || 0),
    updated_at: new Date()
  });

  return { success: true, msg: 'Obra "' + payload.nome + '" cadastrada com sucesso.', id: novoId };
}

/**
 * Exclui uma obra pelo id.
 * ATENÇÃO: isso NÃO apaga automaticamente atas, medições, aditivos etc.
 * ligados a essa obra (fica registrado no histórico com o nome da obra
 * antiga). Se quiser um "excluir em cascata" no futuro, me avise.
 */
function excluirObra_(payload) {
  if (!payload || !payload.id) {
    return { success: false, msg: 'ID da obra não informado.' };
  }

  const obra = getObjectById_(SHEETS.obras, payload.id);
  if (!obra) {
    return { success: false, msg: 'Obra não encontrada.' };
  }

  const excluiuComSucesso = deleteRowById_(SHEETS.obras, payload.id);
  return excluiuComSucesso
    ? { success: true, msg: 'Obra "' + obra.nome + '" excluída com sucesso.' }
    : { success: false, msg: 'Não foi possível excluir a obra.' };
}
