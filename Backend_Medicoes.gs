/**
 * ============================================================================
 *  BACKEND_MEDICOES.GS — Medições (BM) com fluxo cronológico
 *  AG Construtora / ARCOS
 * ============================================================================
 *  A medição de uma obra acontece em 3 momentos DIFERENTES no tempo, não de
 *  uma vez só:
 *
 *   1️⃣ APRESENTADA  -> o engenheiro apresenta um valor medido (valor + data).
 *   2️⃣ VALIDADA     -> depois, o PCO confere e registra o valor validado.
 *   3️⃣ FATURADA     -> por fim, quando o financeiro fatura de fato, registra
 *                      o valor e a data do faturamento.
 *
 *  Por isso, ao invés de 3 abas diferentes, usamos UMA linha por medição
 *  (aba MEDICOES) com 3 pares de colunas (valor+data para cada fase). Assim,
 *  as 3 informações aparecem SEMPRE lado a lado no histórico — e cada fase
 *  pode ser preenchida em um momento diferente, sem perder a anterior.
 *
 *  O campo "status" é recalculado automaticamente (calcularStatusMedicao_)
 *  toda vez que uma fase é preenchida — ele reflete sempre a fase MAIS
 *  avançada que já tem valor preenchido.
 *
 *  Funções deste arquivo:
 *   - getMedicoes(params)             -> lista (filtros: obra, status, competencia)
 *   - salvarMedicaoApresentada_()     -> cria a medição (fase 1) OU edita a fase 1
 *   - salvarMedicaoValidada_()        -> preenche a fase 2 de uma medição existente
 *   - salvarMedicaoFaturada_()        -> preenche a fase 3 de uma medição existente
 *   - excluirMedicao_()               -> exclui a medição inteira
 * ============================================================================
 */


/** Lista as medições, com filtros opcionais de obra / status / competência. */
function getMedicoes(params) {
  let linhas = sheetToObjects_(SHEETS.medicoes);

  if (params) {
    if (params.obra) linhas = linhas.filter(function (m) { return String(m.obra) === params.obra; });
    if (params.status) linhas = linhas.filter(function (m) { return String(m.status) === params.status; });
    if (params.competencia) linhas = linhas.filter(function (m) { return String(m.competencia) === params.competencia; });
  }

  linhas.sort(function (a, b) { return new Date(b.timestamp || 0) - new Date(a.timestamp || 0); });

  return { success: true, medicoes: linhas };
}

/**
 * FASE 1 — Cria uma medição nova (só com os dados Apresentados) OU edita os
 * dados da fase Apresentada de uma medição já existente (se vier "id").
 * Campos obrigatórios: obra, valor_apresentado, data_apresentado.
 */
function salvarMedicaoApresentada_(payload) {
  if (!payload || !payload.obra) return { success: false, msg: 'Selecione a obra.' };
  if (!payload.valor_apresentado || parseFloat(payload.valor_apresentado) <= 0) {
    return { success: false, msg: 'Informe o valor apresentado.' };
  }
  if (!payload.data_apresentado) return { success: false, msg: 'Informe a data de apresentação.' };

  const dadosDaFase1 = {
    obra: payload.obra,
    numero_bm: payload.numero_bm || '',
    competencia: payload.competencia || '',
    valor_apresentado: parseFloat(payload.valor_apresentado),
    data_apresentado: payload.data_apresentado,
    obs: payload.obs || ''
  };

  // ── MODO EDIÇÃO (só mexe nos campos da fase Apresentada) ─────────────────
  if (payload.id) {
    const existente = getObjectById_(SHEETS.medicoes, payload.id);
    if (!existente) return { success: false, msg: 'Medição não encontrada para edição.' };

    dadosDaFase1.status = calcularStatusMedicao_(Object.assign({}, existente, dadosDaFase1));
    updateObjectRowById_(SHEETS.medicoes, HEADERS.medicoes, payload.id, dadosDaFase1);
    return { success: true, msg: 'Medição (fase Apresentada) atualizada.' };
  }

  // ── MODO CRIAÇÃO — a medição nasce sempre na fase 1 ──────────────────────
  const novoId = gerarId_('MED');
  const dadosCompletos = Object.assign({
    id: novoId,
    timestamp: new Date(),
    valor_validado: '', data_validado: '',
    valor_faturado: '', data_faturado: '',
    status: 'Apresentada',
    updated_at: new Date()
  }, dadosDaFase1);

  appendObjectRow_(SHEETS.medicoes, HEADERS.medicoes, dadosCompletos);
  return { success: true, msg: 'Medição apresentada registrada. Aguardando validação.', id: novoId };
}

