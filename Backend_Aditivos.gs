/**
 * ============================================================================
 *  BACKEND_ADITIVOS.GS — Fluxo de Aditivos Contratuais
 *  AG Construtora / ARCOS
 * ============================================================================
 *  REGRA DE NEGÓCIO PRINCIPAL (pedida pela consultoria):
 *  Cada OBRA só pode ter UM aditivo "em aberto" por vez. Enquanto um aditivo
 *  não chegar a um status FINAL (Liberado ou Reprovado), não é possível
 *  cadastrar outro aditivo novo para a mesma obra — isso é o "status geral
 *  único por obra". Quando o fluxo termina (Liberado/Reprovado), a obra fica
 *  livre de novo ("zerado") para iniciar um novo aditivo.
 *
 *  FLUXOGRAMA DE STATUS (definido em FLUXO_ADITIVOS, logo abaixo):
 *   Pendente documentação
 *     -> Análise diretoria
 *          -> Aprovado diretoria -> Ext: Análise fiscal -> Ext: Aprovado fiscal
 *             -> Ext: Trâmites internos órgão -> PGE -> Publicado -> Liberado
 *          -> Reprovado (fim do fluxo)
 *
 *  REAJUSTE DE VALOR POR ETAPA:
 *  Toda vez que o status avança (avancarStatusAditivo_), quem está usando o
 *  sistema informa se o valor "se manteve igual" ao da etapa anterior:
 *   - Se SIM  -> o valor_atual continua o mesmo, só o status muda.
 *   - Se NÃO  -> é obrigatório informar "valor_ajustado" para essa etapa.
 *  Cada mudança de valor fica registrada no "historico_status" (um JSON com
 *  a lista de todas as etapas percorridas, valor de cada uma e a data).
 *
 *  Funções deste arquivo:
 *   - getFluxoAditivos()            -> devolve o fluxograma (pro frontend desenhar)
 *   - getAditivos(params)           -> lista (filtros: obra, status)
 *   - salvarAditivo_()              -> cria um aditivo novo OU edita dados de cadastro
 *   - avancarStatusAditivo_()       -> avança o aditivo para o próximo status do fluxo
 *   - excluirAditivo_()             -> exclui um aditivo
 * ============================================================================
 */


/* ============================================================================
 * 1. DEFINIÇÃO DO FLUXOGRAMA (fonte única da verdade — usada pelo backend E
 *    poderá ser lida pelo frontend via getFluxoAditivos(), pra nunca ficar
 *    dessincronizado entre os dois lados).
 * ========================================================================= */
const FLUXO_ADITIVOS = [
  { status: 'Pendente documentação',        proximos: ['Análise diretoria'] },
  { status: 'Análise diretoria',            proximos: ['Aprovado diretoria', 'Reprovado'] },
  { status: 'Aprovado diretoria',           proximos: ['Ext: Análise fiscal'] },
  { status: 'Reprovado',                    proximos: [] }, // fim do fluxo (obra fica livre pra novo aditivo)
  { status: 'Ext: Análise fiscal',          proximos: ['Ext: Aprovado fiscal'] },
  { status: 'Ext: Aprovado fiscal',         proximos: ['Ext: Trâmites internos órgão'] },
  { status: 'Ext: Trâmites internos órgão', proximos: ['PGE'] },
  { status: 'PGE',                          proximos: ['Publicado'] },
  { status: 'Publicado',                    proximos: ['Liberado'] },
  { status: 'Liberado',                     proximos: [] }  // fim do fluxo (obra fica livre pra novo aditivo)
];

/** Status que ENCERRAM o fluxo de um aditivo — liberando a obra para um aditivo novo. */
const STATUS_TERMINAIS_ADITIVO = ['Liberado', 'Reprovado'];

/** Devolve o fluxograma completo, pra o frontend desenhar os passos e os botões certos. */
function getFluxoAditivos() {
  return { success: true, fluxo: FLUXO_ADITIVOS, status_terminais: STATUS_TERMINAIS_ADITIVO };
}

/** Devolve quais status são um próximo passo VÁLIDO a partir do status atual. */
function proximosStatusPossiveis_(statusAtual) {
  const item = FLUXO_ADITIVOS.find(function (f) { return f.status === statusAtual; });
  return item ? item.proximos : []; // status desconhecido/corrompido -> nenhum próximo passo (seguro)
}


/* ============================================================================
 * 2. LEITURA
 * ========================================================================= */

/**
 * Lista os aditivos, com filtros opcionais de obra / status.
 * O campo "historico_status" já vem convertido de volta pra array de objetos
 * (na planilha ele é guardado como texto/JSON).
 */
