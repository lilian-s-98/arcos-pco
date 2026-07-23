/**
 * ============================================================================
 *  BACKEND_ROTINA.GS — Checklist diário, Calendário e Aderência mensal
 *  AG Construtora / ARCOS
 * ============================================================================
 *  Este arquivo cuida de 3 telas que, no site, ficam juntas na aba "Rotina":
 *
 *   1. CHECKLIST DO DIA
 *      - getChecklistDoDia({data:'2026-07-23'}) -> lista as atividades que
 *        DEVEM aparecer NAQUELE dia específico (usando a regra de recorrência
 *        de cada atividade) + o status já marcado (se houver).
 *      - salvarRotinaCheck_() -> marca uma atividade como Feito / Pendente / N-A
 *        num dia específico.
 *
 *   2. CALENDÁRIO
 *      - getCalendarioMes({mes:'2026-07'}) -> devolve, para cada dia do mês,
 *        quais atividades Semanais/Mensais caem naquele dia (pra desenhar
 *        as bolinhas coloridas no calendário).
 *
 *   3. ADERÊNCIA
 *      - recalcularAderencia_(mes) -> confere quantas vezes cada atividade
 *        DEVERIA ter sido feita no mês (esperado) x quantas vezes foi
 *        realmente marcada como "Feito" (realizado), e grava o % na aba
 *        ROTINA_ADERENCIA.
 *      - getRotinaAderencia({mes:'2026-07'}) -> lê esse resultado já calculado.
 *
 *  ⚙️ O CORAÇÃO DESTE ARQUIVO é a função atividadeAplicaNaData_() — é ela
 *  quem decide "essa atividade deve aparecer NESSE dia específico?", usando
 *  a recorrência configurada em cada atividade (Diária / Semanal / Quinzenal
 *  / Mensal com dia corrido, dia útil ou último dia útil).
 * ============================================================================
 */


/* ============================================================================
 * 1. REGRA DE RECORRÊNCIA — "essa atividade cai nesse dia?"
 * ========================================================================= */

/**
 * Decide se UMA atividade de rotina deve aparecer em UMA data específica.
 * @param {Object} atividade  Um registro da aba ROTINA_ATIVIDADES.
 * @param {Date}   dataObj    A data que estamos conferindo (objeto Date do JS).
 * @return {boolean}
 */
function atividadeAplicaNaData_(atividade, dataObj) {
  const frequencia = String(atividade.frequencia || '').trim();
  const diaDaSemanaNumero = dataObj.getDay(); // 0=Domingo ... 6=Sábado

  // ── Diária: todo dia útil (segunda a sexta) ────────────────────────────
  if (frequencia === 'Diária') {
    return diaDaSemanaNumero !== 0 && diaDaSemanaNumero !== 6;
  }

  // ── Semanal: só no dia da semana escolhido no cadastro ─────────────────
  if (frequencia === 'Semanal') {
    const mapaDiaSemana = {
      'Domingo': 0, 'Segunda-feira': 1, 'Terça-feira': 2, 'Quarta-feira': 3,
      'Quinta-feira': 4, 'Sexta-feira': 5, 'Sábado': 6
    };
    const diaEsperado = mapaDiaSemana[atividade.dia_semana];
    return diaEsperado !== undefined && diaDaSemanaNumero === diaEsperado;
  }

  // ── Quinzenal: dias 1 e 16 de cada mês (regra simples e previsível) ────
  if (frequencia === 'Quinzenal') {
    const diaDoMes = dataObj.getDate();
    return diaDoMes === 1 || diaDoMes === 16;
  }

  // ── Mensal: 3 formatos possíveis, escolhidos no cadastro da atividade ──
  if (frequencia === 'Mensal') {
    const tipo = String(atividade.dia_mes_tipo || '');

    if (tipo === 'ultimo_util') {
      return dataObj.getDate() === ultimoDiaUtilDoMes_(dataObj.getFullYear(), dataObj.getMonth() + 1);
    }
    if (tipo === 'corrido') {
      return dataObj.getDate() === Number(atividade.dia_mes_valor);
    }
    if (tipo === 'util') {
      return dataObj.getDate() === nEsimoDiaUtilDoMes_(dataObj.getFullYear(), dataObj.getMonth() + 1, Number(atividade.dia_mes_valor));
    }
    return false; // Mensal sem tipo definido -> nunca aparece (mais seguro que aparecer todo dia por engano)
  }

  return false; // frequência desconhecida/vazia -> por segurança, nunca aparece
}

