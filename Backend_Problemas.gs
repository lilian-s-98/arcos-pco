/**
 * ============================================================================
 *  BACKEND_PROBLEMAS.GS — Problemas de Obra
 *  AG Construtora / ARCOS
 * ============================================================================
 *  Este arquivo cuida do CRUD completo de Problemas de Obra:
 *   - getProblemas()      -> lista (com filtros opcionais de obra/categoria/status)
 *   - salvarProblema_()   -> cria ou edita um problema (registrado manualmente
 *                            pelo PCO direto nesta tela)
 *   - excluirProblema_()  -> exclui um problema
 *
 *  IMPORTANTE: os problemas gerados AUTOMATICAMENTE a partir de uma Ata
 *  Semanal (campo origem = "Ata") também vivem nesta MESMA aba PROBLEMAS —
 *  é assim que a integração pedida funciona: "puxar automaticamente os
 *  problemas relatados na Ata Semanal" simplesmente significa que
 *  getProblemas() já devolve os dois tipos juntos, sem esforço nenhum do
 *  frontend. Quem cria/mantém os automáticos é o Backend_Atas.gs
 *  (função sincronizarProblemaAutomaticoDaAta_).
 *
 *  BUG CORRIGIDO — "semana de referência muda sozinha ao clicar":
 *  A coluna "semana_referencia" é SEMPRE tratada como texto puro (string),
 *  nunca convertida para um objeto Date em nenhum momento — nem ao salvar,
 *  nem ao ler de volta. Isso elimina o efeito de fuso horário que causava
 *  o bug no sistema anterior.
 * ============================================================================
 */


/** Lista fixa de categorias de problema — usada tanto aqui quanto no
 *  formulário da Ata Semanal (campo "motivo_desvio"), pra garantir que as
 *  duas telas sempre falem a "mesma língua" de categorias. */
const CATEGORIAS_PROBLEMA = [
  'Chuva / Intempéries',
  'Falta de Material',
  'Mão de Obra Insuficiente',
  'Projeto / Aprovação Pendente',
  'Equipamento Parado',
  'Interferência de Terceiros',
  'Retrabalho / Não Conformidade',
  'Atraso de Subempreiteiro',
  'Problema Financeiro',
  'Licença / Documentação',
  'Outro'
];

/** Lista fixa de status possíveis de um problema. */
const STATUS_PROBLEMA = ['Aberto', 'Em Andamento', 'Resolvido', 'Irreversível'];


/** Devolve a lista de categorias — usado pelo frontend para montar os <select>. */
function getCategoriasProblema() {
  return { success: true, categorias: CATEGORIAS_PROBLEMA, status: STATUS_PROBLEMA };
}

/**
 * Lista os problemas de obra, com filtros opcionais.
 * @param {Object} params  { obra, categoria, status } — todos opcionais.
 */
function getProblemas(params) {
  let linhas = sheetToObjects_(SHEETS.problemas);

  if (params) {
    if (params.obra) linhas = linhas.filter(function (p) { return String(p.obra) === params.obra; });
    if (params.categoria) linhas = linhas.filter(function (p) { return String(p.categoria) === params.categoria; });
    if (params.status) linhas = linhas.filter(function (p) { return String(p.status) === params.status; });
  }

  // Mais recentes primeiro (fica mais prático de olhar no site)
  linhas.sort(function (a, b) { return new Date(b.timestamp || 0) - new Date(a.timestamp || 0); });

  return { success: true, problemas: linhas };
}

/**
 * Cria ou edita um problema de obra registrado MANUALMENTE.
 *  - Para CRIAR: não envie "id".
 *  - Para EDITAR: envie "id" do problema existente.
 * O campo "semana_referencia" é sempre gravado exatamente como veio do
 * frontend (texto puro) — nunca é interpretado como data.
 */
