function teste1() {
  const med = salvarMedicaoApresentada_({ obra:'Obra Teste', numero_bm:'BM-001', competencia:'2026-07', valor_apresentado: 50000, data_apresentado:'2026-07-10' });
  Logger.log(med); // guarda o "id" que aparece aqui

  Logger.log(salvarMedicaoValidada_({ id: med.id, valor_validado: 48000, data_validado:'2026-07-15' }));
  Logger.log(getMedicoes({ obra:'Obra Teste' })); // status deve estar "Validada"

  Logger.log(salvarMedicaoFaturada_({ id: med.id, valor_faturado: 48000, data_faturado:'2026-07-20' }));
  Logger.log(getMedicoes({ obra:'Obra Teste' })); // status agora "Faturada"

  Logger.log(getDashboard()); // total_faturado da Obra Teste deve ser 48000 agora
}

function teste2() {
  const adt = salvarAditivo_({ obra:'Obra Teste', numero:'ADT-01', descricao:'Ampliação do escopo', valor_original: 15000 });
  Logger.log(adt);

  // Tentar pular etapa direto pra Liberado -> deve DAR ERRO (proteção funcionando)
  Logger.log(avancarStatusAditivo_({ id: adt.id, novo_status: 'Liberado' }));

  // Caminho certo, valor mantido
  Logger.log(avancarStatusAditivo_({ id: adt.id, novo_status: 'Análise diretoria', manteve_valor: true }));

  // Valor mudou nesta etapa
  Logger.log(avancarStatusAditivo_({ id: adt.id, novo_status: 'Aprovado diretoria', manteve_valor: false, valor_ajustado: 14200 }));

  // Tentar criar um 2º aditivo pra mesma obra -> deve DAR ERRO (regra de 1 por obra)
  Logger.log(salvarAditivo_({ obra:'Obra Teste', descricao:'Outro aditivo', valor_original: 5000 }));

  Logger.log(getAditivos({ obra: 'Obra Teste' }));
  Logger.log(getFluxoAditivos());
}
