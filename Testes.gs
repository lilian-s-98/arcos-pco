function teste() {
  const med = salvarMedicaoApresentada_({ obra:'Obra Teste', numero_bm:'BM-001', competencia:'2026-07', valor_apresentado: 50000, data_apresentado:'2026-07-10' });
  Logger.log(med); // guarda o "id" que aparece aqui

  Logger.log(salvarMedicaoValidada_({ id: med.id, valor_validado: 48000, data_validado:'2026-07-15' }));
  Logger.log(getMedicoes({ obra:'Obra Teste' })); // status deve estar "Validada"

  Logger.log(salvarMedicaoFaturada_({ id: med.id, valor_faturado: 48000, data_faturado:'2026-07-20' }));
  Logger.log(getMedicoes({ obra:'Obra Teste' })); // status agora "Faturada"

  Logger.log(getDashboard()); // total_faturado da Obra Teste deve ser 48000 agora
}