/** Devolve o número do ÚLTIMO dia útil (não sábado/domingo) de um mês. */
function ultimoDiaUtilDoMes_(ano, mesNumero) {
  const ultimoDiaDoMes = new Date(ano, mesNumero, 0).getDate();
  for (let dia = ultimoDiaDoMes; dia >= 1; dia--) {
    const diaDaSemana = new Date(ano, mesNumero - 1, dia).getDay();
    if (diaDaSemana !== 0 && diaDaSemana !== 6) return dia;
  }
  return ultimoDiaDoMes; // fallback (nunca deveria chegar aqui)
}

/** Devolve o número do N-ésimo dia útil de um mês (ex: o 10º dia útil). */
function nEsimoDiaUtilDoMes_(ano, mesNumero, n) {
  const ultimoDiaDoMes = new Date(ano, mesNumero, 0).getDate();
  let contadorDiasUteis = 0;
  for (let dia = 1; dia <= ultimoDiaDoMes; dia++) {
    const diaDaSemana = new Date(ano, mesNumero - 1, dia).getDay();
    if (diaDaSemana !== 0 && diaDaSemana !== 6) {
      contadorDiasUteis++;
      if (contadorDiasUteis === n) return dia;
    }
  }
  return ultimoDiaDoMes; // se "n" for maior que a quantidade de dias úteis do mês
}


/* ============================================================================
 * 2. CRUD DAS ATIVIDADES DE ROTINA (cadastro — não confundir com o checklist)
 * ========================================================================= */

/** Lista todas as atividades de rotina cadastradas (ativas e inativas). */
function getRotinaAtividades() {
  return { success: true, atividades: sheetToObjects_(SHEETS.rotina_atividades) };
}

/**
 * Cria ou edita uma atividade de rotina.
 * Regras de validação de acordo com a frequência escolhida:
 *  - Semanal  -> precisa de "dia_semana" (ex: "Segunda-feira")
 *  - Mensal   -> precisa de "dia_mes_tipo": 'corrido' | 'util' | 'ultimo_util'
 *               e, se for 'corrido' ou 'util', também precisa de "dia_mes_valor"
 */
function salvarRotinaAtividade_(payload) {
  if (!payload || !payload.titulo || String(payload.titulo).trim() === '') {
    return { success: false, msg: 'O título da atividade é obrigatório.' };
  }

  const frequencia = payload.frequencia || 'Diária';
  const frequenciasValidas = ['Diária', 'Semanal', 'Quinzenal', 'Mensal'];
  if (frequenciasValidas.indexOf(frequencia) === -1) {
    return { success: false, msg: 'Frequência inválida: "' + frequencia + '".' };
  }

  if (frequencia === 'Semanal' && !payload.dia_semana) {
    return { success: false, msg: 'Para frequência Semanal, escolha o dia da semana.' };
  }
  if (frequencia === 'Mensal') {
    if (!payload.dia_mes_tipo) {
      return { success: false, msg: 'Para frequência Mensal, escolha: dia corrido, dia útil ou último dia útil.' };
    }
    if ((payload.dia_mes_tipo === 'corrido' || payload.dia_mes_tipo === 'util') && !payload.dia_mes_valor) {
      return { success: false, msg: 'Informe o número do dia (corrido ou útil).' };
    }
  }

  const dadosComuns = {
    titulo: payload.titulo,
    descricao: payload.descricao || '',
    frequencia: frequencia,
    dia_semana: frequencia === 'Semanal' ? payload.dia_semana : '',
    dia_mes_tipo: frequencia === 'Mensal' ? payload.dia_mes_tipo : '',
    dia_mes_valor: (frequencia === 'Mensal' && payload.dia_mes_tipo !== 'ultimo_util') ? Number(payload.dia_mes_valor) : '',
    categoria: payload.categoria || 'Geral',
    ativo: payload.ativo !== undefined ? payload.ativo : true
  };

  // ── MODO EDIÇÃO ───────────────────────────────────────────────────────────
  if (payload.id) {
    const linhaAtualizada = updateObjectRowById_(SHEETS.rotina_atividades, HEADERS.rotina_atividades, payload.id, dadosComuns);
    if (linhaAtualizada === -1) {
      return { success: false, msg: 'Atividade não encontrada para edição (id: ' + payload.id + ').' };
    }
    return { success: true, msg: 'Atividade "' + payload.titulo + '" atualizada com sucesso.' };
  }

  // ── MODO CRIAÇÃO ──────────────────────────────────────────────────────────
  const novoId = gerarId_('ROT');
  const dadosCompletos = Object.assign(
    { id: novoId, data_criacao: new Date(), updated_at: new Date() },
    dadosComuns
  );
  appendObjectRow_(SHEETS.rotina_atividades, HEADERS.rotina_atividades, dadosCompletos);

  return { success: true, msg: 'Atividade "' + payload.titulo + '" criada com sucesso.', id: novoId };
}