function getAditivos(params) {
  let linhas = sheetToObjects_(SHEETS.aditivos).map(function (a) {
    try { a.historico_status = JSON.parse(a.historico_status || '[]'); }
    catch (erroDeLeitura) { a.historico_status = []; }
    return a;
  });

  if (params) {
    if (params.obra) linhas = linhas.filter(function (a) { return String(a.obra) === params.obra; });
    if (params.status) linhas = linhas.filter(function (a) { return String(a.status_atual) === params.status; });
  }

  linhas.sort(function (a, b) { return new Date(b.timestamp || 0) - new Date(a.timestamp || 0); });
  return { success: true, aditivos: linhas };
}

/** Verifica se uma obra JÁ TEM um aditivo em aberto (status ainda não terminal). */
function obraTemAditivoEmAberto_(nomeObra) {
  const aditivosDaObra = sheetToObjects_(SHEETS.aditivos).filter(function (a) { return String(a.obra) === String(nomeObra); });
  return aditivosDaObra.find(function (a) { return STATUS_TERMINAIS_ADITIVO.indexOf(a.status_atual) === -1; }) || null;
}


/* ============================================================================
 * 3. CRIAR / EDITAR DADOS DE CADASTRO
 * ----------------------------------------------------------------------------
 *  Esta função cuida só dos dados "de cadastro" do aditivo (número, descrição,
 *  observação). A MUDANÇA DE STATUS/VALOR é feita por avancarStatusAditivo_(),
 *  separadamente — assim fica claro na tela quem edita o quê.
 * ========================================================================= */

/**
 * Cria um aditivo novo (sempre começa em "Pendente documentação") OU edita os
 * dados de cadastro de um aditivo já existente (se vier "id" — nesse caso
 * status/valor_atual NÃO são alterados por aqui).
 */