/**
 * FASE 2 — Preenche o valor/data VALIDADOS de uma medição que já existe.
 * Exige "id" (a medição precisa ter sido apresentada primeiro).
 */
function salvarMedicaoValidada_(payload) {
  if (!payload || !payload.id) return { success: false, msg: 'Selecione a medição que será validada.' };

  const existente = getObjectById_(SHEETS.medicoes, payload.id);
  if (!existente) return { success: false, msg: 'Medição não encontrada.' };

  if (payload.valor_validado === undefined || payload.valor_validado === '' || parseFloat(payload.valor_validado) < 0) {
    return { success: false, msg: 'Informe o valor validado.' };
  }
  if (!payload.data_validado) return { success: false, msg: 'Informe a data de validação.' };

  const dados = {
    valor_validado: parseFloat(payload.valor_validado),
    data_validado: payload.data_validado
  };
  dados.status = calcularStatusMedicao_(Object.assign({}, existente, dados));

  updateObjectRowById_(SHEETS.medicoes, HEADERS.medicoes, payload.id, dados);
  return { success: true, msg: 'Medição validada com sucesso.' };
}

/**
 * FASE 3 — Preenche o valor/data FATURADOS de uma medição que já existe.
 * Exige "id". Este valor é o que entra no KPI "Faturado" do Dashboard.
 */
function salvarMedicaoFaturada_(payload) {
  if (!payload || !payload.id) return { success: false, msg: 'Selecione a medição que será faturada.' };

  const existente = getObjectById_(SHEETS.medicoes, payload.id);
  if (!existente) return { success: false, msg: 'Medição não encontrada.' };

  if (payload.valor_faturado === undefined || payload.valor_faturado === '' || parseFloat(payload.valor_faturado) < 0) {
    return { success: false, msg: 'Informe o valor faturado.' };
  }
  if (!payload.data_faturado) return { success: false, msg: 'Informe a data de faturamento.' };

  const dados = {
    valor_faturado: parseFloat(payload.valor_faturado),
    data_faturado: payload.data_faturado
  };
  dados.status = calcularStatusMedicao_(Object.assign({}, existente, dados));

  updateObjectRowById_(SHEETS.medicoes, HEADERS.medicoes, payload.id, dados);
  return { success: true, msg: 'Medição faturada com sucesso.' };
}

/** Exclui a medição inteira (todas as 3 fases), pelo id. */
function excluirMedicao_(payload) {
  if (!payload || !payload.id) return { success: false, msg: 'ID da medição não informado.' };
  const excluiuComSucesso = deleteRowById_(SHEETS.medicoes, payload.id);
  return excluiuComSucesso
    ? { success: true, msg: 'Medição excluída com sucesso.' }
    : { success: false, msg: 'Medição não encontrada.' };
}

/**
 * Decide o "status" de uma medição de acordo com a fase MAIS avançada que
 * já tem valor preenchido (Faturada > Validada > Apresentada). Chamada
 * sempre que qualquer uma das 3 fases é salva, pra manter o status coerente
 * não importa em que ordem os campos forem preenchidos.
 */
function calcularStatusMedicao_(medicao) {
  if (medicao.valor_faturado && parseFloat(medicao.valor_faturado) > 0) return 'Faturada';
  if (medicao.valor_validado && parseFloat(medicao.valor_validado) > 0) return 'Validada';
  return 'Apresentada';
}