/** Exclui uma atividade de rotina pelo id (não apaga o histórico já registrado dela). */
function excluirRotinaAtividade_(payload) {
  if (!payload || !payload.id) return { success: false, msg: 'ID da atividade não informado.' };

  const atividade = getObjectById_(SHEETS.rotina_atividades, payload.id);
  if (!atividade) return { success: false, msg: 'Atividade não encontrada.' };

  const excluiuComSucesso = deleteRowById_(SHEETS.rotina_atividades, payload.id);
  return excluiuComSucesso
    ? { success: true, msg: 'Atividade "' + atividade.titulo + '" excluída com sucesso.' }
    : { success: false, msg: 'Não foi possível excluir a atividade.' };
}


/* ============================================================================
 * 3. CHECKLIST DO DIA
 * ========================================================================= */

/**
 * Monta o checklist de UM dia específico: pega todas as atividades ATIVAS
 * cuja recorrência bate com essa data, e junta com o status já marcado
 * (se já tiver sido marcado antes). Se nunca foi marcado, status = "Pendente".
 * @param {Object} params  { data: 'yyyy-MM-dd' }
 */
function getChecklistDoDia(params) {
  if (!params || !params.data) {
    return { success: false, msg: 'Informe a data no formato yyyy-MM-dd.' };
  }

  // Meio-dia (12:00) evita problema clássico de fuso horário mudar o dia sozinho.
  const dataObj = new Date(params.data + 'T12:00:00');
  if (isNaN(dataObj.getTime())) {
    return { success: false, msg: 'Data inválida: "' + params.data + '".' };
  }

  const todasAtividades = sheetToObjects_(SHEETS.rotina_atividades).filter(function (a) {
    return campoEhVerdadeiro_(a.ativo);
  });
  const atividadesDoDia = todasAtividades.filter(function (a) {
    return atividadeAplicaNaData_(a, dataObj);
  });

  const historicoDoDia = sheetToObjects_(SHEETS.rotina_historico).filter(function (h) {
    return String(h.data).split('T')[0] === params.data;
  });

  const checklist = atividadesDoDia.map(function (a) {
    const registro = historicoDoDia.find(function (h) { return String(h.atividade_id) === String(a.id); });
    return {
      atividade_id: a.id,
      titulo: a.titulo,
      descricao: a.descricao,
      frequencia: a.frequencia,
      categoria: a.categoria,
      status: registro ? registro.status : 'Pendente', // 'Feito' | 'Pendente' | 'N/A'
      obs: registro ? registro.obs : ''
    };
  });

  return { success: true, data: params.data, checklist: checklist };
}

/**
 * Marca o status de UMA atividade em UMA data (Feito / Pendente / N/A).
 * Se já existir um registro para essa atividade+data, atualiza; senão, cria.
 * @param {Object} payload  { atividade_id, data:'yyyy-MM-dd', status, obs, usuario }
 */