function salvarProblema_(payload) {
  if (!payload || !payload.obra) return { success: false, msg: 'Selecione a obra.' };
  if (!payload.categoria) return { success: false, msg: 'Selecione a categoria do problema.' };
  if (!payload.descricao || String(payload.descricao).trim() === '') {
    return { success: false, msg: 'Descreva o problema.' };
  }

  const status = STATUS_PROBLEMA.indexOf(payload.status) !== -1 ? payload.status : 'Aberto';

  const dadosComuns = {
    obra: payload.obra,
    semana_referencia: payload.semana_referencia ? String(payload.semana_referencia) : '', // TEXTO puro, sempre
    atividade: payload.atividade || '',
    categoria: payload.categoria,
    descricao: payload.descricao,
    impacto_dias: parseFloat(payload.impacto_dias || 0),
    responsavel: payload.responsavel || '',
    acao_corretiva: payload.acao_corretiva || '',
    status: status,
    causou_atraso: payload.causou_atraso === 'Sim' ? 'Sim' : 'Não'
  };

  // ── MODO EDIÇÃO ───────────────────────────────────────────────────────────
  if (payload.id) {
    const linhaAtualizada = updateObjectRowById_(SHEETS.problemas, HEADERS.problemas, payload.id, dadosComuns);
    if (linhaAtualizada === -1) {
      return { success: false, msg: 'Problema não encontrado para edição (id: ' + payload.id + ').' };
    }
    return { success: true, msg: 'Problema atualizado com sucesso.' };
  }

  // ── MODO CRIAÇÃO (manual — não veio de nenhuma Ata) ────────────────────────
  const novoId = gerarId_('PRB');
  appendObjectRow_(SHEETS.problemas, HEADERS.problemas, Object.assign({
    id: novoId,
    timestamp: new Date(),
    origem: 'Manual',
    ata_id: '',
    updated_at: new Date()
  }, dadosComuns));

  return { success: true, msg: 'Problema registrado com sucesso.', id: novoId };
}

/**
 * Exclui um problema de obra pelo id.
 * Se o problema tiver vindo automaticamente de uma Ata (origem="Ata"), o
 * usuário é avisado que isso não desfaz o desvio registrado na ata — só
 * remove o card daqui. Se a ata for salva de novo sem alterações, o
 * problema automático pode voltar a ser criado (é assim que a sincronia
 * funciona, de propósito).
 */
function excluirProblema_(payload) {
  if (!payload || !payload.id) return { success: false, msg: 'ID do problema não informado.' };

  const problema = getObjectById_(SHEETS.problemas, payload.id);
  if (!problema) return { success: false, msg: 'Problema não encontrado.' };

  const excluiuComSucesso = deleteRowById_(SHEETS.problemas, payload.id);
  if (!excluiuComSucesso) return { success: false, msg: 'Não foi possível excluir o problema.' };

  const avisoOrigemAta = (problema.origem === 'Ata')
    ? ' Atenção: este problema foi gerado a partir de uma Ata Semanal — se a ata continuar com o mesmo desvio, ele pode ser recriado automaticamente na próxima vez que a ata for salva.'
    : '';

  return { success: true, msg: 'Problema excluído com sucesso.' + avisoOrigemAta };
}


/* ============================================================================
 * INDICADORES (usados hoje pelo Dashboard e, mais pra frente, pelos Relatórios)
 * ========================================================================= */

/** Conta quantos problemas existem por categoria — para gráficos de barras. */
function getTopCategoriasProblema() {
  const problemas = sheetToObjects_(SHEETS.problemas);
  const contagemPorCategoria = {};

  problemas.forEach(function (p) {
    const categoria = p.categoria || 'Outro';
    contagemPorCategoria[categoria] = (contagemPorCategoria[categoria] || 0) + 1;
  });

  const listaOrdenada = Object.keys(contagemPorCategoria)
    .map(function (categoria) { return { categoria: categoria, quantidade: contagemPorCategoria[categoria] }; })
    .sort(function (a, b) { return b.quantidade - a.quantidade; });

  return { success: true, top_categorias: listaOrdenada };
}