function salvarAditivo_(payload) {
  if (!payload || !payload.obra) return { success: false, msg: 'Selecione a obra.' };
  if (!payload.descricao || String(payload.descricao).trim() === '') {
    return { success: false, msg: 'Descreva o objeto do aditivo.' };
  }

  // ── MODO EDIÇÃO — só dados de cadastro, o fluxo de status não é tocado ───
  if (payload.id) {
    const existente = getObjectById_(SHEETS.aditivos, payload.id);
    if (!existente) return { success: false, msg: 'Aditivo não encontrado para edição.' };

    updateObjectRowById_(SHEETS.aditivos, HEADERS.aditivos, payload.id, {
      numero: payload.numero !== undefined ? payload.numero : existente.numero,
      descricao: payload.descricao,
      obs: payload.obs !== undefined ? payload.obs : existente.obs
    });
    return { success: true, msg: 'Aditivo atualizado com sucesso.' };
  }

  // ── MODO CRIAÇÃO — valida a regra de "1 fluxo aberto por obra" ───────────
  if (!payload.valor_original || parseFloat(payload.valor_original) <= 0) {
    return { success: false, msg: 'Informe o valor original do aditivo.' };
  }

  const aditivoEmAberto = obraTemAditivoEmAberto_(payload.obra);
  if (aditivoEmAberto) {
    return {
      success: false,
      msg: 'A obra "' + payload.obra + '" já tem um aditivo em andamento (status atual: "' +
        aditivoEmAberto.status_atual + '"). Finalize esse fluxo (Liberado ou Reprovado) ' +
        'antes de abrir um novo aditivo para esta obra.'
    };
  }

  const valorInicial = parseFloat(payload.valor_original);
  const agora = new Date();
  const novoId = gerarId_('ADT');

  const historicoInicial = [{
    etapa: 'Pendente documentação',
    valor: valorInicial,
    manteve_valor: true,
    data: Utilities.formatDate(agora, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss"),
    obs: ''
  }];

  appendObjectRow_(SHEETS.aditivos, HEADERS.aditivos, {
    id: novoId,
    timestamp: agora,
    obra: payload.obra,
    numero: payload.numero || '',
    descricao: payload.descricao,
    valor_original: valorInicial,
    valor_atual: valorInicial,
    status_atual: 'Pendente documentação',
    historico_status: JSON.stringify(historicoInicial),
    data_criacao: agora,
    updated_at: agora,
    obs: payload.obs || ''
  });

  return { success: true, msg: 'Aditivo criado com sucesso, iniciando no status "Pendente documentação".', id: novoId };
}


/* ============================================================================
 * 4. AVANÇAR O STATUS (o coração deste módulo)
 * ========================================================================= */

/**
 * Avança um aditivo para o próximo status do fluxo.
 * @param {Object} payload {
 *   id             : id do aditivo (obrigatório)
 *   novo_status    : o status de destino — precisa ser um "próximo válido" (obrigatório)
 *   manteve_valor  : true/false — o valor continua igual ao da etapa anterior?
 *   valor_ajustado : obrigatório SE manteve_valor for false
 *   obs            : observação opcional sobre esta mudança de etapa
 * }
 */
function avancarStatusAditivo_(payload) {
  if (!payload || !payload.id) return { success: false, msg: 'Selecione o aditivo.' };
  if (!payload.novo_status) return { success: false, msg: 'Informe o novo status.' };

  const aditivo = getObjectById_(SHEETS.aditivos, payload.id);
  if (!aditivo) return { success: false, msg: 'Aditivo não encontrado.' };

  // ── Valida se essa transição é permitida pelo fluxograma ─────────────────
  const possiveis = proximosStatusPossiveis_(aditivo.status_atual);
  if (possiveis.indexOf(payload.novo_status) === -1) {
    const opcoes = possiveis.length > 0 ? possiveis.join(' ou ') : '(nenhum — este fluxo já foi finalizado)';
    return {
      success: false,
      msg: 'Não é possível ir de "' + aditivo.status_atual + '" direto para "' + payload.novo_status +
        '". A partir de "' + aditivo.status_atual + '", o próximo passo válido é: ' + opcoes + '.'
    };
  }

  // ── Decide o valor desta etapa: manteve o de antes, ou foi reajustado? ───
  // Se "manteve_valor" não vier explícito no payload, assumimos TRUE (o caso
  // mais comum é o valor não mudar de uma etapa pra outra).
  const manteveValor = payload.manteve_valor !== false;
  let valorDestaEtapa;

  if (manteveValor) {
    valorDestaEtapa = parseFloat(aditivo.valor_atual || aditivo.valor_original || 0);
  } else {
    const valorInformado = parseFloat(payload.valor_ajustado);
    if (payload.valor_ajustado === undefined || payload.valor_ajustado === '' || isNaN(valorInformado)) {
      return { success: false, msg: 'Como o valor mudou nesta etapa, informe o "Valor Ajustado".' };
    }
    valorDestaEtapa = valorInformado;
  }

  // ── Grava a nova entrada no histórico (sem perder as anteriores) ─────────
  let historico = [];
  try { historico = JSON.parse(aditivo.historico_status || '[]'); }
  catch (erroDeLeitura) { historico = []; }

  historico.push({
    etapa: payload.novo_status,
    valor: valorDestaEtapa,
    manteve_valor: manteveValor,
    data: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss"),
    obs: payload.obs || ''
  });

  updateObjectRowById_(SHEETS.aditivos, HEADERS.aditivos, payload.id, {
    status_atual: payload.novo_status,
    valor_atual: valorDestaEtapa,
    historico_status: JSON.stringify(historico)
  });

  // ── Mensagem de confirmação, com aviso especial se o fluxo terminou ──────
  let avisoFinal = '';
  if (payload.novo_status === 'Liberado') {
    avisoFinal = ' 🎉 Fluxo finalizado! Este valor já entra no total do contrato da obra, e a obra está livre para um novo aditivo, se precisar.';
  } else if (payload.novo_status === 'Reprovado') {
    avisoFinal = ' Fluxo encerrado como Reprovado — a obra já está livre para iniciar um novo aditivo, se necessário.';
  }

  return { success: true, msg: 'Status avançado para "' + payload.novo_status + '".' + avisoFinal };
}


/* ============================================================================
 * 5. EXCLUIR
 * ========================================================================= */

/**
 * Exclui um aditivo pelo id (remove o registro inteiro, com todo o histórico
 * de etapas). Se ele já estava "Liberado", avisa que isso vai afetar os
 * totais financeiros do Dashboard (já que esse valor deixa de contar).
 */
function excluirAditivo_(payload) {
  if (!payload || !payload.id) return { success: false, msg: 'ID do aditivo não informado.' };

  const aditivo = getObjectById_(SHEETS.aditivos, payload.id);
  if (!aditivo) return { success: false, msg: 'Aditivo não encontrado.' };

  const excluiuComSucesso = deleteRowById_(SHEETS.aditivos, payload.id);
  if (!excluiuComSucesso) return { success: false, msg: 'Não foi possível excluir o aditivo.' };

  const aviso = (aditivo.status_atual === 'Liberado')
    ? ' Atenção: este aditivo já estava "Liberado" e contava no valor total do contrato — o Dashboard será recalculado sem ele.'
    : '';

  return { success: true, msg: 'Aditivo excluído com sucesso.' + aviso };
}