function salvarRotinaCheck_(payload) {
  if (!payload || !payload.atividade_id || !payload.data) {
    return { success: false, msg: 'Informe a atividade e a data.' };
  }

  const statusValidos = ['Feito', 'Pendente', 'N/A'];
  const status = statusValidos.indexOf(payload.status) !== -1 ? payload.status : 'Pendente';
  const dataReferencia = String(payload.data).split('T')[0];

  const aba = getOrCreateSheet_(SHEETS.rotina_historico, HEADERS.rotina_historico);
  const dados = aba.getDataRange().getValues();
  const headerAtual = dados[0].map(String);
  const idxAtividadeId = headerAtual.indexOf('atividade_id');
  const idxData = headerAtual.indexOf('data');
  const idxStatus = headerAtual.indexOf('status');
  const idxObs = headerAtual.indexOf('obs');
  const idxUsuario = headerAtual.indexOf('usuario');
  const idxUpdated = headerAtual.indexOf('updated_at');

  // Procura se já existe um registro dessa atividade nessa data específica
  for (let i = 1; i < dados.length; i++) {
    const dataDaLinha = dados[i][idxData];
    const dataDaLinhaTexto = (dataDaLinha instanceof Date)
      ? Utilities.formatDate(dataDaLinha, Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(dataDaLinha).split('T')[0];

    if (String(dados[i][idxAtividadeId]) === String(payload.atividade_id) && dataDaLinhaTexto === dataReferencia) {
      aba.getRange(i + 1, idxStatus + 1).setValue(status);
      aba.getRange(i + 1, idxObs + 1).setValue(payload.obs || '');
      aba.getRange(i + 1, idxUsuario + 1).setValue(payload.usuario || '');
      if (idxUpdated !== -1) aba.getRange(i + 1, idxUpdated + 1).setValue(new Date());

      recalcularAderencia_(dataReferencia.substring(0, 7));
      return { success: true, msg: 'Checklist atualizado.' };
    }
  }

  // Não existia -> cria um registro novo
  appendObjectRow_(SHEETS.rotina_historico, HEADERS.rotina_historico, {
    id: gerarId_('CHK'),
    timestamp: new Date(),
    atividade_id: payload.atividade_id,
    data: dataReferencia,
    status: status,
    obs: payload.obs || '',
    usuario: payload.usuario || '',
    updated_at: new Date()
  });

  recalcularAderencia_(dataReferencia.substring(0, 7));
  return { success: true, msg: 'Checklist registrado.' };
}

/** Lê o histórico bruto de marcações, opcionalmente filtrado por mês (yyyy-MM). */
function getRotinaHistorico(params) {
  const mes = (params && params.mes) ? params.mes : null;
  let linhas = sheetToObjects_(SHEETS.rotina_historico);
  if (mes) {
    linhas = linhas.filter(function (h) { return String(h.data).split('T')[0].indexOf(mes) === 0; });
  }
  return { success: true, historico: linhas };
}


/* ============================================================================
 * 4. CALENDÁRIO DO MÊS
 * ========================================================================= */

/**
 * Para cada dia do mês informado, devolve quais atividades Semanais/Mensais
 * caem naquele dia (usado para desenhar o calendário visual).
 * OBS: eventos de "Ata registrada" serão somados a este calendário quando o
 * Backend_Atas.gs for entregue (próxima etapa) — o frontend vai combinar as
 * duas respostas.
 * @param {Object} params  { mes: 'yyyy-MM' }
 */
function getCalendarioMes(params) {
  if (!params || !params.mes) {
    return { success: false, msg: 'Informe o mês no formato yyyy-MM.' };
  }

  const partes = params.mes.split('-').map(Number);
  const ano = partes[0], mesNumero = partes[1];
  if (!ano || !mesNumero) return { success: false, msg: 'Mês inválido: "' + params.mes + '".' };

  const atividadesRelevantes = sheetToObjects_(SHEETS.rotina_atividades).filter(function (a) {
    return campoEhVerdadeiro_(a.ativo) && (a.frequencia === 'Semanal' || a.frequencia === 'Mensal');
  });

  const ultimoDiaDoMes = new Date(ano, mesNumero, 0).getDate();
  const eventosPorDia = {};

  for (let dia = 1; dia <= ultimoDiaDoMes; dia++) {
    const dataObj = new Date(ano, mesNumero - 1, dia, 12, 0, 0);
    atividadesRelevantes.forEach(function (a) {
      if (atividadeAplicaNaData_(a, dataObj)) {
        if (!eventosPorDia[dia]) eventosPorDia[dia] = [];
        eventosPorDia[dia].push({
          tipo: a.frequencia === 'Semanal' ? 'semanal' : 'mensal',
          titulo: a.titulo,
          atividade_id: a.id
        });
      }
    });
  }

  return { success: true, mes: params.mes, eventos: eventosPorDia };
}


/* ============================================================================
 * 5. ADERÊNCIA MENSAL
 * ========================================================================= */

/**
 * Recalcula, para cada atividade ativa, quantas vezes ela DEVERIA ter sido
 * feita no mês (esperado, usando atividadeAplicaNaData_) x quantas vezes foi
 * realmente marcada "Feito" (realizado), e grava o resultado na aba
 * ROTINA_ADERENCIA. Marcações "N/A" são descontadas do "esperado" (não
 * penalizam a aderência — é assim que resolvemos o pedido de status N/A).
 *
 * Para meses PASSADOS, conta o mês inteiro. Para o mês ATUAL, conta só até
 * hoje (não faz sentido cobrar aderência de dias que ainda não chegaram).
 *
 * @param {string} mes  'yyyy-MM'. Se omitido, usa o mês atual.
 */
function recalcularAderencia_(mes) {
  mes = mes || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  const partes = mes.split('-').map(Number);
  const ano = partes[0], mesNumero = partes[1];

  const atividades = sheetToObjects_(SHEETS.rotina_atividades).filter(function (a) { return campoEhVerdadeiro_(a.ativo); });
  const historicoDoMes = sheetToObjects_(SHEETS.rotina_historico).filter(function (h) {
    return String(h.data).split('T')[0].indexOf(mes) === 0;
  });

  const hoje = new Date();
  const ehMesAtual = hoje.getFullYear() === ano && (hoje.getMonth() + 1) === mesNumero;
  const ultimoDiaDoMes = new Date(ano, mesNumero, 0).getDate();
  const diaLimite = ehMesAtual ? hoje.getDate() : ultimoDiaDoMes;

  const resultados = atividades.map(function (atividade) {
    let esperado = 0;
    for (let dia = 1; dia <= diaLimite; dia++) {
      const dataObj = new Date(ano, mesNumero - 1, dia, 12, 0, 0);
      if (atividadeAplicaNaData_(atividade, dataObj)) esperado++;
    }

    const registrosDaAtividade = historicoDoMes.filter(function (h) { return String(h.atividade_id) === String(atividade.id); });
    const feitos = registrosDaAtividade.filter(function (h) { return h.status === 'Feito'; }).length;
    const naoSeAplica = registrosDaAtividade.filter(function (h) { return h.status === 'N/A'; }).length;

    const esperadoAjustado = Math.max(0, esperado - naoSeAplica);
    const aderenciaPct = esperadoAjustado > 0 ? Math.min(100, Math.round((feitos / esperadoAjustado) * 100)) : 100;

    return {
      atividade_id: atividade.id,
      titulo: atividade.titulo,
      frequencia: atividade.frequencia,
      mes: mes,
      esperado: esperadoAjustado,
      realizado: feitos,
      aderencia_pct: aderenciaPct + '%',
      calculado_em: new Date()
    };
  });

  // Grava (ou atualiza) cada resultado na aba ROTINA_ADERENCIA
  const aba = getOrCreateSheet_(SHEETS.rotina_aderencia, HEADERS.rotina_aderencia);
  const dados = aba.getDataRange().getValues();
  const headerAtual = dados[0].map(String);
  const idxAtividadeId = headerAtual.indexOf('atividade_id');
  const idxMes = headerAtual.indexOf('mes');

  resultados.forEach(function (r) {
    let jaAtualizou = false;
    for (let i = 1; i < dados.length; i++) {
      if (String(dados[i][idxAtividadeId]) === String(r.atividade_id) && String(dados[i][idxMes]) === mes) {
        aba.getRange(i + 1, 1, 1, HEADERS.rotina_aderencia.length).setValues([[
          r.atividade_id, r.titulo, r.frequencia, r.mes, r.esperado, r.realizado, r.aderencia_pct, r.calculado_em
        ]]);
        jaAtualizou = true;
        break;
      }
    }
    if (!jaAtualizou) {
      appendObjectRow_(SHEETS.rotina_aderencia, HEADERS.rotina_aderencia, r);
    }
  });

  return { success: true, msg: 'Aderência de ' + mes + ' recalculada.', resultados: resultados };
}

/** Lê a aderência já calculada de um mês (yyyy-MM). Se não informar, usa o mês atual. */
function getRotinaAderencia(params) {
  const mes = (params && params.mes) ? params.mes : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  const linhas = sheetToObjects_(SHEETS.rotina_aderencia).filter(function (r) { return String(r.mes) === mes; });
  return { success: true, mes: mes, aderencia: linhas };
}
