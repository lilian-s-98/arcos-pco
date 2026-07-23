/**
 * ============================================================================
 *  BACKEND_ENGENHEIROS.GS — CRUD completo do módulo Equipes/Engenheiros
 *  AG Construtora / ARCOS
 * ============================================================================
 *  Este arquivo cuida de CRIAR, LER, EDITAR e EXCLUIR engenheiros/equipe técnica.
 *
 *  Como o frontend deve chamar cada função:
 *   - Listar engenheiros:  GET  ?acao=engenheiros
 *   - Criar engenheiro:    POST { tipo: 'engenheiro_salvar', nome_completo: '...', ... }        (SEM "id")
 *   - Editar engenheiro:   POST { tipo: 'engenheiro_salvar', id: 'ENG-123...', ... }             (COM "id")
 *   - Excluir engenheiro:  POST { tipo: 'engenheiro_excluir', id: 'ENG-123...' }
 * ============================================================================
 */

/** Lista todos os engenheiros/equipe técnica cadastrados. */
function getEngenheiros() {
  return { success: true, engenheiros: sheetToObjects_(SHEETS.engenheiros) };
}

/**
 * Cria um engenheiro novo OU edita um existente (dependendo se payload.id
 * veio preenchido).
 */
function salvarEngenheiro_(payload) {
  if (!payload || !payload.nome_completo || String(payload.nome_completo).trim() === '') {
    return { success: false, msg: 'O nome do engenheiro é obrigatório.' };
  }

  // ── MODO EDIÇÃO ─────────────────────────────────────────────────────────
  if (payload.id) {
    const dadosParaAtualizar = {
      nome_completo: payload.nome_completo,
      email: payload.email || '',
      telefone: payload.telefone || '',
      crea: payload.crea || '',
      obra_vinculada: payload.obra_vinculada || '',
      obras_secundarias: payload.obras_secundarias || '',
      ativo: payload.ativo !== undefined ? payload.ativo : true
    };
    const linhaAtualizada = updateObjectRowById_(SHEETS.engenheiros, HEADERS.engenheiros, payload.id, dadosParaAtualizar);

    if (linhaAtualizada === -1) {
      return { success: false, msg: 'Engenheiro não encontrado para edição (id: ' + payload.id + ').' };
    }
    return { success: true, msg: 'Engenheiro "' + payload.nome_completo + '" atualizado com sucesso.' };
  }

  // ── MODO CRIAÇÃO ────────────────────────────────────────────────────────
  const novoId = gerarId_('ENG');
  appendObjectRow_(SHEETS.engenheiros, HEADERS.engenheiros, {
    id: novoId,
    nome_completo: payload.nome_completo,
    email: payload.email || '',
    telefone: payload.telefone || '',
    crea: payload.crea || '',
    obra_vinculada: payload.obra_vinculada || '',
    obras_secundarias: payload.obras_secundarias || '',
    ativo: payload.ativo !== undefined ? payload.ativo : true,
    data_cadastro: new Date(),
    updated_at: new Date()
  });

  return { success: true, msg: 'Engenheiro "' + payload.nome_completo + '" cadastrado com sucesso.', id: novoId };
}

/** Exclui um engenheiro pelo id. */
function excluirEngenheiro_(payload) {
  if (!payload || !payload.id) {
    return { success: false, msg: 'ID do engenheiro não informado.' };
  }

  const engenheiro = getObjectById_(SHEETS.engenheiros, payload.id);
  if (!engenheiro) {
    return { success: false, msg: 'Engenheiro não encontrado.' };
  }

  const excluiuComSucesso = deleteRowById_(SHEETS.engenheiros, payload.id);
  return excluiuComSucesso
    ? { success: true, msg: 'Engenheiro "' + engenheiro.nome_completo + '" excluído com sucesso.' }
    : { success: false, msg: 'Não foi possível excluir o engenheiro.' };
}
